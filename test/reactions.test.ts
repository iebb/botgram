import { describe, expect, it } from "vitest";
import {
  applyReactionChange,
  collectCustomEmojiIds,
  normalizeReactionCounts,
  reactionKey,
} from "../lib/reactions";

describe("reaction display state", () => {
  it("normalizes emoji, custom emoji, and paid reaction counts", () => {
    expect(normalizeReactionCounts([
      { type: { type: "emoji", emoji: "👋" }, total_count: 2 },
      { type: { type: "custom_emoji", custom_emoji_id: "custom-1" }, total_count: 1 },
      { type: { type: "paid" }, total_count: 3 },
    ])).toEqual([
      { type: { type: "emoji", emoji: "👋" }, total_count: 2 },
      { type: { type: "custom_emoji", custom_emoji_id: "custom-1" }, total_count: 1 },
      { type: { type: "paid" }, total_count: 3 },
    ]);
  });

  it("applies individual reaction changes without discarding other users", () => {
    const initial = [{ type: { type: "emoji", emoji: "👋" }, total_count: 2 }];
    const changed = applyReactionChange(
      initial,
      [{ type: "emoji", emoji: "👋" }],
      [{ type: "custom_emoji", custom_emoji_id: "custom-1" }]
    );

    expect(changed).toEqual([
      { type: { type: "emoji", emoji: "👋" }, total_count: 1 },
      { type: { type: "custom_emoji", custom_emoji_id: "custom-1" }, total_count: 1 },
    ]);
    expect(reactionKey(changed[1])).toBe("custom_emoji:custom-1");
  });

  it("keeps an optimistic bot reaction idempotent when the Worker event also arrives", () => {
    const custom = [{ type: "custom_emoji", custom_emoji_id: "custom-1" }];
    const first = applyReactionChange([], [], custom);
    const mirroredAgain = applyReactionChange(first, custom, custom);
    expect(mirroredAgain).toEqual(first);
  });

  it("accepts legacy flattened reactions from existing IndexedDB snapshots", () => {
    expect(normalizeReactionCounts([
      { type: "emoji", emoji: "👍" },
      { type: "emoji", emoji: "👍" },
    ])).toEqual([{ type: { type: "emoji", emoji: "👍" }, total_count: 2 }]);
  });

  it("collects custom emoji ids from entities, reactions, and nested rich values", () => {
    expect(collectCustomEmojiIds({
      entities: [{ type: "custom_emoji", custom_emoji_id: "111" }],
      reactions: [{ type: { type: "custom_emoji", custom_emoji_id: "222" } }],
      nested: [{ custom_emoji_id: "111" }, { custom_emoji_id: "not-an-id" }],
    })).toEqual(["111", "222"]);
  });
});
