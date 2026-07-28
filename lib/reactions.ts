import type { TgAny } from "./types";

/** Telegram's currently documented standard reaction emoji. */
export const STANDARD_REACTION_EMOJI = [
  "👍", "👎", "❤", "🔥", "🥰", "👏", "😁", "🤔", "🤯", "😱", "🤬", "😢", "🎉", "🤩", "🤮", "💩",
  "🙏", "👌", "🕊", "🤡", "🥱", "🥴", "😍", "🐳", "❤‍🔥", "🌚", "🌭", "💯", "🤣", "⚡", "🍌", "🏆",
  "💔", "🤨", "😐", "🍓", "🍾", "💋", "🖕", "😈", "😴", "😭", "🤓", "👻", "👨‍💻", "👀", "🎃", "🙈",
  "😇", "😨", "🤝", "✍", "🤗", "🫡", "🎅", "🎄", "☃", "💅", "🤪", "🗿", "🆒", "💘", "🙉", "🦄",
  "😘", "💊", "🙊", "😎", "👾", "🤷", "🤷‍♂", "🤷‍♀", "😡",
] as const;

export function reactionType(value: unknown): TgAny | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const object = value as TgAny;
  return object.type && typeof object.type === "object" && !Array.isArray(object.type)
    ? object.type as TgAny
    : object;
}

export function reactionKey(value: unknown): string {
  const type = reactionType(value);
  if (!type || typeof type.type !== "string") return "";
  if (type.type === "emoji" && typeof type.emoji === "string") return `emoji:${type.emoji}`;
  if (type.type === "custom_emoji" && typeof type.custom_emoji_id === "string") {
    return `custom_emoji:${type.custom_emoji_id}`;
  }
  return type.type;
}

/** Normalizes legacy reaction rows and Telegram ReactionCount objects. */
export function normalizeReactionCounts(values: unknown): TgAny[] {
  if (!Array.isArray(values)) return [];
  const counts = new Map<string, TgAny>();
  for (const value of values) {
    const type = reactionType(value);
    const key = reactionKey(type);
    if (!type || !key) continue;
    const object = value && typeof value === "object" && !Array.isArray(value) ? value as TgAny : {};
    const count = Number.isSafeInteger(object.total_count) && object.total_count > 0
      ? object.total_count
      : 1;
    const current = counts.get(key);
    counts.set(key, { type, total_count: (current?.total_count || 0) + count });
  }
  return [...counts.values()];
}

/** Applies one user's old/new reaction change to the locally observed totals. */
export function applyReactionChange(
  current: unknown,
  oldReactions: unknown,
  newReactions: unknown
): TgAny[] {
  const counts = new Map(normalizeReactionCounts(current).map((item) => [reactionKey(item), item]));
  const adjust = (values: unknown, amount: number) => {
    if (!Array.isArray(values)) return;
    for (const value of values) {
      const type = reactionType(value);
      const key = reactionKey(type);
      if (!type || !key) continue;
      const next = Math.max(0, Number(counts.get(key)?.total_count || 0) + amount);
      if (next === 0) counts.delete(key);
      else counts.set(key, { type, total_count: next });
    }
  };
  adjust(oldReactions, -1);
  adjust(newReactions, 1);
  return [...counts.values()];
}

/** Finds custom emoji ids in messages, entities, reactions, and rich payloads. */
export function collectCustomEmojiIds(value: unknown): string[] {
  const ids = new Set<string>();
  const visit = (candidate: unknown) => {
    if (!candidate || typeof candidate !== "object") return;
    if (Array.isArray(candidate)) {
      for (const item of candidate) visit(item);
      return;
    }
    const object = candidate as Record<string, unknown>;
    if (typeof object.custom_emoji_id === "string" && /^\d+$/.test(object.custom_emoji_id)) {
      ids.add(object.custom_emoji_id);
    }
    for (const nested of Object.values(object)) visit(nested);
  };
  visit(value);
  return [...ids];
}
