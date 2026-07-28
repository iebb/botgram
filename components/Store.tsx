"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import type {
  AppSnapshot,
  ChatEntry,
  StoredMessage,
  StreamEvent,
  TgAny,
  TgChat,
  TgUser,
} from "@/lib/types";
import { avatar, polling as pollingApi, tg, tgUpload, type CallMeta, type TgResult } from "@/lib/client/api";
import {
  currentBotToken,
  botFetch,
  forgetSavedBotAccount,
  removeBotToken,
  rememberBotAccount,
  restoreBotToken,
  savedBotAccounts,
  savedBotToken,
  saveBotToken,
  validBotToken,
  type BotAccountSummary,
} from "@/lib/client/botToken";
import {
  browserStorageAvailable,
  clearDashboard,
  clearStickerLibrary,
  loadDashboard,
  loadPreference,
  loadStickerLibrary,
  saveDashboard,
  savePreference,
  saveStickerLibrary,
  type StoredDashboard,
} from "@/lib/client/indexedDb";
import {
  emptyStickerLibrary,
  ingestStickerUse,
  ingestStickerMessage,
  ingestStickerSnapshot,
  mergeStickerMetadata,
  mergeStickerSet,
  stickerMessageKey,
  stickerSetNeedsHydration,
  type StickerLibrary,
} from "@/lib/stickers";
import { applyReactionChange, collectCustomEmojiIds, normalizeReactionCounts } from "@/lib/reactions";

interface State extends AppSnapshot {
  connected: boolean;
}

const EMPTY: State = {
  me: null,
  chats: [],
  messages: {},
  queries: [],
  rawUpdates: [],
  polling: { running: false, offset: null, lastError: null, lastPollAt: null, updatesSeen: 0 },
  log: [],
  connected: false,
};

type Action =
  | { type: "event"; event: StreamEvent }
  | { type: "hydrate"; saved: AppSnapshot | null; fresh: AppSnapshot }
  | { type: "connected"; value: boolean }
  | { type: "local_read"; chatId: string }
  | { type: "reset" };

export type AuthStatus = "checking" | "required" | "authenticated";

function messageKey(message: StoredMessage): string {
  return message._key || `m:${message.message_id}`;
}

function upsertChat(chats: ChatEntry[], chat: ChatEntry): ChatEntry[] {
  const idx = chats.findIndex((c) => String(c.chat.id) === String(chat.chat.id));
  const next = idx >= 0 ? [...chats] : [chat, ...chats];
  if (idx >= 0) {
    const current = chats[idx];
    next[idx] = {
      ...current,
      ...chat,
      chat: { ...current.chat, ...chat.chat },
      lastMessage: chat.lastMessage || current.lastMessage,
      lastActivity: Math.max(current.lastActivity, chat.lastActivity),
      unread: current.unread + chat.unread,
      knownUsers: { ...current.knownUsers, ...chat.knownUsers },
    };
  }
  return next.sort((a, b) => b.lastActivity - a.lastActivity);
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "reset":
      return EMPTY;

    case "connected":
      return { ...state, connected: action.value };

    case "hydrate": {
      const restored = action.saved || action.fresh;
      return {
        ...restored,
        me: action.fresh.me,
        polling: action.saved
          ? {
              ...action.saved.polling,
              running: action.fresh.polling.running,
              lastError: action.fresh.polling.lastError,
              offset: null,
            }
          : action.fresh.polling,
        connected: state.connected,
      };
    }

    case "local_read": {
      const chats = state.chats.map((c) =>
        String(c.chat.id) === action.chatId ? { ...c, unread: 0 } : c
      );
      return { ...state, chats };
    }

    case "event": {
      const e = action.event;
      switch (e.type) {
        case "ready":
          return { ...state, connected: true };

        case "clear":
          return {
            ...EMPTY,
            me: state.me,
            polling: { ...state.polling, lastPollAt: null, updatesSeen: 0 },
            connected: state.connected,
          };

        case "snapshot":
          return {
            ...state,
            me: e.data.me,
            polling: {
              ...e.data.polling,
              lastPollAt: state.polling.lastPollAt || e.data.polling.lastPollAt,
              updatesSeen: state.polling.updatesSeen,
            },
            connected: true,
          };

        case "message":
        case "message_edited": {
          const list = state.messages[e.chatId] || [];
          const idx = list.findIndex((m) => messageKey(m) === messageKey(e.message));
          const next = idx >= 0 ? [...list] : [...list, e.message];
          if (idx >= 0) {
            next[idx] = {
              ...e.message,
              _reactions: e.message._reactions || list[idx]._reactions,
              _botReactions: e.message._botReactions || list[idx]._botReactions,
            };
          }
          else next.sort((a, b) => a.date - b.date || a._seq - b._seq);
          return {
            ...state,
            messages: { ...state.messages, [e.chatId]: next.slice(-500) },
          };
        }

        case "message_patch": {
          const list = state.messages[e.chatId] || [];
          return {
            ...state,
            messages: {
              ...state.messages,
              [e.chatId]: list.map((message) =>
                messageKey(message) === e.messageKey ? { ...message, ...e.patch } : message
              ),
            },
          };
        }

        case "message_deleted": {
          const list = state.messages[e.chatId] || [];
          return {
            ...state,
            messages: {
              ...state.messages,
              [e.chatId]: list.filter((m) =>
                e.messageKey ? messageKey(m) !== e.messageKey : m.message_id !== e.messageId
              ),
            },
          };
        }

        case "reaction": {
          const list = state.messages[e.chatId] || [];
          return {
            ...state,
            messages: {
              ...state.messages,
              [e.chatId]: list.map((message) =>
                message.message_id === e.messageId
                  ? {
                      ...message,
                      _reactions: e.own
                        ? applyReactionChange(message._reactions, message._botReactions, e.reactions)
                        : e.replace
                          ? normalizeReactionCounts(e.reactions)
                          : applyReactionChange(message._reactions, e.oldReactions, e.reactions),
                      _botReactions: e.own ? e.reactions : message._botReactions,
                    }
                  : message
              ),
            },
          };
        }

        case "poll_update": {
          const messages = Object.fromEntries(
            Object.entries(state.messages).map(([chatId, list]) => [
              chatId,
              list.map((message) => message.poll?.id === e.poll.id ? { ...message, poll: e.poll } : message),
            ])
          );
          return { ...state, messages };
        }

        case "chat":
          return { ...state, chats: upsertChat(state.chats, e.chat) };

        case "query":
          return { ...state, queries: [e.query, ...state.queries].slice(0, 200) };

        case "query_answered":
          return {
            ...state,
            queries: state.queries.map((q) => (q.id === e.id ? { ...q, answered: true } : q)),
          };

        case "polling":
          return {
            ...state,
            polling: {
              ...e.polling,
              lastPollAt: state.polling.lastPollAt,
              updatesSeen: state.polling.updatesSeen,
            },
          };

        case "log":
          return { ...state, log: [e.entry, ...state.log].slice(0, 300) };

        case "raw":
          return {
            ...state,
            rawUpdates: [e.update, ...state.rawUpdates].slice(0, 300),
            polling: {
              ...state.polling,
              running: true,
              lastError: null,
              lastPollAt: Date.now(),
              updatesSeen: state.polling.updatesSeen + 1,
            },
          };

        default:
          return state;
      }
    }

    default:
      return state;
  }
}

