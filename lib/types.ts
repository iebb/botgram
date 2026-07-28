/**
 * Loose Telegram Bot API shapes. We deliberately keep these permissive: the Bot
 * API adds fields constantly and this app is meant to surface whatever comes
 * back, not to gate on a hand-maintained type mirror.
 */
export type TgAny = Record<string, any>;

export interface TgUser {
  id: number;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  [k: string]: any;
}

export interface TgChat {
  id: number;
  type: "private" | "group" | "supergroup" | "channel";
  title?: string;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_forum?: boolean;
  [k: string]: any;
}

export interface TgMessage {
  message_id: number;
  message_thread_id?: number;
  from?: TgUser;
  sender_chat?: TgChat;
  date: number;
  chat: TgChat;
  text?: string;
  caption?: string;
  entities?: TgAny[];
  caption_entities?: TgAny[];
  reply_markup?: TgAny;
  [k: string]: any;
}

export interface TgUpdate {
  update_id: number;
  [k: string]: any;
}

/** A message held in browser state, plus local bookkeeping. */
export interface StoredMessage extends TgMessage {
  /** local: stable key; ephemeral messages have message_id=0 and need their own identity */
  _key?: string;
  /** local: message was deleted through the UI (Bot API gives no delete event) */
  _deleted?: boolean;
  /** local: reaction totals observed through individual and aggregate reaction updates */
  _reactions?: TgAny[];
  /** local: the bot's last reaction selection, used to apply its optimistic count delta once */
  _botReactions?: TgAny[];
  /** local: monotonically increasing ingest sequence, for stable sorting */
  _seq: number;
}

export interface ChatEntry {
  chat: TgChat;
  lastMessage?: StoredMessage;
  lastActivity: number;
  unread: number;
  /** members we've seen speak in this chat, keyed by user id */
  knownUsers: Record<string, TgUser>;
  pinned?: boolean;
}

/** An update that needs an answer from the bot (callback/inline/shipping/etc). */
export interface PendingQuery {
  id: string;
  kind:
    | "callback_query"
    | "inline_query"
    | "chosen_inline_result"
    | "shipping_query"
    | "pre_checkout_query"
    | "chat_join_request"
    | "poll_answer"
    | "my_chat_member"
    | "chat_member"
    | "chat_boost"
    | "removed_chat_boost"
    | "message_reaction"
    | "message_reaction_count"
    | "purchased_paid_media"
    | "business_connection"
    | "guest_message"
    | "managed_bot"
    | "subscription"
    | "other";
  at: number;
  answered?: boolean;
  payload: TgAny;
}

export interface AppSnapshot {
  me: TgUser | null;
  chats: ChatEntry[];
  messages: Record<string, StoredMessage[]>;
  queries: PendingQuery[];
  rawUpdates: TgUpdate[];
  polling: {
    running: boolean;
    offset: number | null;
    lastError: string | null;
    lastPollAt: number | null;
    updatesSeen: number;
  };
  log: LogEntry[];
}

export interface LogEntry {
  id: string;
  at: number;
  direction: "out" | "in";
  method: string;
  params?: TgAny;
  ok?: boolean;
  result?: any;
  error?: string;
  ms?: number;
}

export type StreamEvent =
  | { type: "ready" }
  | { type: "clear" }
  | { type: "snapshot"; data: AppSnapshot }
  | { type: "message"; chatId: string; message: StoredMessage }
  | { type: "message_edited"; chatId: string; message: StoredMessage }
  | { type: "message_patch"; chatId: string; messageKey: string; patch: TgAny }
  | { type: "message_deleted"; chatId: string; messageId: number; messageKey?: string }
  | {
      type: "reaction";
      chatId: string;
      messageId: number;
      reactions: TgAny[];
      oldReactions?: TgAny[];
      replace?: boolean;
      /** local: this change represents the bot's own setMessageReaction call */
      own?: boolean;
      /** stable browser/update identity used for frequency accounting */
      observationId?: string;
    }
  | { type: "poll_update"; poll: TgAny }
  | { type: "chat"; chat: ChatEntry }
  | { type: "query"; query: PendingQuery }
  | { type: "query_answered"; id: string }
  | { type: "polling"; polling: AppSnapshot["polling"] }
  | { type: "log"; entry: LogEntry }
  | { type: "raw"; update: TgUpdate }
  | { type: "ping" };
