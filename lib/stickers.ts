import type { AppSnapshot, StoredMessage, TgAny } from "./types";

export const STICKER_LIBRARY_VERSION = 1 as const;
export const STICKER_SET_REFRESH_MS = 24 * 60 * 60 * 1000;
const MAX_SEEN_STICKER_MESSAGES = 10_000;
const seenMessageIndexes = new WeakMap<StickerLibrary, Set<string>>();

export interface StickerLibraryEntry {
  sticker: TgAny;
  useCount: number;
  firstSeenAt: number;
  lastUsedAt: number;
}

export interface StickerLibrarySet {
  name: string;
  title: string;
  stickerType: string;
  thumbnail?: TgAny;
  stickers: Record<string, StickerLibraryEntry>;
  order: string[];
  useCount: number;
  lastUsedAt: number;
  hydratedAt: number | null;
}

export interface StickerLibrary {
  version: typeof STICKER_LIBRARY_VERSION;
  botId: string;
  savedAt: number;
  sets: Record<string, StickerLibrarySet>;
  loose: Record<string, StickerLibraryEntry>;
  seenMessageKeys: string[];
}

export function emptyStickerLibrary(botId: string, now = Date.now()): StickerLibrary {
  return {
    version: STICKER_LIBRARY_VERSION,
    botId,
    savedAt: now,
    sets: {},
    loose: {},
    seenMessageKeys: [],
  };
}

export function stickerKey(sticker: TgAny): string {
  return String(sticker.file_unique_id || sticker.file_id || "");
}

export function stickerMessageKey(message: StoredMessage): string {
  const chatId = String(message.chat?.id ?? "unknown");
  const identity = message._key
    || (message.ephemeral_message_id != null
      ? `e:${message.ephemeral_message_id}`
      : `m:${message.message_id}`);
  return `${chatId}:${identity}`;
}

/**
 * Records one unique sticker message. The bounded message-key ledger prevents a
 * saved timeline from inflating frequency counts each time the page reloads.
 */
export function ingestStickerMessage(
  library: StickerLibrary,
  message: StoredMessage,
  now = message.date ? message.date * 1000 : Date.now()
): StickerLibrary {
  const sticker = message.sticker as TgAny | undefined;
  const key = sticker ? stickerKey(sticker) : "";
  if (!sticker || !key) return library;

  const seenKey = stickerMessageKey(message);
  const seenIndex = seenMessageIndex(library);
  if (seenIndex.has(seenKey)) return library;

  const seenMessageKeys = [...library.seenMessageKeys, seenKey].slice(-MAX_SEEN_STICKER_MESSAGES);
  const setName = typeof sticker.set_name === "string" && sticker.set_name ? sticker.set_name : "";
  if (!setName) {
    const existing = library.loose[key];
    const next = {
      ...library,
      savedAt: Date.now(),
      loose: {
        ...library.loose,
        [key]: mergeObservedSticker(existing, sticker, now),
      },
      seenMessageKeys,
    };
    advanceSeenMessageIndex(seenIndex, library.seenMessageKeys, seenMessageKeys, seenKey, next);
    return next;
  }

  const existingSet = library.sets[setName] || emptySet(setName);
  const existingSticker = existingSet.stickers[key];
  const next = {
    ...library,
    savedAt: Date.now(),
    sets: {
      ...library.sets,
      [setName]: {
        ...existingSet,
        stickers: {
          ...existingSet.stickers,
          [key]: mergeObservedSticker(existingSticker, sticker, now),
        },
        order: existingSet.order.includes(key) ? existingSet.order : [...existingSet.order, key],
        useCount: existingSet.useCount + 1,
        lastUsedAt: Math.max(existingSet.lastUsedAt, now),
      },
    },
    seenMessageKeys,
  };
  advanceSeenMessageIndex(seenIndex, library.seenMessageKeys, seenMessageKeys, seenKey, next);
  return next;
}

/** Adds every sticker returned by getStickerSet while retaining local usage. */
export function mergeStickerSet(
  library: StickerLibrary,
  stickerSet: TgAny,
  now = Date.now()
): StickerLibrary {
  const name = typeof stickerSet.name === "string" ? stickerSet.name : "";
  if (!name) return library;

  const current = library.sets[name] || emptySet(name);
  const stickers = { ...current.stickers };
  const fetchedOrder: string[] = [];

  for (const raw of Array.isArray(stickerSet.stickers) ? stickerSet.stickers : []) {
    if (!raw || typeof raw !== "object") continue;
    const sticker = { ...(raw as TgAny), set_name: (raw as TgAny).set_name || name };
    const key = stickerKey(sticker);
    if (!key) continue;
    const existing = stickers[key];
    stickers[key] = existing
      ? { ...existing, sticker: { ...existing.sticker, ...sticker } }
      : { sticker, useCount: 0, firstSeenAt: now, lastUsedAt: 0 };
    fetchedOrder.push(key);
  }

  // Keep previously observed stickers even when a set was edited after receipt.
  const observedRemainder = current.order.filter(
    (key) => !fetchedOrder.includes(key) && (stickers[key]?.useCount || 0) > 0
  );
  const order = [...fetchedOrder, ...observedRemainder];
  const retained = new Set(order);
  for (const key of Object.keys(stickers)) {
    if (!retained.has(key)) delete stickers[key];
  }

  return {
    ...library,
    savedAt: now,
    sets: {
      ...library.sets,
      [name]: {
        ...current,
        name,
        title: typeof stickerSet.title === "string" && stickerSet.title ? stickerSet.title : current.title,
        stickerType: typeof stickerSet.sticker_type === "string"
          ? stickerSet.sticker_type
          : current.stickerType,
        thumbnail: stickerSet.thumbnail || current.thumbnail,
        stickers,
        order,
        hydratedAt: now,
      },
    },
  };
}