export interface Toast {
  id: number;
  text: string;
  kind: "ok" | "err";
}

interface Ctx {
  state: State;
  selectedChatId: string | null;
  selectChat: (id: string | null) => void;
  chat: ChatEntry | null;
  messages: StoredMessage[];
  replyTo: StoredMessage | null;
  setReplyTo: (m: StoredMessage | null) => void;
  editing: StoredMessage | null;
  setEditing: (m: StoredMessage | null) => void;
  toasts: Toast[];
  notify: (text: string, kind?: "ok" | "err") => void;
  /** Call a Bot API method; failures are surfaced as a toast automatically. */
  call: <T = any>(method: string, params?: TgAny, meta?: CallMeta) => Promise<TgResult<T>>;
  upload: <T = any>(
    method: string,
    params?: TgAny,
    files?: Record<string, File | Blob>,
    meta?: CallMeta
  ) => Promise<TgResult<T>>;
  theme: "light" | "dark";
  setTheme: (t: "light" | "dark") => void;
  authStatus: AuthStatus;
  authBusy: boolean;
  authError: string;
  login: (token: string) => Promise<boolean>;
  botAccounts: BotAccountSummary[];
  switchAccount: (botId: string) => Promise<boolean>;
  forgetAccount: (botId: string) => void;
  logout: () => Promise<void>;
  browserStorage: "loading" | "ready" | "memory-only";
  clearBrowserHistory: () => Promise<boolean>;
  avatarFileIds: Record<string, string | null>;
  ensureAvatar: (id: number | string, kind: "user" | "chat") => void;
  refreshAvatar: (id: number | string, kind: "user" | "chat") => Promise<void>;
  stickerLibrary: StickerLibrary;
  rememberStickerSet: (set: TgAny) => void;
  refreshStickerSet: (name: string) => void;
  customEmojiStickers: Record<string, TgAny>;
  ensureCustomEmojis: (ids: string[]) => void;
  setLocalBotReaction: (
    chatId: string,
    messageId: number,
    reactions: TgAny[],
    observationId: string
  ) => void;
  /** The bot's fresh getChatMember result for the selected chat; undefined while loading. */
  botChatMember: TgAny | null | undefined;
}

const StoreCtx = createContext<Ctx | null>(null);

export function useStore(): Ctx {
  const ctx = useContext(StoreCtx);
  if (!ctx) throw new Error("useStore must be used inside <StoreProvider>");
  return ctx;
}

