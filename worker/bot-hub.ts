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

const MAX_MESSAGES_PER_CHAT = 500;
const MAX_LOG = 300;
const MAX_RAW = 300;
const MAX_QUERIES = 200;

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

interface MetaRow extends Record<string, SqlStorageValue> {
  value: string;
}

interface ChatRow extends Record<string, SqlStorageValue> {
  chat_id: string;
  data: string;
}

interface MessageRow extends Record<string, SqlStorageValue> {
  chat_id: string;
  data: string;
}

interface DataRow extends Record<string, SqlStorageValue> {
  data: string;
}

interface MessageKeyRow extends Record<string, SqlStorageValue> {
  message_key: string;
  data: string;
}

export class BotHub extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      this.migrate();
    });
  }

  private migrate(): void {
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
        id INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chats (
        chat_id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        last_activity INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS messages (
        chat_id TEXT NOT NULL,
        message_key TEXT NOT NULL,
        seq INTEGER NOT NULL,
        date INTEGER NOT NULL,
        data TEXT NOT NULL,
        PRIMARY KEY (chat_id, message_key)
      );
      CREATE INDEX IF NOT EXISTS messages_chat_seq ON messages(chat_id, seq);
      CREATE TABLE IF NOT EXISTS queries (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS queries_at ON queries(at DESC);
      CREATE TABLE IF NOT EXISTS raw_updates (
        update_id INTEGER PRIMARY KEY,
        at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS raw_updates_at ON raw_updates(at DESC);
      CREATE TABLE IF NOT EXISTS api_log (
        id TEXT PRIMARY KEY,
        at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS api_log_at ON api_log(at DESC);
      CREATE TABLE IF NOT EXISTS avatars (
        avatar_key TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        data TEXT NOT NULL
      );
      INSERT OR IGNORE INTO _sql_schema_migrations (id, applied_at) VALUES (1, unixepoch());
    `);
  }

  private readMeta<T>(key: string, fallback: T): T {
    const row = this.ctx.storage.sql
      .exec<MetaRow>("SELECT value FROM meta WHERE key = ?", key)
      .toArray()[0];
    if (!row) return fallback;
    try {
      return JSON.parse(row.value) as T;
    } catch {
      return fallback;
    }
  }

  private writeMeta(key: string, value: unknown): void {
    this.ctx.storage.sql.exec(
      "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value)
    );
  }

  private nextSequence(): number {
    const next = this.readMeta("sequence", 0) + 1;
    this.writeMeta("sequence", next);
    return next;
  }

  private emit(event: StreamEvent): void {
    const frame = JSON.stringify(event);
    for (const socket of this.ctx.getWebSockets()) {
      try {
        socket.send(frame);
      } catch {
        // Cloudflare removes disconnected sockets from getWebSockets().
      }
    }
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server, ["dashboard"]);
    server.serializeAttachment({ connectedAt: Date.now() });
    server.send(JSON.stringify({ type: "snapshot", data: this.snapshot() } satisfies StreamEvent));
    return new Response(null, { status: 101, webSocket: client });
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

  getSnapshotJson(): string {
    return JSON.stringify(this.snapshot());
  }

  getAvatarJson(avatarKey: string): string {
    const row = this.ctx.storage.sql
      .exec<DataRow>("SELECT data FROM avatars WHERE avatar_key = ? AND expires_at > ?", avatarKey, Date.now())
      .toArray()[0];
    return row?.data || "null";
  }

  setAvatarJson(avatarKey: string, dataJson: string, expiresAt: number): void {
    this.ctx.storage.sql.exec(
      `INSERT INTO avatars (avatar_key, expires_at, data) VALUES (?, ?, ?)
       ON CONFLICT(avatar_key) DO UPDATE SET expires_at = excluded.expires_at, data = excluded.data`,
      avatarKey,
      expiresAt,
      dataJson
    );
  }

  private snapshot(): AppSnapshot {
    const messages: Record<string, StoredMessage[]> = {};
    for (const row of this.ctx.storage.sql
      .exec<MessageRow>("SELECT chat_id, data FROM messages ORDER BY chat_id, seq")
      .toArray()) {
      (messages[row.chat_id] ||= []).push(JSON.parse(row.data) as StoredMessage);
    }

    const lastError = this.readMeta<string | null>("webhook_error", null);
    return {
      me: this.readMeta<TgUser | null>("me", null),
      chats: this.ctx.storage.sql
        .exec<ChatRow>("SELECT chat_id, data FROM chats ORDER BY last_activity DESC")
        .toArray()
        .map((row) => JSON.parse(row.data) as ChatEntry),
      messages,
      queries: this.ctx.storage.sql
        .exec<DataRow>("SELECT data FROM queries ORDER BY at DESC LIMIT ?", MAX_QUERIES)
        .toArray()
        .map((row) => JSON.parse(row.data) as PendingQuery),
      rawUpdates: this.ctx.storage.sql
        .exec<DataRow>("SELECT data FROM raw_updates ORDER BY at DESC LIMIT ?", MAX_RAW)
        .toArray()
        .map((row) => JSON.parse(row.data) as TgUpdate),
      polling: {
        running: this.readMeta("webhook_running", true),
        offset: null,
        lastError,
        lastPollAt: this.readMeta<number | null>("last_update_at", null),
        updatesSeen: this.readMeta("updates_seen", 0),
      },
      log: this.ctx.storage.sql
        .exec<DataRow>("SELECT data FROM api_log ORDER BY at DESC LIMIT ?", MAX_LOG)
        .toArray()
        .map((row) => JSON.parse(row.data) as LogEntry),
    };
  }

  setMeJson(userJson: string): void {
    this.setMe(JSON.parse(userJson) as TgUser);
  }

  private setMe(user: TgUser): void {
    this.writeMeta("me", user);
    this.emit({ type: "snapshot", data: this.snapshot() });
  }

  setWebhookState(running: boolean, error: string | null): void {
    this.writeMeta("webhook_running", running);
    this.writeMeta("webhook_error", error);
    this.emit({ type: "polling", polling: this.snapshot().polling });
  }

  markRead(chatId: string): void {
    const entry = this.readChat(chatId);
    if (!entry || entry.unread === 0) return;
    entry.unread = 0;
    this.saveChat(entry);
    this.emit({ type: "chat", chat: entry });
  }

  clearStore(): void {
    this.ctx.storage.sql.exec(`
      DELETE FROM chats;
      DELETE FROM messages;
      DELETE FROM queries;
      DELETE FROM raw_updates;
      DELETE FROM api_log;
      DELETE FROM avatars;
      DELETE FROM meta WHERE key IN ('sequence', 'updates_seen', 'last_update_at');
    `);
    this.emit({ type: "snapshot", data: this.snapshot() });
  }

  recordTelegramCallJson(
    method: string,
    paramsJson: string,
    responseJson: string,
    elapsedMs: number
  ): void {
    this.recordTelegramCall(
      method,
      JSON.parse(paramsJson) as TelegramParams,
      JSON.parse(responseJson) as TelegramResponse,
      elapsedMs
    );
  }

  private recordTelegramCall(
    method: string,
    params: TelegramParams,
    response: TelegramResponse,
    elapsedMs: number
  ): void {
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
          ? "[sensitive result shown once in the Console only]"
          : redactForLog(response.result)
        : undefined,
      error: response.ok ? undefined : response.description,
      ms: elapsedMs,
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO api_log (id, at, data) VALUES (?, ?, ?)",
      entry.id,
      entry.at,
      JSON.stringify(entry)
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM api_log WHERE id NOT IN (SELECT id FROM api_log ORDER BY at DESC LIMIT ?)",
      MAX_LOG
    );
    this.emit({ type: "log", entry });
  }

  absorbTelegramResultJson(
    method: string,
    paramsJson: string,
    resultJson: string,
    metaJson: string
  ): void {
    this.absorbTelegramResult(
      method,
      JSON.parse(paramsJson) as TelegramParams,
      JSON.parse(resultJson) as unknown,
      JSON.parse(metaJson) as Record<string, unknown>
    );
  }

  private absorbTelegramResult(
    method: string,
    params: TelegramParams,
    result: unknown,
    meta: Record<string, unknown> = {}
  ): void {
    if (method === "getMe" && isUser(result)) {
      this.setMe(result);
      return;
    }

    if (method === "getChat" && isChat(result)) {
      const entry = this.upsertChat(result);
      this.emit({ type: "chat", chat: entry });
      return;
    }

    if (method === "setWebhook") {
      this.setWebhookState(true, null);
    } else if (method === "deleteWebhook") {
      this.setWebhookState(false, "Telegram webhook removed; restore it from the Webhook panel");
    }

    if (method === "deleteEphemeralMessage") {
      const chatId = String(params.chat_id ?? "");
      const ephemeralId = Number(params.ephemeral_message_id);
      if (chatId && Number.isSafeInteger(ephemeralId)) {
        this.deleteMessageByKey(chatId, `e:${ephemeralId}`, 0);
      }
    } else if (method.startsWith("delete") && /Message/.test(method)) {
      const chatId = String(meta.deleteChatId ?? params.chat_id ?? "");
      const ids = messageIds(meta.deleteMessageIds ?? params.message_ids ?? params.message_id);
      for (const id of ids) this.deleteMessage(chatId, id);
    }

    if (method.startsWith("editEphemeralMessage")) {
      this.applyEphemeralEdit(method, params);
    }

    if (typeof meta.queryLocalId === "string") this.answerQuery(meta.queryLocalId);

    for (const message of topLevelMessages(result)) this.putMessage(message, false, false);
  }

  ingestUpdateJson(updateJson: string): void {
    this.ingestUpdate(JSON.parse(updateJson) as TgUpdate);
  }

  private ingestUpdate(update: TgUpdate): void {
    if (!Number.isSafeInteger(update.update_id)) return;
    const inserted = this.ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO raw_updates (update_id, at, data) VALUES (?, ?, ?)",
      update.update_id,
      Date.now(),
      JSON.stringify(update)
    );
    if (inserted.rowsWritten === 0) return;

    this.ctx.storage.sql.exec(
      "DELETE FROM raw_updates WHERE update_id NOT IN (SELECT update_id FROM raw_updates ORDER BY at DESC LIMIT ?)",
      MAX_RAW
    );
    this.writeMeta("updates_seen", this.readMeta("updates_seen", 0) + 1);
    this.writeMeta("last_update_at", Date.now());
    this.writeMeta("webhook_running", true);
    this.writeMeta("webhook_error", null);
    this.emit({ type: "raw", update });

    for (const key of MESSAGE_KEYS) {
      const candidate = update[key];
      if (isMessage(candidate)) {
        if (key === "guest_message" && candidate.guest_query_id) {
          this.addQuery("guest_message", candidate);
          this.emit({ type: "polling", polling: this.snapshot().polling });
          return;
        }
        this.putMessage(candidate, true, false);
        this.emit({ type: "polling", polling: this.snapshot().polling });
        return;
      }
    }

    for (const key of EDIT_KEYS) {
      const candidate = update[key];
      if (isMessage(candidate)) {
        this.putMessage(candidate, true, true);
        this.emit({ type: "polling", polling: this.snapshot().polling });
        return;
      }
    }

    if (isRecord(update.deleted_business_messages)) {
      const deleted = update.deleted_business_messages;
      const chat = isChat(deleted.chat) ? deleted.chat : null;
      if (chat && Array.isArray(deleted.message_ids)) {
        for (const id of deleted.message_ids) {
          if (typeof id === "number") this.deleteMessage(String(chat.id), id);
        }
      }
      return;
    }

    if (isRecord(update.message_reaction)) {
      const reaction = update.message_reaction;
      const reactionChat = reaction.chat;
      if (!isChat(reactionChat)) return;
      const chatId = String(reactionChat.id);
      const messageId = typeof reaction.message_id === "number" ? reaction.message_id : 0;
      const stored = this.readMessage(chatId, `m:${messageId}`);
      if (stored) {
        stored._reactions = Array.isArray(reaction.new_reaction)
          ? reaction.new_reaction.map((item) => ({ ...(isRecord(item) ? item : {}), user: reaction.user }))
          : [];
        this.saveMessage(chatId, stored);
        this.emit({ type: "message_edited", chatId, message: stored });
      }
      this.addQuery("message_reaction", reaction);
      return;
    }

    if (update.poll && isRecord(update.poll)) {
      const pollId = update.poll.id;
      if (typeof pollId === "string") {
        const rows = this.ctx.storage.sql
          .exec<MessageRow>(
            "SELECT chat_id, data FROM messages WHERE json_extract(data, '$.poll.id') = ?",
            pollId
          )
          .toArray();
        for (const row of rows) {
          const message = JSON.parse(row.data) as StoredMessage;
          message.poll = update.poll;
          this.saveMessage(row.chat_id, message);
          this.emit({ type: "message_edited", chatId: row.chat_id, message });
        }
      }
      this.addQuery("other", { poll: update.poll });
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
      if (chat) {
        const entry = this.upsertChat(chat);
        const user = isUser(payload.from) ? payload.from : isUser(payload.user) ? payload.user : null;
        if (user) entry.knownUsers[String(user.id)] = user;
        this.saveChat(entry);
        this.emit({ type: "chat", chat: entry });
      }
      this.addQuery(queryKind(key), payload);
      return;
    }

    if (isRecord(update.message_reaction_count)) {
      this.addQuery("message_reaction_count", update.message_reaction_count);
      return;
    }
    this.addQuery("other", update);
  }

  private readChat(chatId: string): ChatEntry | undefined {
    const row = this.ctx.storage.sql
      .exec<ChatRow>("SELECT chat_id, data FROM chats WHERE chat_id = ?", chatId)
      .toArray()[0];
    return row ? (JSON.parse(row.data) as ChatEntry) : undefined;
  }

  private saveChat(entry: ChatEntry): void {
    const chatId = String(entry.chat.id);
    this.ctx.storage.sql.exec(
      `INSERT INTO chats (chat_id, data, last_activity) VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET data = excluded.data, last_activity = excluded.last_activity`,
      chatId,
      JSON.stringify(entry),
      entry.lastActivity
    );
  }

  private upsertChat(chat: TgChat): ChatEntry {
    const chatId = String(chat.id);
    const existing = this.readChat(chatId);
    const entry: ChatEntry = existing
      ? { ...existing, chat: { ...existing.chat, ...chat } }
      : { chat, lastActivity: Date.now(), unread: 0, knownUsers: {} };
    this.saveChat(entry);
    return entry;
  }

  private readMessage(chatId: string, key: string): StoredMessage | undefined {
    const row = this.ctx.storage.sql
      .exec<MessageKeyRow>(
        "SELECT message_key, data FROM messages WHERE chat_id = ? AND message_key = ?",
        chatId,
        key
      )
      .toArray()[0];
    return row ? (JSON.parse(row.data) as StoredMessage) : undefined;
  }

  private saveMessage(chatId: string, message: StoredMessage): void {
    const key = storedMessageKey(message);
    message._key = key;
    this.ctx.storage.sql.exec(
      `INSERT INTO messages (chat_id, message_key, seq, date, data) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(chat_id, message_key) DO UPDATE SET date = excluded.date, data = excluded.data`,
      chatId,
      key,
      message._seq,
      message.date,
      JSON.stringify(message)
    );
  }

  private putMessage(message: TgMessage, incoming: boolean, edited: boolean): void {
    const chatId = String(message.chat.id);
    const entry = this.upsertChat(message.chat);
    const key = storedMessageKey(message);
    const existing = this.readMessage(chatId, key);
    const stored: StoredMessage = {
      ...existing,
      ...message,
      _key: key,
      _seq: existing?._seq ?? this.nextSequence(),
    };
    this.saveMessage(chatId, stored);
    this.ctx.storage.sql.exec(
      `DELETE FROM messages WHERE chat_id = ? AND message_key NOT IN (
         SELECT message_key FROM messages WHERE chat_id = ? ORDER BY seq DESC LIMIT ?
       )`,
      chatId,
      chatId,
      MAX_MESSAGES_PER_CHAT
    );

    entry.lastMessage = stored;
    entry.lastActivity = Date.now();
    if (incoming && isUser(message.from) && !message.from.is_bot) {
      entry.knownUsers[String(message.from.id)] = message.from;
    }
    if (incoming && !edited && !existing) entry.unread += 1;
    this.saveChat(entry);
    this.emit({ type: edited || existing ? "message_edited" : "message", chatId, message: stored });
    this.emit({ type: "chat", chat: entry });
  }

  private deleteMessage(chatId: string, messageId: number): void {
    this.deleteMessageByKey(chatId, `m:${messageId}`, messageId);
  }

  private deleteMessageByKey(chatId: string, key: string, messageId: number): void {
    this.ctx.storage.sql.exec(
      "DELETE FROM messages WHERE chat_id = ? AND message_key = ?",
      chatId,
      key
    );
    const entry = this.readChat(chatId);
    if (entry?.lastMessage && storedMessageKey(entry.lastMessage) === key) {
      const next = this.ctx.storage.sql
        .exec<DataRow>("SELECT data FROM messages WHERE chat_id = ? ORDER BY seq DESC LIMIT 1", chatId)
        .toArray()[0];
      entry.lastMessage = next ? (JSON.parse(next.data) as StoredMessage) : undefined;
      entry.lastActivity = entry.lastMessage?.date ? entry.lastMessage.date * 1000 : Date.now();
      this.saveChat(entry);
      this.emit({ type: "chat", chat: entry });
    }
    this.emit({ type: "message_deleted", chatId, messageId, messageKey: key });
  }

  private applyEphemeralEdit(method: string, params: TelegramParams): void {
    const chatId = String(params.chat_id ?? "");
    const ephemeralId = Number(params.ephemeral_message_id);
    if (!chatId || !Number.isSafeInteger(ephemeralId)) return;
    const stored = this.readMessage(chatId, `e:${ephemeralId}`);
    if (!stored) return;

    if (method === "editEphemeralMessageText" && typeof params.text === "string") {
      stored.text = params.text;
      stored.entities = Array.isArray(params.entities) ? params.entities : undefined;
      delete stored.caption;
      delete stored.caption_entities;
    } else if (method === "editEphemeralMessageCaption") {
      stored.caption = typeof params.caption === "string" ? params.caption : undefined;
      stored.caption_entities = Array.isArray(params.caption_entities)
        ? params.caption_entities
        : undefined;
    } else if (method === "editEphemeralMessageMedia" && isRecord(params.media)) {
      const media = params.media;
      const type = typeof media.type === "string" ? media.type : "";
      const supported = ["animation", "audio", "document", "photo", "video", "live_photo"];
      if (supported.includes(type) && typeof media.media === "string") {
        for (const key of supported) delete stored[key];
        stored[type] = type === "photo"
          ? [{ file_id: media.media, file_unique_id: media.media, width: 0, height: 0 }]
          : { file_id: media.media, file_unique_id: media.media };
      }
    }

    if ("reply_markup" in params) {
      stored.reply_markup = isRecord(params.reply_markup) ? params.reply_markup : undefined;
    }
    this.saveMessage(chatId, stored);
    this.emit({ type: "message_edited", chatId, message: stored });
  }

  private addQuery(kind: PendingQuery["kind"], payload: Record<string, unknown>): void {
    const remoteId = payload.id ?? payload.guest_query_id ?? payload.query_id;
    const query: PendingQuery = {
      id: `${kind}-${typeof remoteId === "string" || typeof remoteId === "number" ? remoteId : crypto.randomUUID()}`,
      kind,
      at: Date.now(),
      payload,
    };
    this.ctx.storage.sql.exec(
      "INSERT OR REPLACE INTO queries (id, at, data) VALUES (?, ?, ?)",
      query.id,
      query.at,
      JSON.stringify(query)
    );
    this.ctx.storage.sql.exec(
      "DELETE FROM queries WHERE id NOT IN (SELECT id FROM queries ORDER BY at DESC LIMIT ?)",
      MAX_QUERIES
    );
    this.emit({ type: "query", query });
  }

  private answerQuery(id: string): void {
    const row = this.ctx.storage.sql
      .exec<DataRow>("SELECT data FROM queries WHERE id = ?", id)
      .toArray()[0];
    if (!row) return;
    const query = JSON.parse(row.data) as PendingQuery;
    query.answered = true;
    this.ctx.storage.sql.exec("UPDATE queries SET data = ? WHERE id = ?", JSON.stringify(query), id);
    this.emit({ type: "query_answered", id });
  }
}

function isUser(value: unknown): value is TgUser {
  return isRecord(value) && typeof value.id === "number" && typeof value.is_bot === "boolean";
}

function isChat(value: unknown): value is TgChat {
  return isRecord(value) && typeof value.id === "number" && typeof value.type === "string";
}

function isMessage(value: unknown): value is TgMessage {
  return (
    isRecord(value) &&
    typeof value.message_id === "number" &&
    typeof value.date === "number" &&
    isChat(value.chat)
  );
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
