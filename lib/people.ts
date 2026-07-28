import type { ChatEntry, TgChat, TgUser } from "./types";

export interface KnownPerson {
  user: TgUser;
  privateChatId?: string;
  sourceChats: Array<{ id: string; name: string }>;
  lastActivity: number;
}

/** Builds a per-bot, browser-local people index from chats the dashboard has observed. */
export function collectKnownPeople(chats: ChatEntry[], botId?: number): KnownPerson[] {
  const people = new Map<string, KnownPerson>();

  const remember = (
    user: TgUser,
    entry: ChatEntry,
    privateChatId?: string
  ) => {
    if (user.id === botId) return;
    const key = String(user.id);
    const current = people.get(key);
    const source = entry.chat.type === "private"
      ? undefined
      : { id: String(entry.chat.id), name: localChatName(entry.chat) };
    const sourceChats = current ? [...current.sourceChats] : [];
    if (source && !sourceChats.some((chat) => chat.id === source.id)) sourceChats.push(source);

    people.set(key, {
      user: mergeUser(current?.user, user),
      privateChatId: privateChatId || current?.privateChatId,
      sourceChats,
      lastActivity: Math.max(current?.lastActivity || 0, entry.lastActivity),
    });
  };

  for (const entry of chats) {
    if (entry.chat.type === "private" && entry.chat.id !== botId) {
      remember(userFromPrivateChat(entry.chat), entry, String(entry.chat.id));
    }
    for (const user of Object.values(entry.knownUsers || {})) {
      remember(
        user,
        entry,
        entry.chat.type === "private" && entry.chat.id === user.id
          ? String(entry.chat.id)
          : undefined
      );
    }
  }

  return [...people.values()].sort((left, right) =>
    right.lastActivity - left.lastActivity
      || personName(left.user).localeCompare(personName(right.user))
  );
}

export function searchKnownPeople(people: KnownPerson[], query: string): KnownPerson[] {
  const raw = query.trim().toLocaleLowerCase();
  if (!raw) return [];
  const withoutAt = raw.startsWith("@") ? raw.slice(1) : raw;
  return people.filter(({ user }) => {
    const username = (user.username || "").toLocaleLowerCase();
    const name = personName(user).toLocaleLowerCase();
    return String(user.id).includes(raw)
      || Boolean(withoutAt && username.includes(withoutAt))
      || name.includes(raw);
  });
}

/** Telegram user IDs fit safely in a JS number, but arbitrary text must not reach getChat. */
export function exactUserId(query: string): number | null {
  const value = query.trim();
  if (!/^\d{1,16}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function userFromPrivateChat(chat: TgChat): TgUser {
  return {
    id: chat.id,
    is_bot: Boolean(chat.is_bot),
    first_name: chat.first_name || chat.title || chat.username || String(chat.id),
    last_name: chat.last_name,
    username: chat.username,
  };
}

function mergeUser(current: TgUser | undefined, incoming: TgUser): TgUser {
  if (!current) return incoming;
  return {
    ...current,
    ...incoming,
    first_name: incoming.first_name || current.first_name,
    last_name: incoming.last_name || current.last_name,
    username: incoming.username || current.username,
  };
}

function personName(user: TgUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(" ")
    || user.username
    || String(user.id);
}

function localChatName(chat: TgChat): string {
  return chat.title
    || [chat.first_name, chat.last_name].filter(Boolean).join(" ")
    || chat.username
    || String(chat.id);
}
