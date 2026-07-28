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
  browserStorageAvailable,
  clearDashboard,
  loadDashboard,
  loadPreference,
  saveDashboard,
  savePreference,
  type StoredDashboard,
} from "@/lib/client/indexedDb";

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
          if (idx >= 0) next[idx] = e.message;
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
                message.message_id === e.messageId ? { ...message, _reactions: e.reactions } : message
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
  logout: () => Promise<void>;
  browserStorage: "loading" | "ready" | "memory-only";
  clearBrowserHistory: () => Promise<boolean>;
  avatarFileIds: Record<string, string | null>;
  ensureAvatar: (id: number | string, kind: "user" | "chat") => void;
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
  const [avatarFileIds, setAvatarFileIds] = useState<Record<string, string | null>>({});
  const [browserStorage, setBrowserStorage] = useState<"loading" | "ready" | "memory-only">("loading");
  const [activeBotId, setActiveBotId] = useState<string | null>(null);
  const toastId = useRef(0);
  const avatarRequests = useRef(new Set<string>());
  const activeBotIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const pendingEvents = useRef<StreamEvent[]>([]);
  const latestStoredDashboard = useRef<StoredDashboard | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveIdleCallback = useRef<number | null>(null);
  const storageWarningShown = useRef(false);

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
    let cancelled = false;
    fetch("/api/auth/session", { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { authenticated?: boolean };
        if (!cancelled) setAuthStatus(body.authenticated ? "authenticated" : "required");
      })
      .catch(() => {
        if (!cancelled) {
          setAuthError("Could not reach the Worker. Check your connection and try again.");
          setAuthStatus("required");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (token: string) => {
    setAuthBusy(true);
    setAuthError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = (await response.json()) as TgResult;
      if (!response.ok || !body.ok) {
        setAuthError(body.description || "Sign-in failed");
        return false;
      }
      setAuthStatus("authenticated");
      return true;
    } catch {
      setAuthError("Could not reach the Worker. Check your connection and try again.");
      return false;
    } finally {
      setAuthBusy(false);
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      cancelPendingSave();
      const record = latestStoredDashboard.current;
      if (record) void saveDashboard(record).catch(() => undefined);
      latestStoredDashboard.current = null;
      hydratedRef.current = false;
      activeBotIdRef.current = null;
      pendingEvents.current = [];
      setActiveBotId(null);
      dispatch({ type: "reset" });
      setSelectedChatId(null);
      setAvatarFileIds({});
      avatarRequests.current.clear();
      setAuthStatus("required");
    }
  }, [cancelPendingSave]);

  // ------------------------------------------------------------- stream
  useEffect(() => {
    if (authStatus !== "authenticated") return;
    let closed = false;
    let socket: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let retryMs = 250;

    hydratedRef.current = false;
    activeBotIdRef.current = null;
    pendingEvents.current = [];
    setActiveBotId(null);
    setBrowserStorage(browserStorageAvailable() ? "loading" : "memory-only");

    const clearPersistedState = (botId: string) => {
      cancelPendingSave();
      latestStoredDashboard.current = null;
      void clearDashboard(botId).catch(warnBrowserStorage);
      setAvatarFileIds({});
      avatarRequests.current.clear();
      setSelectedChatId(null);
      setReplyTo(null);
      setEditing(null);
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
      dispatch({ type: "event", event: streamEvent });
      if (streamEvent.type === "clear" && activeBotIdRef.current) {
        clearPersistedState(activeBotIdRef.current);
      }
    };

    const connect = () => {
      if (closed) return;
      const protocol = location.protocol === "https:" ? "wss:" : "ws:";
      socket = new WebSocket(`${protocol}//${location.host}/api/ws`);
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
    void fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) {
          setAuthStatus("required");
          return;
        }
        if (!response.ok) return;
        const fresh = (await response.json()) as AppSnapshot;
        const botId = fresh.me?.id == null ? "" : String(fresh.me.id);
        let saved: StoredDashboard | null = null;
        let storageWorked = browserStorageAvailable();
        if (botId && storageWorked) {
          try {
            saved = await loadDashboard(botId);
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
        hydratedRef.current = true;
        if (botId && storageWorked) {
          setBrowserStorage("ready");
        }

        for (const queued of pendingEvents.current.splice(0)) {
          dispatch({ type: "event", event: queued });
          if (queued.type === "clear" && botId) clearPersistedState(botId);
        }
      })
      .catch(() => undefined);

    return () => {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      socket?.close(1000, "Page closed");
    };
  }, [authStatus, cancelPendingSave, warnBrowserStorage]);

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

  useEffect(() => () => {
    cancelPendingSave();
    const record = latestStoredDashboard.current;
    if (record && record.botId === activeBotIdRef.current) void saveDashboard(record).catch(() => undefined);
  }, [cancelPendingSave]);

  const clearBrowserHistory = useCallback(async () => {
    const botId = activeBotIdRef.current;
    let storageCleared = true;
    cancelPendingSave();
    latestStoredDashboard.current = null;
    if (botId && browserStorageAvailable()) {
      try {
        await clearDashboard(botId);
      } catch {
        storageCleared = false;
        warnBrowserStorage();
      }
    }
    dispatch({ type: "event", event: { type: "clear" } });
    setAvatarFileIds({});
    avatarRequests.current.clear();
    setSelectedChatId(null);
    setReplyTo(null);
    setEditing(null);

    const result = await pollingApi("clear").catch(() => ({ ok: false, description: "Could not notify other open tabs" }));
    if (!result.ok) notify(result.description || "Browser history cleared, but other tabs were not notified", "err");
    return storageCleared;
  }, [cancelPendingSave, notify, warnBrowserStorage]);

  const call = useCallback(
    async <T,>(method: string, params: TgAny = {}, meta?: CallMeta) => {
      const res = await tg<T>(method, params, meta);
      if (res.error_code === 401) setAuthStatus("required");
      if (!res.ok) notify(`${method}: ${res.description || "failed"}`, "err");
      return res;
    },
    [notify]
  );

  const upload = useCallback(
    async <T,>(
      method: string,
      params: TgAny = {},
      files: Record<string, File | Blob> = {},
      meta?: CallMeta
    ) => {
      const res = await tgUpload<T>(method, params, files, meta);
      if (res.error_code === 401) setAuthStatus("required");
      if (!res.ok) notify(`${method}: ${res.description || "failed"}`, "err");
      return res;
    },
    [notify]
  );

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

  const selectChat = useCallback((id: string | null) => {
    setSelectedChatId(id);
    setReplyTo(null);
    setEditing(null);
    if (id) {
      dispatch({ type: "local_read", chatId: id });
      void fetch("/api/tg", {
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
    logout,
    browserStorage,
    clearBrowserHistory,
    avatarFileIds,
    ensureAvatar,
  };

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}