export function ingestStickerSnapshot(
  library: StickerLibrary,
  snapshot: AppSnapshot | null | undefined
): StickerLibrary {
  let next = library;
  if (!snapshot) return next;
  for (const messages of Object.values(snapshot.messages)) {
    for (const message of messages) next = ingestStickerMessage(next, message);
  }
  return next;
}

export function stickerSetNeedsHydration(
  library: StickerLibrary,
  setName: string,
  observedSticker?: TgAny,
  now = Date.now()
): boolean {
  const set = library.sets[setName];
  if (!set?.hydratedAt) return true;
  if (now - set.hydratedAt >= STICKER_SET_REFRESH_MS) return true;
  const key = observedSticker ? stickerKey(observedSticker) : "";
  return Boolean(key && !set.stickers[key]);
}

export function sortedStickerSets(library: StickerLibrary): StickerLibrarySet[] {
  return Object.values(library.sets).sort((a, b) =>
    b.useCount - a.useCount
    || b.lastUsedAt - a.lastUsedAt
    || a.title.localeCompare(b.title)
  );
}

export function sortedStickerEntries(library: StickerLibrary): StickerLibraryEntry[] {
  const unique = new Map<string, StickerLibraryEntry>();
  for (const set of Object.values(library.sets)) {
    for (const key of set.order) {
      const entry = set.stickers[key];
      if (entry) unique.set(key, entry);
    }
  }
  for (const [key, entry] of Object.entries(library.loose)) unique.set(key, entry);
  return [...unique.values()].sort(compareStickerEntries);
}

export function entriesForStickerSet(set: StickerLibrarySet): StickerLibraryEntry[] {
  return set.order
    .map((key, index) => ({ entry: set.stickers[key], index }))
    .filter((item): item is { entry: StickerLibraryEntry; index: number } => Boolean(item.entry))
    .sort((a, b) => compareStickerEntries(a.entry, b.entry) || a.index - b.index)
    .map((item) => item.entry);
}

export function isStickerLibrary(value: unknown, botId: string): value is StickerLibrary {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StickerLibrary>;
  return candidate.version === STICKER_LIBRARY_VERSION
    && candidate.botId === botId
    && typeof candidate.savedAt === "number"
    && Boolean(candidate.sets && typeof candidate.sets === "object")
    && Boolean(candidate.loose && typeof candidate.loose === "object")
    && Array.isArray(candidate.seenMessageKeys);
}

function emptySet(name: string): StickerLibrarySet {
  return {
    name,
    title: name,
    stickerType: "regular",
    stickers: {},
    order: [],
    useCount: 0,
    lastUsedAt: 0,
    hydratedAt: null,
  };
}

function mergeObservedSticker(
  existing: StickerLibraryEntry | undefined,
  sticker: TgAny,
  now: number
): StickerLibraryEntry {
  return {
    sticker: existing ? { ...existing.sticker, ...sticker } : { ...sticker },
    useCount: (existing?.useCount || 0) + 1,
    firstSeenAt: existing?.firstSeenAt || now,
    lastUsedAt: Math.max(existing?.lastUsedAt || 0, now),
  };
}

function compareStickerEntries(a: StickerLibraryEntry, b: StickerLibraryEntry): number {
  return b.useCount - a.useCount
    || b.lastUsedAt - a.lastUsedAt
    || b.firstSeenAt - a.firstSeenAt;
}

function seenMessageIndex(library: StickerLibrary): Set<string> {
  const existing = seenMessageIndexes.get(library);
  if (existing) return existing;
  const created = new Set(library.seenMessageKeys);
  seenMessageIndexes.set(library, created);
  return created;
}

function advanceSeenMessageIndex(
  index: Set<string>,
  previousKeys: string[],
  nextKeys: string[],
  addedKey: string,
  nextLibrary: StickerLibrary
): void {
  index.add(addedKey);
  if (nextKeys.length === previousKeys.length && previousKeys.length >= MAX_SEEN_STICKER_MESSAGES) {
    const evicted = previousKeys[0];
    if (evicted && evicted !== addedKey) index.delete(evicted);
  }
  seenMessageIndexes.set(nextLibrary, index);
}
