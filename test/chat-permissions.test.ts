import { describe, expect, it } from "vitest";
import {
  canPinMessages,
  canSetChatStickerSet,
  hasAdminPermission,
  isBotAdministrator,
} from "../lib/chatPermissions";

describe("Bot API admin permission visibility", () => {
  it("treats owners as having all admin rights", () => {
    const owner = { status: "creator" };
    expect(isBotAdministrator(owner)).toBe(true);
    expect(hasAdminPermission(owner, "can_promote_members")).toBe(true);
  });

  it("only grants explicit administrator rights", () => {
    const admin = {
      status: "administrator",
      can_delete_messages: true,
      can_promote_members: false,
    };
    expect(hasAdminPermission(admin, "can_delete_messages")).toBe(true);
    expect(hasAdminPermission(admin, "can_promote_members")).toBe(false);
    expect(isBotAdministrator({ status: "member" })).toBe(false);
  });

  it("uses the chat-specific pin right and sticker-set capability", () => {
    expect(canPinMessages({ type: "supergroup" }, {
      status: "administrator",
      can_pin_messages: true,
    })).toBe(true);
    expect(canPinMessages({ type: "channel" }, {
      status: "administrator",
      can_pin_messages: true,
      can_edit_messages: false,
    })).toBe(false);
    expect(canPinMessages({ type: "private" }, null)).toBe(true);
    expect(canSetChatStickerSet({ type: "supergroup", can_set_sticker_set: true }, {
      status: "administrator",
      can_change_info: true,
    })).toBe(true);
  });
});
