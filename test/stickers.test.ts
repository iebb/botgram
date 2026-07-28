import { describe, expect, it } from "vitest";
import type { StoredMessage, TgAny } from "../lib/types";
import {
  emptyStickerLibrary,
  entriesForStickerSet,
  ingestStickerMessage,
  ingestStickerSnapshot,
  mergeStickerSet,
  sortedStickerEntries,
  sortedStickerSets,
  stickerSetNeedsHydration,
} from "../lib/stickers";

function stickerMessage(messageId: number, sticker: TgAny, date = 1_722_222_222): StoredMessage {
  return {
    message_id: messageId,
    date,
    chat: { id: -100707, type: "supergroup", title: "Stickers" },
    sticker,
    _key: `m:${messageId}`,
    _seq: messageId,
  };
}

const wave = {
  file_id: "wave-file",
  file_unique_id: "wave-unique",
  set_name: "FriendlySet",
  emoji: "👋",
  is_animated: true,
  is_video: false,
};

describe("browser-local sticker library", () => {
  it("counts each sticker message once, including after snapshot rescans", () => {
    const message = stickerMessage(1, wave);
    const once = ingestStickerMessage(emptyStickerLibrary("42", 1), message);
    const duplicate = ingestStickerMessage(once, message);
    const rescanned = ingestStickerSnapshot(duplicate, {
      me: null,
      chats: [],
      messages: { "-100707": [message] },
      queries: [],
      rawUpdates: [],
      polling: { running: true, offset: null, lastError: null, lastPollAt: null, updatesSeen: 0 },
      log: [],
    });

    expect(rescanned).toBe(duplicate);
    expect(rescanned.sets.FriendlySet.useCount).toBe(1);
    expect(rescanned.sets.FriendlySet.stickers["wave-unique"].useCount).toBe(1);
    expect(rescanned.seenMessageKeys).toEqual(["-100707:m:1"]);
  });

  it("hydrates the complete received set without losing observed frequency", () => {
    const observed = ingestStickerMessage(emptyStickerLibrary("42", 1), stickerMessage(1, wave));
    expect(stickerSetNeedsHydration(observed, "FriendlySet", wave, 2)).toBe(true);

    const hydrated = mergeStickerSet(observed, {
      name: "FriendlySet",
      title: "Friendly People",
      sticker_type: "regular",
      stickers: [
        { ...wave, file_id: "fresh-wave-file" },
        {
          file_id: "smile-file",
          file_unique_id: "smile-unique",
          emoji: "🙂",
          is_animated: false,
          is_video: false,
        },
      ],
    }, 10);

    const entries = entriesForStickerSet(hydrated.sets.FriendlySet);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      sticker: { file_id: "fresh-wave-file", set_name: "FriendlySet" },
      useCount: 1,
    });
    expect(entries[1]).toMatchObject({ sticker: { file_id: "smile-file" }, useCount: 0 });
    expect(hydrated.sets.FriendlySet.title).toBe("Friendly People");
    expect(stickerSetNeedsHydration(hydrated, "FriendlySet", wave, 11)).toBe(false);
  });

  it("sorts sets and stickers by local use frequency", () => {
    let library = emptyStickerLibrary("42", 1);
    library = ingestStickerMessage(library, stickerMessage(1, wave, 10));
    library = ingestStickerMessage(library, stickerMessage(2, wave, 20));
    library = ingestStickerMessage(library, stickerMessage(3, {
      file_id: "other-file",
      file_unique_id: "other-unique",
      set_name: "OtherSet",
      emoji: "🐈",
    }, 30));

    expect(sortedStickerSets(library).map((set) => set.name)).toEqual(["FriendlySet", "OtherSet"]);
    expect(sortedStickerEntries(library).map((entry) => entry.sticker.file_unique_id)).toEqual([
      "wave-unique",
      "other-unique",
    ]);
  });
});
