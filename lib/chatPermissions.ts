import type { TgAny, TgChat } from "./types";

export type AdminPermission =
  | "can_manage_chat"
  | "can_delete_messages"
  | "can_manage_video_chats"
  | "can_restrict_members"
  | "can_promote_members"
  | "can_change_info"
  | "can_invite_users"
  | "can_post_stories"
  | "can_edit_stories"
  | "can_delete_stories"
  | "can_post_messages"
  | "can_edit_messages"
  | "can_pin_messages"
  | "can_manage_topics"
  | "can_manage_direct_messages"
  | "can_manage_tags";

export function isBotAdministrator(member: TgAny | null | undefined): boolean {
  return member?.status === "creator" || member?.status === "administrator";
}

export function hasAdminPermission(
  member: TgAny | null | undefined,
  permission: AdminPermission
): boolean {
  if (member?.status === "creator") return true;
  return member?.status === "administrator" && member?.[permission] === true;
}

export function canPinMessages(
  chat: TgChat | TgAny | null | undefined,
  member: TgAny | null | undefined
): boolean {
  if (chat?.type === "private") return true;
  return chat?.type === "channel"
    ? hasAdminPermission(member, "can_edit_messages")
    : hasAdminPermission(member, "can_pin_messages");
}

export function canDeleteOtherMessages(member: TgAny | null | undefined): boolean {
  return hasAdminPermission(member, "can_delete_messages");
}

export function canSetChatStickerSet(
  chat: TgChat | TgAny | null | undefined,
  member: TgAny | null | undefined
): boolean {
  return chat?.type === "supergroup"
    && chat?.can_set_sticker_set === true
    && hasAdminPermission(member, "can_change_info");
}