export function useAvatarFileId(
  entity?: TgUser | TgChat | TgAny | null,
  requestedKind?: "user" | "chat"
): string | undefined {
  const { avatarFileIds, ensureAvatar } = useStore();
  const id = entity?.id;
  const kind = requestedKind || (entity?.type && entity.type !== "private" ? "chat" : "user");
  const embedded = typeof entity?.photo?.small_file_id === "string"
    ? entity.photo.small_file_id
    : typeof entity?.photo?.big_file_id === "string"
      ? entity.photo.big_file_id
      : undefined;
  const key = id == null ? "" : `${kind}:${id}`;

  useEffect(() => {
    if (id != null && !embedded) ensureAvatar(id, kind);
  }, [id, kind, embedded, ensureAvatar]);

  return embedded || (key ? avatarFileIds[key] || undefined : undefined);
}

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, EMPTY);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<StoredMessage | null>(null);
  const [editing, setEditing] = useState<StoredMessage | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [theme, setThemeState] = useState<"light" | "dark">("dark");
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [botAccounts, setBotAccounts] = useState<BotAccountSummary[]>([]);
  const [avatarFileIds, setAvatarFileIds] = useState<Record<string, string | null>>({});
  const [browserStorage, setBrowserStorage] = useState<"loading" | "ready" | "memory-only">("loading");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const [stickerLibrary, setStickerLibrary] = useState<StickerLibrary>(() => emptyStickerLibrary(""));
  const [customEmojiStickers, setCustomEmojiStickers] = useState<Record<string, TgAny>>({});
  const [botChatMemberState, setBotChatMemberState] = useState<{
    chatId: string;
    member: TgAny | null;
  } | null>(null);
  const toastId = useRef(0);
  const avatarRequests = useRef(new Set<string>());
  const activeBotIdRef = useRef<string | null>(null);
  const selectedChatIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const pendingEvents = useRef<StreamEvent[]>([]);
  const latestStoredDashboard = useRef<StoredDashboard | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveIdleCallback = useRef<number | null>(null);
  const stickerLibraryRef = useRef<StickerLibrary>(stickerLibrary);
  const latestStoredStickerLibrary = useRef<StickerLibrary | null>(null);
  const stickerSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stickerSaveIdleCallback = useRef<number | null>(null);
  const stickerSetRequests = useRef(new Set<string>());
  const customEmojiStickersRef = useRef<Record<string, TgAny>>({});
  const customEmojiRequests = useRef(new Set<string>());
  const customEmojiQueue = useRef(new Set<string>());
  const customEmojiObservations = useRef(new Map<string, Map<string, number>>());
  const customEmojiTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customEmojiGeneration = useRef(0);
  const storageWarningShown = useRef(false);
  const streamClientId = useRef("");

  const cancelPendingSave = useCallback(() => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    if (saveIdleCallback.current != null) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(saveIdleCallback.current);
      }
      saveIdleCallback.current = null;
    }
  }, []);

  const requireLogin = useCallback(() => {
    removeBotToken();
    setAuthStatus("required");
  }, []);

  const cancelPendingStickerSave = useCallback(() => {
    if (stickerSaveTimer.current) {
      clearTimeout(stickerSaveTimer.current);
      stickerSaveTimer.current = null;
    }
    if (stickerSaveIdleCallback.current != null) {
      if (typeof window.cancelIdleCallback === "function") {
        window.cancelIdleCallback(stickerSaveIdleCallback.current);
      }
      stickerSaveIdleCallback.current = null;
    }
  }, []);

  const applyStickerLibrary = useCallback(
    (update: (current: StickerLibrary) => StickerLibrary): StickerLibrary => {
      const current = stickerLibraryRef.current;
      const next = update(current);
      if (next !== current) {
        stickerLibraryRef.current = next;
        setStickerLibrary(next);
      }
      return next;
    },
    []
  );

  useEffect(() => {
    selectedChatIdRef.current = selectedChatId;
  }, [selectedChatId]);

  // ------------------------------------------------------------- toasts
  const notify = useCallback((text: string, kind: "ok" | "err" = "ok") => {
    const id = ++toastId.current;
    setToasts((t) => [...t, { id, text, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), kind === "err" ? 6000 : 3000);
  }, []);

  const warnBrowserStorage = useCallback(() => {
    setBrowserStorage("memory-only");
    if (storageWarningShown.current) return;
    storageWarningShown.current = true;
    notify("IndexedDB is unavailable; this tab is running memory-only", "err");
  }, [notify]);

  // -------------------------------------------------------------- theme
  useEffect(() => {
    let cancelled = false;
    document.documentElement.dataset.theme = theme;
    if (!browserStorageAvailable()) {
      warnBrowserStorage();
      return;
    }
    void loadPreference<"light" | "dark">("theme")
      .then((saved) => {
        if (cancelled || (saved !== "light" && saved !== "dark")) return;
        setThemeState(saved);
        document.documentElement.dataset.theme = saved;
      })
      .catch(warnBrowserStorage);
    return () => {
      cancelled = true;
    };
    // Initial preference hydration runs once; later changes use setTheme.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTheme = useCallback((t: "light" | "dark") => {
    setThemeState(t);
    document.documentElement.dataset.theme = t;
    if (browserStorageAvailable()) void savePreference("theme", t).catch(warnBrowserStorage);
  }, [warnBrowserStorage]);

  // --------------------------------------------------------------- auth
  useEffect(() => {
    try {
      setBotAccounts(savedBotAccounts());
      setAuthStatus(restoreBotToken() ? "authenticated" : "required");
    } catch {
      setAuthError("Browser local storage is unavailable; Humanoid cannot retain the bot token.");
      setAuthStatus("required");
    }
  }, []);

  const login = useCallback(async (token: string) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const normalized = token.trim();
      if (!validBotToken(normalized)) {
        setAuthError("Enter a valid Telegram bot token");
        return false;
      }
      const response = await botFetch("/api/state", { cache: "no-store" }, normalized);
      const body = (await response.json()) as AppSnapshot & TgResult;
      if (!response.ok || !body.me) {
        setAuthError(body.description || "Telegram rejected this bot token");
        return false;
      }
      rememberBotAccount(normalized, body.me);
      saveBotToken(normalized);
      setBotAccounts(savedBotAccounts());
      setAuthStatus("authenticated");
      return true;
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Could not reach the Worker. Check your connection and try again.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const switchAccount = useCallback(async (botId: string) => {
    const token = savedBotToken(botId);
    if (!token) {
      setBotAccounts(savedBotAccounts());
      setAuthError("That saved bot account is no longer available in this browser");
      return false;
    }
    return login(token);
  }, [login]);

  const forgetAccount = useCallback((botId: string) => {
    try {
      forgetSavedBotAccount(botId);
      setBotAccounts(savedBotAccounts());
      setAuthError("");
    } catch {
      setAuthError("Could not update saved accounts in this browser");
    }
  }, []);

  const requestStickerSet = useCallback((name: string, force = false, reportFailure = false) => {
    const botId = activeBotIdRef.current;
    if (!botId || !name || name.length > 128) return;
    const current = stickerLibraryRef.current;
    if (!force && !stickerSetNeedsHydration(current, name)) return;
    const requestKey = `${botId}:${name}`;
    if (stickerSetRequests.current.has(requestKey)) return;
    stickerSetRequests.current.add(requestKey);

    void tg<TgAny>("getStickerSet", { name })
      .then((response) => {
        if (response.error_code === 401) requireLogin();
        if (activeBotIdRef.current !== botId) return;
        if (response.ok && response.result) {
          const set = response.result;
          applyStickerLibrary((library) => mergeStickerSet(library, set));
        } else if (reportFailure) {
          notify(`getStickerSet: ${response.description || "failed"}`, "err");
        }
      })
      .finally(() => stickerSetRequests.current.delete(requestKey));
  }, [applyStickerLibrary, notify, requireLogin]);

  const refreshStickerSet = useCallback((name: string) => {
    requestStickerSet(name, true, true);
  }, [requestStickerSet]);

  const rememberStickerSet = useCallback((set: TgAny) => {
    applyStickerLibrary((library) => mergeStickerSet(library, set));
  }, [applyStickerLibrary]);

  const rememberStickerMessage = useCallback((message: StoredMessage) => {
    if (!message.sticker) return;
    const setName = typeof message.sticker.set_name === "string" ? message.sticker.set_name : "";
    const shouldHydrate = Boolean(
      setName && stickerSetNeedsHydration(stickerLibraryRef.current, setName, message.sticker)
    );
    const next = applyStickerLibrary((library) => ingestStickerMessage(library, message));
    if (setName && (shouldHydrate || stickerSetNeedsHydration(next, setName))) {
      requestStickerSet(setName, shouldHydrate);
    }
  }, [applyStickerLibrary, requestStickerSet]);

  const ensureCustomEmojis = useCallback((ids: string[]) => {
    for (const id of ids) {
      if (!/^\d+$/.test(id) || customEmojiStickersRef.current[id] || customEmojiRequests.current.has(id)) continue;
      customEmojiRequests.current.add(id);
      customEmojiQueue.current.add(id);
    }
    if (customEmojiQueue.current.size === 0 || customEmojiTimer.current) return;
    const generation = customEmojiGeneration.current;
    customEmojiTimer.current = setTimeout(() => {
      customEmojiTimer.current = null;
      const queued = [...customEmojiQueue.current];
      customEmojiQueue.current.clear();
      for (let index = 0; index < queued.length; index += 200) {
        const batch = queued.slice(index, index + 200);
        void tg<TgAny[]>("getCustomEmojiStickers", { custom_emoji_ids: batch }).then((response) => {
          if (generation !== customEmojiGeneration.current) return;
          if (response.error_code === 401) requireLogin();
          if (!response.ok || !Array.isArray(response.result)) {
            for (const id of batch) customEmojiRequests.current.delete(id);
            return;
          }
          const received = response.result;
          const setNames = new Set<string>();
          applyStickerLibrary((library) => {
            let next = library;
            for (const sticker of received) {
              const id = typeof sticker?.custom_emoji_id === "string" ? sticker.custom_emoji_id : "";
              if (!id) continue;
              next = mergeStickerMetadata(next, sticker);
              for (const [observationKey, observedAt] of customEmojiObservations.current.get(id) || []) {
                next = ingestStickerUse(next, sticker, observationKey, observedAt);
              }
              customEmojiObservations.current.delete(id);
              if (typeof sticker.set_name === "string" && sticker.set_name) setNames.add(sticker.set_name);
            }
            return next;
          });
          setCustomEmojiStickers((current) => {
            const next = { ...current };
            for (const sticker of received) {
              if (typeof sticker?.custom_emoji_id === "string") next[sticker.custom_emoji_id] = sticker;
            }
            customEmojiStickersRef.current = next;
            return next;
          });
          for (const id of batch) customEmojiRequests.current.delete(id);
          for (const setName of setNames) requestStickerSet(setName);
        });
      }
    }, 0);
  }, [applyStickerLibrary, requestStickerSet, requireLogin]);

  const observeCustomEmojis = useCallback((ids: string[], observationBase: string, now = Date.now()) => {
    const unresolved: string[] = [];
    for (const id of new Set(ids.filter((candidate) => /^\d+$/.test(candidate)))) {
      const observationKey = `${observationBase}:custom:${id}`;
      const sticker = customEmojiStickersRef.current[id];
      if (sticker) {
        applyStickerLibrary((library) => ingestStickerUse(library, sticker, observationKey, now));
        continue;
      }
      const pending = customEmojiObservations.current.get(id) || new Map<string, number>();
      if (!pending.has(observationKey)) pending.set(observationKey, now);
      customEmojiObservations.current.set(id, pending);
      unresolved.push(id);
    }
    if (unresolved.length) ensureCustomEmojis(unresolved);
  }, [applyStickerLibrary, ensureCustomEmojis]);

  const rememberCustomEmojisInMessage = useCallback((message: StoredMessage) => {
    // Reaction changes have their own update ids. Excluding local reaction
    // bookkeeping here prevents a reload scan from counting the same use twice.
    const ids = collectCustomEmojiIds({
      ...message,
      _reactions: undefined,
      _botReactions: undefined,
    });
    if (!ids.length) return;
    observeCustomEmojis(
      ids,
      `message:${stickerMessageKey(message)}`,
      message.date ? message.date * 1000 : Date.now()
    );
  }, [observeCustomEmojis]);

  useEffect(() => () => {
    if (customEmojiTimer.current) clearTimeout(customEmojiTimer.current);
  }, []);

  const logout = useCallback(async () => {
    const clientId = streamClientId.current;
    if (clientId) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 1_500);
      void botFetch(`/api/webhook/release?client=${encodeURIComponent(clientId)}`, {
        method: "POST",
        cache: "no-store",
        signal: controller.signal,
      })
        .catch(() => {
          // Telegram will retry against the webhook if this client disappears abruptly.
        })
        .finally(() => window.clearTimeout(timeout));
    }
    removeBotToken();
    cancelPendingSave();
    cancelPendingStickerSave();
    const record = latestStoredDashboard.current;
    if (record) void saveDashboard(record).catch(() => undefined);
    const stickers = latestStoredStickerLibrary.current;
    if (stickers?.botId) void saveStickerLibrary(stickers).catch(() => undefined);
    latestStoredDashboard.current = null;
    latestStoredStickerLibrary.current = null;
    hydratedRef.current = false;
    activeBotIdRef.current = null;
    pendingEvents.current = [];
    stickerSetRequests.current.clear();
    setActiveBotId(null);
    dispatch({ type: "reset" });
    setSelectedChatId(null);
    setAvatarFileIds({});
    setBotChatMemberState(null);
    const empty = emptyStickerLibrary("");
    stickerLibraryRef.current = empty;
    setStickerLibrary(empty);
    customEmojiGeneration.current += 1;
    if (customEmojiTimer.current) clearTimeout(customEmojiTimer.current);
    customEmojiTimer.current = null;
    customEmojiQueue.current.clear();
    customEmojiRequests.current.clear();
    customEmojiObservations.current.clear();
    customEmojiStickersRef.current = {};
    setCustomEmojiStickers({});
    avatarRequests.current.clear();
    setAuthStatus("required");
  }, [cancelPendingSave, cancelPendingStickerSave]);

  // ------------------------------------------------------------- stream
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = 250;
    let webhookInstallInFlight = false;
    let webhookInstalled = false;
    const clientId = crypto.randomUUID();
    streamClientId.current = clientId;
    const releaseUrl = `/api/webhook/release?client=${encodeURIComponent(clientId)}`;

    const ensureWebhook = () => {
      if (webhookInstalled || webhookInstallInFlight) return;
      webhookInstallInFlight = true;
      void botFetch("/api/webhook/install", { method: "POST", cache: "no-store" })
        .then(async (response) => {
          const result = (await response.json()) as TgResult;
          webhookInstalled = Boolean(response.ok && result.ok);
          if (response.status === 401) requireLogin();
        })
        .catch(() => undefined)
        .finally(() => {
          webhookInstallInFlight = false;
        });
    };

    const releaseOnPageHide = () => {
      webhookInstalled = false;
      navigator.sendBeacon?.(releaseUrl);
    };
    window.addEventListener("pagehide", releaseOnPageHide);
    window.addEventListener("pageshow", ensureWebhook);

    hydratedRef.current = false;
    activeBotIdRef.current = null;
    pendingEvents.current = [];
    setActiveBotId(null);
    setBotChatMemberState(null);
    setBrowserStorage(browserStorageAvailable() ? "loading" : "memory-only");
    customEmojiGeneration.current += 1;
    if (customEmojiTimer.current) clearTimeout(customEmojiTimer.current);
    customEmojiTimer.current = null;
    customEmojiQueue.current.clear();
    customEmojiRequests.current.clear();
    customEmojiObservations.current.clear();
    customEmojiStickersRef.current = {};
    setCustomEmojiStickers({});

    const clearPersistedState = (botId: string) => {
      cancelPendingSave();
      cancelPendingStickerSave();
      latestStoredDashboard.current = null;
      latestStoredStickerLibrary.current = null;
      void clearDashboard(botId).catch(warnBrowserStorage);
      void clearStickerLibrary(botId).catch(warnBrowserStorage);
      const empty = emptyStickerLibrary(botId);
      stickerLibraryRef.current = empty;
      setStickerLibrary(empty);
      setAvatarFileIds({});
      setBotChatMemberState(null);
      avatarRequests.current.clear();
      customEmojiObservations.current.clear();
      setSelectedChatId(null);
      setReplyTo(null);
      setEditing(null);
    };

    const applyEventSideEffects = (streamEvent: StreamEvent) => {
      if (streamEvent.type === "message" || streamEvent.type === "message_edited") {
        rememberStickerMessage(streamEvent.message);
        rememberCustomEmojisInMessage(streamEvent.message);
      }
      if (streamEvent.type === "reaction") {
        const ids = collectCustomEmojiIds(streamEvent.reactions);
        if (ids.length) {
          observeCustomEmojis(
            ids,
            `reaction:${streamEvent.observationId || `${streamEvent.chatId}:${streamEvent.messageId}:${JSON.stringify(streamEvent.reactions)}`}`
          );
        }
      }
      if (streamEvent.type === "chat") {
        for (const setName of [
          streamEvent.chat.chat.sticker_set_name,
          streamEvent.chat.chat.custom_emoji_sticker_set_name,
        ]) {
          if (typeof setName === "string" && setName) requestStickerSet(setName);
        }
      }
      if (streamEvent.type === "raw") {
        const membership = streamEvent.update.my_chat_member;
        const chatId = membership?.chat?.id;
        const member = membership?.new_chat_member;
        if (chatId != null && String(member?.user?.id ?? "") === activeBotIdRef.current) {
          if (String(chatId) === selectedChatIdRef.current) {
            setBotChatMemberState({ chatId: String(chatId), member });
          }
        }
      }
    };

    const deliverEvent = (streamEvent: StreamEvent) => {
      if (streamEvent.type === "ready") {
        dispatch({ type: "event", event: streamEvent });
        return;
      }
      if (!hydratedRef.current) {
        pendingEvents.current.push(streamEvent);
        return;
      }
      applyEventSideEffects(streamEvent);
      dispatch({ type: "event", event: streamEvent });
      if (streamEvent.type === "clear" && activeBotIdRef.current) {
        clearPersistedState(activeBotIdRef.current);
      }
    };

    const connect = () => {
      if (closed) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/api/ws?client=${encodeURIComponent(clientId)}`);
      socket.onmessage = (event) => {
        if (event.data === "pong") return;
        try {
          deliverEvent(JSON.parse(String(event.data)) as StreamEvent);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onopen = () => {
        retryMs = 250;
        dispatch({ type: "connected", value: true });
        ensureWebhook();
      };
      socket.onclose = () => {
        socket = null;
        dispatch({ type: "connected", value: false });
        if (!closed) {
          retryTimer = setTimeout(connect, retryMs);
          retryMs = Math.min(retryMs * 2, 5000);
        }
      };
      socket.onerror = () => socket?.close();
    };

    connect();
    void botFetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          requireLogin();
          return;
        }
        if (!response.ok) return;
        const fresh = (await response.json()) as AppSnapshot;
        const botId = fresh.me?.id == null ? "" : String(fresh.me.id);
        const token = currentBotToken();
        if (fresh.me && token) {
          try {
            rememberBotAccount(token, fresh.me);
            setBotAccounts(savedBotAccounts());
          } catch {
            // The active token remains usable even if the optional account list cannot be updated.
          }
        }
        let saved: StoredDashboard | null = null;
        let savedStickers: StickerLibrary | null = null;
        let storageWorked = browserStorageAvailable();
        if (botId && storageWorked) {
          try {
            [saved, savedStickers] = await Promise.all([
              loadDashboard(botId),
              loadStickerLibrary(botId),
            ]);
          } catch {
            storageWorked = false;
            warnBrowserStorage();
          }
        }
        if (closed) return;

        dispatch({ type: "hydrate", saved: saved?.snapshot || null, fresh });
        setAvatarFileIds(saved?.avatarFileIds || {});
        avatarRequests.current = new Set(Object.keys(saved?.avatarFileIds || {}));
        const restoredChatId = saved?.selectedChatId;
        setSelectedChatId(
          restoredChatId && saved?.snapshot.chats.some((entry) => String(entry.chat.id) === restoredChatId)
            ? restoredChatId
            : null
        );
        activeBotIdRef.current = botId || null;
        setActiveBotId(botId || null);
        const restoredStickers = ingestStickerSnapshot(
          savedStickers || emptyStickerLibrary(botId),
          saved?.snapshot || fresh
        );
        stickerLibraryRef.current = restoredStickers;
        setStickerLibrary(restoredStickers);
        for (const list of Object.values((saved?.snapshot || fresh).messages)) {
          for (const message of list) rememberCustomEmojisInMessage(message);
        }
        for (const entry of (saved?.snapshot || fresh).chats) {
          for (const setName of [entry.chat.sticker_set_name, entry.chat.custom_emoji_sticker_set_name]) {
            if (typeof setName === "string" && setName) requestStickerSet(setName);
          }
        }
        hydratedRef.current = true;
        if (botId && storageWorked) {
          setBrowserStorage("ready");
        }

        for (const queued of pendingEvents.current.splice(0)) {
          applyEventSideEffects(queued);
          dispatch({ type: "event", event: queued });
          if (queued.type === "clear" && botId) clearPersistedState(botId);
        }
        for (const setName of Object.keys(stickerLibraryRef.current.sets)) {
          requestStickerSet(setName);
        }
      })
      .catch(() => undefined);

    return () => {
      closed = true;
      window.removeEventListener("pagehide", releaseOnPageHide);
      window.removeEventListener("pageshow", ensureWebhook);
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close(1000, "Page closed");
      if (streamClientId.current === clientId) streamClientId.current = "";
    };
  }, [
    authStatus,
    cancelPendingSave,
    cancelPendingStickerSave,
    rememberStickerMessage,
    rememberCustomEmojisInMessage,
    observeCustomEmojis,
    requireLogin,
    requestStickerSet,
    warnBrowserStorage,
  ]);

  // Persist a bounded snapshot off the render path. Repeated live events update
  // the in-memory UI immediately and collapse into at most one IndexedDB write
  // per 250 ms.
  useEffect(() => {
    if (!activeBotId || !hydratedRef.current || browserStorage === "memory-only") return;
    latestStoredDashboard.current = {
      version: 1,
      botId: activeBotId,
      savedAt: Date.now(),
      snapshot: {
        me: state.me,
        chats: state.chats,
        messages: state.messages,
        queries: state.queries,
        rawUpdates: state.rawUpdates,
        polling: state.polling,
        log: state.log,
      },
      avatarFileIds: Object.fromEntries(
        Object.entries(avatarFileIds).filter((entry): entry is [string, string] => typeof entry[1] === "string")
      ),
      selectedChatId,
    };
    if (saveTimer.current || saveIdleCallback.current != null) return;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      const persistLatest = () => {
        saveIdleCallback.current = null;
        const record = latestStoredDashboard.current;
        if (!record || record.botId !== activeBotIdRef.current) return;
        void saveDashboard(record).catch(warnBrowserStorage);
      };
      if (typeof window.requestIdleCallback === "function") {
        saveIdleCallback.current = window.requestIdleCallback(persistLatest, { timeout: 750 });
      } else {
        persistLatest();
      }
    }, 250);
  }, [activeBotId, avatarFileIds, browserStorage, selectedChatId, state, warnBrowserStorage]);

  useEffect(() => {
    if (
      !activeBotId
      || !hydratedRef.current
      || browserStorage === "memory-only"
      || stickerLibrary.botId !== activeBotId
    ) return;
    latestStoredStickerLibrary.current = {
      ...stickerLibrary,
      savedAt: Date.now(),
    };
    if (stickerSaveTimer.current || stickerSaveIdleCallback.current != null) return;
    stickerSaveTimer.current = setTimeout(() => {
      stickerSaveTimer.current = null;
      const persistLatest = () => {
        stickerSaveIdleCallback.current = null;
        const record = latestStoredStickerLibrary.current;
        if (!record || record.botId !== activeBotIdRef.current) return;
        void saveStickerLibrary(record).catch(warnBrowserStorage);
      };
      if (typeof window.requestIdleCallback === "function") {
        stickerSaveIdleCallback.current = window.requestIdleCallback(persistLatest, { timeout: 750 });
      } else {
        persistLatest();
      }
    }, 250);
  }, [activeBotId, browserStorage, stickerLibrary, warnBrowserStorage]);

  useEffect(() => () => {
    cancelPendingSave();
    const record = latestStoredDashboard.current;
    if (record && record.botId === activeBotIdRef.current) void saveDashboard(record).catch(() => undefined);
  }, [cancelPendingSave]);

  useEffect(() => () => {
    cancelPendingStickerSave();
    const record = latestStoredStickerLibrary.current;
    if (record && record.botId === activeBotIdRef.current) {
      void saveStickerLibrary(record).catch(() => undefined);
    }
  }, [cancelPendingStickerSave]);

  const clearBrowserHistory = useCallback(async () => {
    const botId = activeBotIdRef.current;
    let storageCleared = true;
    cancelPendingSave();
    cancelPendingStickerSave();
    latestStoredDashboard.current = null;
    latestStoredStickerLibrary.current = null;
    if (botId && browserStorageAvailable()) {
      try {
        await Promise.all([clearDashboard(botId), clearStickerLibrary(botId)]);
      } catch {
        storageCleared = false;
        warnBrowserStorage();
      }
    }
    dispatch({ type: "event", event: { type: "clear" } });
    setAvatarFileIds({});
    const empty = emptyStickerLibrary(botId || "");
    stickerLibraryRef.current = empty;
    setStickerLibrary(empty);
    setBotChatMemberState(null);
    avatarRequests.current.clear();
    customEmojiObservations.current.clear();
    setSelectedChatId(null);
    setReplyTo(null);
    setEditing(null);

    const result = await pollingApi("clear").catch(() => ({ ok: false, description: "Could not notify other open tabs" }));
    if (!result.ok) notify(result.description || "Browser history cleared, but other tabs were not notified", "err");
    return storageCleared;
  }, [cancelPendingSave, cancelPendingStickerSave, notify, warnBrowserStorage]);

  const call = useCallback(
    async <T,>(method: string, params: TgAny = {}, meta?: CallMeta) => {
      const res = await tg<T>(method, params, meta);
      if (res.error_code === 401) requireLogin();
      if (!res.ok) notify(`${method}: ${res.description || "failed"}`, "err");
      return res;
    },
    [notify, requireLogin]
  );

  const setLocalBotReaction = useCallback((
    chatId: string,
    messageId: number,
    reactions: TgAny[],
    observationId: string
  ) => {
    const event: StreamEvent = {
      type: "reaction",
      chatId,
      messageId,
      reactions,
      own: true,
      observationId,
    };
    const ids = collectCustomEmojiIds(reactions);
    if (ids.length) observeCustomEmojis(ids, `reaction:${observationId}`);
    dispatch({ type: "event", event });
  }, [observeCustomEmojis]);

  const upload = useCallback(
    async <T,>(
      method: string,
      params: TgAny = {},
      files: Record<string, File | Blob> = {},
      meta?: CallMeta
    ) => {
      const res = await tgUpload<T>(method, params, files, meta);
      if (res.error_code === 401) requireLogin();
      if (!res.ok) notify(`${method}: ${res.description || "failed"}`, "err");
      return res;
    },
    [notify, requireLogin]
  );

  const selectedChatType = selectedChatId
    ? state.chats.find((entry) => String(entry.chat.id) === selectedChatId)?.chat.type
    : undefined;

  useEffect(() => {
    const chatId = selectedChatId;
    const botId = state.me?.id;
    setBotChatMemberState(null);
    if (!chatId || !botId || selectedChatType === "private") {
      if (chatId && selectedChatType === "private") {
        setBotChatMemberState({ chatId, member: null });
      }
      return;
    }

    let cancelled = false;
    void tg<TgAny>("getChatMember", { chat_id: Number(chatId), user_id: botId }).then((response) => {
      if (cancelled) return;
      if (response.error_code === 401) requireLogin();
      setBotChatMemberState({ chatId, member: response.ok && response.result ? response.result : null });
    });
    return () => {
      cancelled = true;
    };
  }, [requireLogin, selectedChatId, selectedChatType, state.me?.id]);

  const ensureAvatar = useCallback((id: number | string, kind: "user" | "chat") => {
    const key = `${kind}:${id}`;
    if (avatarRequests.current.has(key)) return;
    avatarRequests.current.add(key);
    void avatar(id, kind).then((result) => {
      setAvatarFileIds((current) => {
        if (key in current) return current;
        return { ...current, [key]: result.ok ? result.file_id || null : null };
      });
    });
  }, []);

  const refreshAvatar = useCallback(async (id: number | string, kind: "user" | "chat") => {
    const key = `${kind}:${id}`;
    avatarRequests.current.add(key);
    const result = await avatar(id, kind);
    setAvatarFileIds((current) => ({
      ...current,
      [key]: result.ok ? result.file_id || null : null,
    }));
  }, []);

  const selectChat = useCallback((id: string | null) => {
    setSelectedChatId(id);
    setReplyTo(null);
    setEditing(null);
    if (id) {
      dispatch({ type: "local_read", chatId: id });
      void botFetch("/api/tg", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method: "getChat", params: { chat_id: Number(id) } }),
      }).catch(() => undefined);
    }
  }, []);

  const chat = useMemo(
    () => state.chats.find((c) => String(c.chat.id) === selectedChatId) || null,
    [state.chats, selectedChatId]
  );

  const messages = useMemo(
    () => (selectedChatId ? state.messages[selectedChatId] || [] : []),
    [state.messages, selectedChatId]
  );

  const botChatMember = selectedChatId && botChatMemberState?.chatId === selectedChatId
    ? botChatMemberState.member
    : undefined;

  const value: Ctx = {
    state,
    selectedChatId,
    selectChat,
    chat,
    messages,
    replyTo,
    setReplyTo,
    editing,
    setEditing,
    toasts,
    notify,
    call,
    upload,
    theme,
    setTheme,
    authStatus,
    authBusy,
    authError,
    login,
    botAccounts,
    switchAccount,
    forgetAccount,
    logout,
    browserStorage,
    clearBrowserHistory,
    avatarFileIds,
    ensureAvatar,
    refreshAvatar,
    stickerLibrary,
    rememberStickerSet,
    refreshStickerSet,
    customEmojiStickers,
    ensureCustomEmojis,
    setLocalBotReaction,
    botChatMember,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
