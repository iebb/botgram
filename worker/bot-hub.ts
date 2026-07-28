import { DurableObject } from "cloudflare:workers";
import type {
  AppSnapshot,
  ChatEntry,
  LogEntry,
  PendingQuery,
  StoredMessage,
  StreamEvent,
  TgChat,
  TgMessage,
  TgUpdate,
  TgUser,
} from "../lib/types";
import type { TelegramParams, TelegramResponse } from "./telegram";
import { isRecord, redactForLog } from "./telegram";

const MESSAGE_KEYS = ["message", "channel_post", "business_message", "guest_message"] as const;
const EDIT_KEYS = ["edited_message", "edited_channel_post", "edited_business_message"] as const;
const QUERY_KEYS = [
  "callback_query",
  "inline_query",
  "chosen_inline_result",
  "shipping_query",
  "pre_checkout_query",
  "chat_join_request",
  "poll_answer",
  "my_chat_member",
  "chat_member",
  "chat_boost",
  "removed_chat_boost",
  "purchased_paid_media",
  "business_connection",
  "managed_bot",
  "subscription",
] as const;

/**
 * A hibernating WebSocket rendezvous point. The object intentionally does not
 * read or write Durable Object storage during normal operation: Telegram
 * updates and Bot API results are fanned out only to dashboards that are open.
 */
export class BotHub extends DurableObject<Env> {
  private sequence = 0;
  private seenUpdates = new Set<number>();
  private webhookRunning = true;
  private webhookError: string | null = null;

