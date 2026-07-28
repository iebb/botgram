import "fake-indexeddb/auto";
import { afterAll, describe, expect, it } from "vitest";
import type { AppSnapshot } from "../lib/types";
import { emptyStickerLibrary, mergeStickerSet } from "../lib/stickers";
import {
  BROWSER_DB_NAME,
  clearDashboard,
  clearStickerLibrary,
  closeBrowserDatabase,
  loadDashboard,
  loadPreference,
  loadRichDraft,
  loadStickerLibrary,
  saveDashboard,
  savePreference,
  saveRichDraft,
  saveStickerLibrary,
} from "../lib/client/indexedDb";

const BOT_ID = "424242";
const CHAT_ID = "-100707";

const snapshot: AppSnapshot = {
  me: { id: Number(BOT_ID), is_bot: true, first_name: "Humanoid" },
  chats: [{
    chat: { id: Number(CHAT_ID), type: "supergroup", title: "Saved locally" },
    lastActivity: 1_722_222_222_000,
    unread: 1,
    knownUsers: { "707": { id: 707, is_bot: false, first_name: "Ada" } },
  }],
  messages: {
    [CHAT_ID]: [{
      message_id: 9,
      date: 1_722_222_222,
      chat: { id: Number(CHAT_ID), type: "supergroup", title: "Saved locally" },
      from: { id: 707, is_bot: false, first_name: "Ada" },
      text: "IndexedDB survives reloads",
      _key: "m:9",
      _seq: 1,
    }],
  },
  queries: [],
  rawUpdates: [{ update_id: 100, message: { text: "IndexedDB survives reloads" } }],
  polling: { running: true, offset: null, lastError: null, lastPollAt: 1_722_222_222_000, updatesSeen: 1 },
  log: [],
};

afterAll(async () => {
  await closeBrowserDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(BROWSER_DB_NAME);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("Test IndexedDB deletion was blocked"));
  });
});

describe("browser IndexedDB state", () => {
  it("round-trips a per-bot dashboard without losing Telegram payloads", async () => {
    await saveDashboard({
      version: 1,
      botId: BOT_ID,
      savedAt: 1_722_222_223_000,
      snapshot,
      avatarFileIds: { "user:707": "avatar-file-id" },
      selectedChatId: CHAT_ID,
    });

    await expect(loadDashboard(BOT_ID)).resolves.toMatchObject({
      botId: BOT_ID,
      snapshot: {
        messages: { [CHAT_ID]: [{ text: "IndexedDB survives reloads", _key: "m:9" }] },
        rawUpdates: [{ update_id: 100 }],
      },
      avatarFileIds: { "user:707": "avatar-file-id" },
      selectedChatId: CHAT_ID,
    });
    await expect(loadDashboard("different-bot")).resolves.toBeNull();
  });

  it("keeps preferences and rich drafts separate from clearable chat history", async () => {
    await savePreference("theme", "light");
    await saveRichDraft(BOT_ID, { version: 1, source: "<h1>Draft</h1>" });
    await clearDashboard(BOT_ID);

    await expect(loadDashboard(BOT_ID)).resolves.toBeNull();
    await expect(loadPreference("theme")).resolves.toBe("light");
    await expect(loadRichDraft(BOT_ID)).resolves.toEqual({ version: 1, source: "<h1>Draft</h1>" });
  });

  it("round-trips and clears the per-bot sticker catalog", async () => {
    const library = mergeStickerSet(emptyStickerLibrary(BOT_ID, 1), {
      name: "AnimatedFriends",
      title: "Animated Friends",
      sticker_type: "regular",
      stickers: [{
        file_id: "animated-file-id",
        file_unique_id: "animated-unique-id",
        emoji: "👋",
        is_animated: true,
        is_video: false,
      }],
    }, 2);

    await saveStickerLibrary(library);
    await expect(loadStickerLibrary(BOT_ID)).resolves.toMatchObject({
      botId: BOT_ID,
      sets: {
        AnimatedFriends: {
          title: "Animated Friends",
          order: ["animated-unique-id"],
        },
      },
    });
    await clearStickerLibrary(BOT_ID);
    await expect(loadStickerLibrary(BOT_ID)).resolves.toBeNull();
  });
});
