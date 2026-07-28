import { describe, expect, it } from "vitest";
import { ALL_METHODS } from "../lib/methods";
import { ALL_UPDATE_TYPES } from "../lib/updateTypes";

describe("Bot API 10.2 catalogue", () => {
  it("contains the complete July 2026 method and update sets without duplicates", () => {
    expect(ALL_METHODS).toHaveLength(185);
    expect(new Set(ALL_METHODS).size).toBe(185);
    expect(ALL_UPDATE_TYPES).toHaveLength(26);
    expect(new Set(ALL_UPDATE_TYPES).size).toBe(26);
    expect(ALL_METHODS).toEqual(expect.arrayContaining([
      "sendRichMessage",
      "sendLivePhoto",
      "answerGuestQuery",
      "answerChatJoinRequestQuery",
      "editEphemeralMessageText",
      "deleteEphemeralMessage",
      "getManagedBotToken",
    ]));
  });
});
