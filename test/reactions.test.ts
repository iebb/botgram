import { describe, expect, it } from "vitest";
import { applyReactionChange, normalizeReactionCounts, reactionKey } from "../lib/reactions";

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

  it("accepts legacy flattened reactions from existing IndexedDB snapshots", () => {
    expect(normalizeReactionCounts([
      { type: "emoji", emoji: "👍" },
      { type: "emoji", emoji: "👍" },
    ])).toEqual([{ type: { type: "emoji", emoji: "👍" }, total_count: 2 }]);
  });
});