  private emit(event: StreamEvent): void {
    const frame = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch {
        // Disconnected sockets disappear from getWebSockets().
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }
    const clientId = new URL(request.url).searchParams.get("client") || "";
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(clientId)) {
      return new Response("A valid client id is required", { status: 400 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, ["dashboard"]);
    server.serializeAttachment({ clientId });
    server.send(JSON.stringify({ type: "ready" } satisfies StreamEvent));
    return new Response(null, { status: 101, webSocket: client });
  }

  releaseClientAndHasOthers(clientId: string): boolean {
    const sockets = this.ctx.getWebSockets();
    for (const socket of sockets) {
      const attachment: unknown = socket.deserializeAttachment();
      if (isRecord(attachment) && attachment.clientId === clientId) {
        socket.serializeAttachment({ clientId, released: true });
        socket.close(1000, "Client released");
      }
    }
    return sockets.some((socket) => {
      const attachment: unknown = socket.deserializeAttachment();
      return !isRecord(attachment) || attachment.released !== true;
    });
  }

  hasActiveClients(): boolean {
    return this.ctx.getWebSockets().some((socket) => {
      const attachment: unknown = socket.deserializeAttachment();
      return !isRecord(attachment) || attachment.released !== true;
    });
  }

  ingestUpdateIfConnectedJson(updateJson: string): boolean {
    if (!this.hasActiveClients()) return false;
    this.ingestUpdateJson(updateJson);
    return true;
  }

  webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message === "string" && message === "ping") socket.send("pong");
  }

  webSocketClose(socket: WebSocket, code: number, reason: string): void {
    socket.close(code, reason);
  }

  webSocketError(socket: WebSocket): void {
    socket.close(1011, "WebSocket error");
  }

  /** Test/diagnostic shape only; it contains no retained chats or messages. */
  getSnapshotJson(): string {
    return JSON.stringify(this.emptySnapshot());
  }

  clearSession(): void {
    this.emit({ type: "clear" });
  }

  setWebhookState(running: boolean, error: string | null): void {
    this.webhookRunning = running;
    this.webhookError = error;
    this.emitPolling();
  }

  recordTelegramCallJson(
    method: string,
    paramsJson: string,
    responseJson: string,
    elapsedMs: number
  ): void {
    const params = JSON.parse(paramsJson) as TelegramParams;
    const response = JSON.parse(responseJson) as TelegramResponse;
    const sensitiveResult = /(?:ManagedBotToken|replaceManagedBotToken)/.test(method);
    const entry: LogEntry = {
      id: crypto.randomUUID(),
      at: Date.now(),
      direction: "out",
      method,
      params: redactForLog(params) as Record<string, unknown>,
      ok: response.ok,
      result: response.ok
        ? sensitiveResult
          ? "[sensitive response omitted from the session log]"
          : redactForLog(response.result)
        : undefined,
      error: response.ok ? undefined : response.description,
      ms: elapsedMs,
    };
    this.emit({ type: "log", entry });
  }

  absorbTelegramResultJson(
    method: string,
    paramsJson: string,
    resultJson: string,
    metaJson: string
  ): void {
    const params = JSON.parse(paramsJson) as TelegramParams;
    const result = JSON.parse(resultJson) as unknown;
    const meta = JSON.parse(metaJson) as Record<string, unknown>;

    if (method === "getChat" && isChat(result)) {
      this.emit({ type: "chat", chat: chatEntry(result) });
    }

    if (method === "setWebhook") this.setWebhookState(true, null);
    if (method === "deleteWebhook") {
      this.setWebhookState(false, "Telegram webhook removed; restore it from the Webhook panel");
    }

    if (method === "deleteEphemeralMessage") {
      const chatId = String(params.chat_id ?? "");
      const ephemeralId = Number(params.ephemeral_message_id);
      if (chatId && Number.isSafeInteger(ephemeralId)) {
        this.emit({ type: "message_deleted", chatId, messageId: 0, messageKey: `e:${ephemeralId}` });
      }
    } else if (method.startsWith("delete") && /Message/.test(method)) {
      const chatId = String(meta.deleteChatId ?? params.chat_id ?? "");
      for (const id of messageIds(meta.deleteMessageIds ?? params.message_ids ?? params.message_id)) {
        this.emit({ type: "message_deleted", chatId, messageId: id, messageKey: `m:${id}` });
      }
    }

    if (method.startsWith("editEphemeralMessage")) this.emitEphemeralPatch(method, params);
    if (typeof meta.queryLocalId === "string") {
      this.emit({ type: "query_answered", id: meta.queryLocalId });
    }

    for (const message of topLevelMessages(result)) this.emitMessage(message, false, false);
  }

  ingestUpdateJson(updateJson: string): void {
    const update = JSON.parse(updateJson) as TgUpdate;
    if (!Number.isSafeInteger(update.update_id) || this.seenUpdates.has(update.update_id)) return;

    this.seenUpdates.add(update.update_id);
    if (this.seenUpdates.size > 512) {
      const oldest = this.seenUpdates.values().next().value;
      if (typeof oldest === "number") this.seenUpdates.delete(oldest);
    }
    this.webhookRunning = true;
    this.webhookError = null;
    this.emit({ type: "raw", update });

    for (const key of MESSAGE_KEYS) {
      const candidate = update[key];
      if (!isMessage(candidate)) continue;
      if (key === "guest_message" && candidate.guest_query_id) {
        this.emitQuery("guest_message", candidate);
      } else {
        this.emitMessage(candidate, true, false);
      }
      return;
    }

    for (const key of EDIT_KEYS) {
      const candidate = update[key];
      if (!isMessage(candidate)) continue;
      this.emitMessage(candidate, true, true);
      return;
    }

    if (isRecord(update.deleted_business_messages)) {
      const deleted = update.deleted_business_messages;
      if (isChat(deleted.chat) && Array.isArray(deleted.message_ids)) {
        for (const id of deleted.message_ids) {
          if (typeof id === "number") {
            this.emit({
              type: "message_deleted",
              chatId: String(deleted.chat.id),
              messageId: id,
              messageKey: `m:${id}`,
            });
          }
        }
      }
      return;
    }

    const reaction = update.message_reaction;
    if (isRecord(reaction) && isChat(reaction.chat)) {
      const reactionChat = reaction.chat;
      const reactions = Array.isArray(reaction.new_reaction)
        ? reaction.new_reaction.map((item) => ({
            ...(isRecord(item) ? item : {}),
            user: reaction.user,
          }))
        : [];
      this.emit({
        type: "reaction",
        chatId: String(reactionChat.id),
        messageId: typeof reaction.message_id === "number" ? reaction.message_id : 0,
        reactions,
      });
      this.emitQuery("message_reaction", reaction);
      return;
    }

    if (isRecord(update.poll)) {
      this.emit({ type: "poll_update", poll: update.poll });
      this.emitQuery("other", { poll: update.poll });
      return;
    }

    for (const key of QUERY_KEYS) {
      const payload = update[key];
      if (!isRecord(payload)) continue;
      const chat = isChat(payload.chat)
        ? payload.chat
        : isRecord(payload.message) && isChat(payload.message.chat)
          ? payload.message.chat
          : null;
      const user = isUser(payload.from) ? payload.from : isUser(payload.user) ? payload.user : undefined;
      if (chat) this.emit({ type: "chat", chat: chatEntry(chat, user) });
      this.emitQuery(queryKind(key), payload);
      return;
    }

    if (isRecord(update.message_reaction_count)) {
      this.emitQuery("message_reaction_count", update.message_reaction_count);
      return;
    }
    this.emitQuery("other", update);
  }

  private emptySnapshot(): AppSnapshot {
    return {
      me: null,
      chats: [],
      messages: {},
      queries: [],
      rawUpdates: [],
      polling: this.polling(),
      log: [],
    };
  }

  private polling(): AppSnapshot["polling"] {
    return {
      running: this.webhookRunning,
      offset: null,
      lastError: this.webhookError,
      lastPollAt: null,
      updatesSeen: 0,
    };
  }

  private emitPolling(): void {
    this.emit({ type: "polling", polling: this.polling() });
  }

  private emitMessage(message: TgMessage, incoming: boolean, edited: boolean): void {
    const chatId = String(message.chat.id);
    const stored: StoredMessage = {
      ...message,
      _key: storedMessageKey(message),
      _seq: ++this.sequence,
    };
    this.emit({ type: edited ? "message_edited" : "message", chatId, message: stored });
    this.emit({
      type: "chat",
      chat: chatEntry(
        message.chat,
        isUser(message.from) && !message.from.is_bot ? message.from : undefined,
        stored,
        incoming && !edited
      ),
    });
  }

  private emitEphemeralPatch(method: string, params: TelegramParams): void {
    const chatId = String(params.chat_id ?? "");
    const ephemeralId = Number(params.ephemeral_message_id);
    if (!chatId || !Number.isSafeInteger(ephemeralId)) return;
    const patch: Record<string, unknown> = {};
    if (method === "editEphemeralMessageText" && typeof params.text === "string") {
      patch.text = params.text;
      if (Array.isArray(params.entities)) patch.entities = params.entities;
    }
    if (method === "editEphemeralMessageCaption") {
      patch.caption = typeof params.caption === "string" ? params.caption : "";
      if (Array.isArray(params.caption_entities)) patch.caption_entities = params.caption_entities;
    }
    if ("reply_markup" in params) patch.reply_markup = params.reply_markup;
    if (Object.keys(patch).length) {
      this.emit({ type: "message_patch", chatId, messageKey: `e:${ephemeralId}`, patch });
    }
  }

  private emitQuery(kind: PendingQuery["kind"], payload: Record<string, unknown>): void {
    const remoteId = payload.id ?? payload.guest_query_id ?? payload.query_id;
    const query: PendingQuery = {
      id: `${kind}-${typeof remoteId === "string" || typeof remoteId === "number" ? remoteId : crypto.randomUUID()}`,
      kind,
      at: Date.now(),
      payload,
    };
    this.emit({ type: "query", query });
  }
}

function chatEntry(
  chat: TgChat,
  user?: TgUser,
  lastMessage?: StoredMessage,
  unread = false
): ChatEntry {
  return {
    chat,
    lastMessage,
    lastActivity: lastMessage?.date ? lastMessage.date * 1000 : Date.now(),
    unread: unread ? 1 : 0,
    knownUsers: user ? { [String(user.id)]: user } : {},
  };
}

function isUser(value: unknown): value is TgUser {
  return isRecord(value) && typeof value.id === "number" && typeof value.is_bot === "boolean";
}

function isChat(value: unknown): value is TgChat {
  return isRecord(value) && typeof value.id === "number" && typeof value.type === "string";
}

function isMessage(value: unknown): value is TgMessage {
  return isRecord(value) && typeof value.message_id === "number" && typeof value.date === "number" && isChat(value.chat);
}

function storedMessageKey(message: Pick<TgMessage, "message_id"> & { ephemeral_message_id?: unknown }): string {
  return typeof message.ephemeral_message_id === "number"
    ? `e:${message.ephemeral_message_id}`
    : `m:${message.message_id}`;
}

function messageIds(value: unknown): number[] {
  if (typeof value === "number") return [value];
  if (Array.isArray(value)) return value.filter((item): item is number => typeof item === "number");
  if (typeof value === "string") {
    try {
      return messageIds(JSON.parse(value));
    } catch {
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) ? [parsed] : [];
    }
  }
  return [];
}

function topLevelMessages(value: unknown): TgMessage[] {
  if (isMessage(value)) return [value];
  if (Array.isArray(value)) return value.filter(isMessage);
  if (!isRecord(value)) return [];
  if (isMessage(value.message)) return [value.message];
  if (Array.isArray(value.messages)) return value.messages.filter(isMessage);
  return [];
}

function queryKind(key: (typeof QUERY_KEYS)[number]): PendingQuery["kind"] {
  return key;
}
