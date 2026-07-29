"use client";

import React, { useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "./Store";
import MessageList from "./MessageList";
import Composer from "./Composer";
import GroupPrivacyWarning from "./GroupPrivacyWarning";
import { Avatar, Field, Json, Modal, Select, TextInput, Toggle, useOutsideClick } from "./UI";
import KeyboardBuilder, { buildReplyMarkup, emptyKb, type KbDraft } from "./KeyboardBuilder";
import type { MsgAction } from "./MessageItem";
import type { StoredMessage, TgAny } from "@/lib/types";
import { chatKindLabel, chatName } from "@/lib/format";
import {
  canDeleteOtherMessages,
  canPinMessages,
  isBotAdministrator,
} from "@/lib/chatPermissions";
import {
  IconArrowLeft,
  IconBot,
  IconCode,
  IconCopy,
  IconEdit,
  IconForward,
  IconInfo,
  IconKeyboard,
  IconLocation,
  IconPhoto,
  IconPin,
  IconPoll,
  IconReply,
  IconSmile,
  IconTrash,
  IconUsers,
} from "./Icons";
import CustomEmoji from "./CustomEmoji";
import { reactionType, STANDARD_REACTION_EMOJI } from "@/lib/reactions";

const CustomReactionSelector = dynamic(() => import("./CustomReactionSelector"));

export default function ChatPane({
  onOpenPanel,
  onOpenRichEditor,
  panelOpen,
}: {
  onOpenPanel: (tab: string) => void;
  onOpenRichEditor: () => void;
  panelOpen: boolean;
}) {
  const {
    chat,
    messages,
    state,
    selectedChatId,
    selectChat,
    call,
    notify,
    setReplyTo,
    setEditing,
    botChatMember,
  } = useStore();

  const [menu, setMenu] = useState<{ m: StoredMessage; x: number; y: number } | null>(null);
  const [jsonOf, setJsonOf] = useState<StoredMessage | null>(null);
  const [forwardOf, setForwardOf] = useState<{ m: StoredMessage; copy: boolean } | null>(null);
  const [reactOf, setReactOf] = useState<StoredMessage | null>(null);
  const [markupOf, setMarkupOf] = useState<StoredMessage | null>(null);
  const [mediaOf, setMediaOf] = useState<StoredMessage | null>(null);

  const menuRef = useOutsideClick<HTMLDivElement>(() => setMenu(null));

  if (!chat || !selectedChatId) {
    return (
      <main className="chat-pane">
        <div className="chat-bg" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              background: "var(--service-bg)",
              color: "var(--service-text)",
              padding: "0.5rem 1rem",
              borderRadius: "1rem",
              fontSize: "0.875rem",
              backdropFilter: "blur(4px)",
            }}
          >
            Browser-saved history · the Bot API cannot backfill legacy chats
          </div>
        </div>
      </main>
    );
  }

  const me = state.me;
  const isBotMessage = (m: StoredMessage) => m.from?.id === me?.id;
  const canAdminister = isBotAdministrator(botChatMember);
  const canPin = canPinMessages(chat.chat, botChatMember);

  const onAction: (a: MsgAction, m: StoredMessage, e?: React.MouseEvent) => void = (a, m, e) => {
    if (a === "json" && e) {
      setMenu({ m, x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 420) });
      return;
    }
  };

  const act = async (a: MsgAction, m: StoredMessage) => {
    setMenu(null);
    const chat_id = Number(selectedChatId);
    const ephemeral = typeof m.ephemeral_message_id === "number";
    const receiver_user_id = Number(m.receiver_user?.id || m.from?.id);

    switch (a) {
      case "reply":
        return setReplyTo(m);
      case "edit":
        return setEditing(m);
      case "edit-markup":
        return setMarkupOf(m);
      case "edit-media":
        return setMediaOf(m);
      case "react":
        return setReactOf(m);
      case "forward":
        return setForwardOf({ m, copy: false });
      case "copy":
        return setForwardOf({ m, copy: true });
      case "json":
        return setJsonOf(m);
      case "copy-id":
        navigator.clipboard?.writeText(String(ephemeral ? m.ephemeral_message_id : m.message_id));
        return notify(`${ephemeral ? "ephemeral_message_id" : "message_id"} ${ephemeral ? m.ephemeral_message_id : m.message_id} copied`);
      case "pin": {
        const res = await call("pinChatMessage", { chat_id, message_id: m.message_id });
        if (res.ok) notify("Message pinned");
        return;
      }
      case "unpin": {
        const res = await call("unpinChatMessage", { chat_id, message_id: m.message_id });
        if (res.ok) notify("Message unpinned");
        return;
      }
      case "stop-poll": {
        const res = await call("stopPoll", { chat_id, message_id: m.message_id });
        if (res.ok) notify("Poll stopped");
        return;
      }
      case "live-location": {
        const res = await call("stopMessageLiveLocation", { chat_id, message_id: m.message_id });
        if (res.ok) notify("Live location stopped");
        return;
      }
      case "delete": {
        if (ephemeral && !receiver_user_id) return notify("Receiver user id is unavailable", "err");
        const res = ephemeral
          ? await call("deleteEphemeralMessage", {
              chat_id,
              receiver_user_id,
              ephemeral_message_id: m.ephemeral_message_id,
            })
          : await call(
              "deleteMessage",
              { chat_id, message_id: m.message_id },
              { deleteChatId: chat_id, deleteMessageIds: [m.message_id] }
            );
        if (res.ok) notify("Message deleted");
        return;
      }
    }
  };

  const pinned = chat.chat.pinned_message as TgAny | undefined;

  return (
    <main className="chat-pane">
      <div className="chat-bg" />

      {/* ------------------------------------------------------- header */}
      <div className="topbar" style={{ background: "var(--bg)" }}>
        <button
          className="icon-btn only-narrow"
          onClick={() => selectChat(null)}
          aria-label="Back to chat list"
        >
          <IconArrowLeft />
        </button>
        <Avatar
          id={chat.chat.id}
          name={chatName(chat.chat)}
          size="sm"
          entity={chat.chat}
          avatarKind={chat.chat.type === "private" ? "user" : "chat"}
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="truncate-1" style={{ fontWeight: 500 }}>
            {chatName(chat.chat)}
          </div>
          <div className="truncate-1 muted" style={{ fontSize: "0.75rem" }}>
            {chatKindLabel(chat.chat)} · id {chat.chat.id}
            {chat.chat.username ? ` · @${chat.chat.username}` : ""}
          </div>
        </div>
        <button
          className="icon-btn"
          title="Bot tools for this chat"
          onClick={() => onOpenPanel("send")}
        >
          <IconBot />
        </button>
        {canAdminister && (
          <button
            className="icon-btn"
            title="Members & admin"
            onClick={() => onOpenPanel("admin")}
          >
            <IconUsers />
          </button>
        )}
        <button
          className={`icon-btn${panelOpen ? " active" : ""}`}
          title="Chat info"
          onClick={() => onOpenPanel("info")}
        >
          <IconInfo />
        </button>
      </div>

      {(chat.chat.type === "group" || chat.chat.type === "supergroup") && <GroupPrivacyWarning />}

      {pinned && (
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            gap: "0.5rem",
            alignItems: "center",
            padding: "0.375rem 0.875rem",
            background: "var(--bg)",
            borderBottom: "1px solid var(--sidebar-border)",
            fontSize: "0.8125rem",
          }}
        >
          <IconPin size={16} style={{ color: "var(--accent)" }} />
          <div className="truncate-1">
            <span style={{ color: "var(--accent)", fontWeight: 500 }}>Pinned: </span>
            {pinned.text || pinned.caption || "media"}
          </div>
        </div>
      )}

      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", minHeight: 0 }}>
        <MessageList
          messages={messages}
          meId={me?.id}
          chatType={chat.chat.type}
          onAction={onAction}
        />
      </div>

      <div style={{ position: "relative", zIndex: 2 }}>
        <Composer onOpenRichEditor={onOpenRichEditor} />
      </div>

      {/* -------------------------------------------------- context menu */}
      {menu && (
        <div ref={menuRef} className="ctx-menu" style={{ left: menu.x, top: menu.y }}>
          {(() => {
            const ephemeral = typeof menu.m.ephemeral_message_id === "number";
            const canDelete = isBotMessage(menu.m)
              || chat.chat.type === "private"
              || canDeleteOtherMessages(botChatMember);
            return <>
          <MenuItem icon={<IconReply size={17} />} label="Reply" onClick={() => act("reply", menu.m)} />
          {isBotMessage(menu.m) && (menu.m.text || menu.m.caption) && (
            <MenuItem icon={<IconEdit size={17} />} label="Edit text" onClick={() => act("edit", menu.m)} />
          )}
          {isBotMessage(menu.m) && (
            <MenuItem
              icon={<IconKeyboard size={17} />}
              label="Edit inline keyboard"
              onClick={() => act("edit-markup", menu.m)}
            />
          )}
          {isBotMessage(menu.m) &&
            (menu.m.photo || menu.m.video || menu.m.document || menu.m.audio || menu.m.animation) && (
              <MenuItem
                icon={<IconPhoto size={17} />}
                label="Replace media"
                onClick={() => act("edit-media", menu.m)}
              />
            )}
          {!ephemeral && <MenuItem icon={<IconSmile size={17} />} label="Set reaction" onClick={() => act("react", menu.m)} />}
          {!ephemeral && <MenuItem icon={<IconForward size={17} />} label="Forward to…" onClick={() => act("forward", menu.m)} />}
          {!ephemeral && <MenuItem icon={<IconCopy size={17} />} label="Copy to… (no author)" onClick={() => act("copy", menu.m)} />}
          {!ephemeral && canPin && <MenuItem icon={<IconPin size={17} />} label="Pin" onClick={() => act("pin", menu.m)} />}
          {!ephemeral && canPin && <MenuItem icon={<IconPin size={17} />} label="Unpin" onClick={() => act("unpin", menu.m)} />}
          {!ephemeral && menu.m.poll && !menu.m.poll.is_closed && (
            <MenuItem icon={<IconPoll size={17} />} label="Stop poll" onClick={() => act("stop-poll", menu.m)} />
          )}
          {!ephemeral && menu.m.location?.live_period && (
            <MenuItem
              icon={<IconLocation size={17} />}
              label="Stop live location"
              onClick={() => act("live-location", menu.m)}
            />
          )}
          <MenuItem
            icon={<IconCopy size={17} />}
            label={`Copy ${ephemeral ? "ephemeral_message_id" : "message_id"} (${ephemeral ? menu.m.ephemeral_message_id : menu.m.message_id})`}
            onClick={() => act("copy-id", menu.m)}
          />
          <MenuItem icon={<IconCode size={17} />} label="Inspect JSON" onClick={() => act("json", menu.m)} />
          {canDelete && (
            <>
              <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0.25rem 0" }} />
              <MenuItem
                icon={<IconTrash size={17} />}
                label="Delete"
                danger
                onClick={() => act("delete", menu.m)}
              />
            </>
          )}
            </>;
          })()}
        </div>
      )}

      {/* --------------------------------------------------------- modals */}
      {jsonOf && (
        <Modal title={`Message ${jsonOf.message_id}`} onClose={() => setJsonOf(null)} wide>
          <Json value={jsonOf} />
        </Modal>
      )}

      {forwardOf && (
        <ForwardModal
          message={forwardOf.m}
          copy={forwardOf.copy}
          onClose={() => setForwardOf(null)}
        />
      )}

      {reactOf && <ReactionModal message={reactOf} onClose={() => setReactOf(null)} />}

      {markupOf && <MarkupModal message={markupOf} onClose={() => setMarkupOf(null)} />}

      {mediaOf && <EditMediaModal message={mediaOf} onClose={() => setMediaOf(null)} />}
    </main>
  );
}

function MenuItem({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button className={`ctx-item${danger ? " danger" : ""}`} onClick={onClick}>
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------- forward */

function ForwardModal({
  message,
  copy,
  onClose,
}: {
  message: StoredMessage;
  copy: boolean;
  onClose: () => void;
}) {
  const { state, call, notify, selectedChatId } = useStore();
  const [target, setTarget] = useState<string>("");
  const [manual, setManual] = useState("");
  const [silent, setSilent] = useState(false);
  const [protect, setProtect] = useState(false);
  const [removeCaption, setRemoveCaption] = useState(false);

  const go = async () => {
    const chat_id = manual.trim() || target;
    if (!chat_id) return notify("Pick a target chat", "err");
    const res = await call(copy ? "copyMessage" : "forwardMessage", {
      chat_id: /^-?\d+$/.test(String(chat_id)) ? Number(chat_id) : chat_id,
      from_chat_id: Number(selectedChatId),
      message_id: message.message_id,
      disable_notification: silent || undefined,
      protect_content: protect || undefined,
      remove_caption: copy && removeCaption ? true : undefined,
    });
    if (res.ok) {
      notify(copy ? "Message copied" : "Message forwarded");
      onClose();
    }
  };

  return (
    <Modal
      title={copy ? "Copy message to…" : "Forward message to…"}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={go}>
            {copy ? "Copy" : "Forward"}
          </button>
        </>
      }
    >
      <Field label="Known chat">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          options={[
            { value: "", label: "— pick a chat —" },
            ...state.chats.map((c) => ({
              value: String(c.chat.id),
              label: `${chatName(c.chat)} (${c.chat.id})`,
            })),
          ]}
        />
      </Field>
      <Field label="…or a chat_id / @channelusername">
        <TextInput value={manual} onChange={(e) => setManual(e.target.value)} placeholder="@mychannel or -1001234567890" />
      </Field>
      <Toggle checked={silent} onChange={setSilent} label="Silent" />
      <Toggle checked={protect} onChange={setProtect} label="Protect content" />
      {copy && <Toggle checked={removeCaption} onChange={setRemoveCaption} label="Remove caption" />}
    </Modal>
  );
}

/* ------------------------------------------------------------ reaction */

function ReactionModal({ message, onClose }: { message: StoredMessage; onClose: () => void }) {
  const { call, chat, notify, selectedChatId, setLocalBotReaction } = useStore();
  const initial = reactionType(message._botReactions?.[0]);
  const [tab, setTab] = useState<"emoji" | "custom">(initial?.type === "custom_emoji" ? "custom" : "emoji");
  const [picked, setPicked] = useState<string[]>(initial?.type === "emoji" ? [String(initial.emoji || "")] : []);
  const [big, setBig] = useState(false);
  const [customId, setCustomId] = useState(initial?.type === "custom_emoji" ? String(initial.custom_emoji_id || "") : "");
  const advertised = Array.isArray(chat?.chat.available_reactions) ? chat.chat.available_reactions : null;
  const reactionChoices = advertised
    ? advertised
        .map((value: unknown) => reactionType(value))
        .filter((value): value is TgAny => value?.type === "emoji" && typeof value.emoji === "string")
        .map((value) => value.emoji as string)
    : [...STANDARD_REACTION_EMOJI];

  const apply = async () => {
    const normalizedCustomId = tab === "custom" ? customId.trim() : "";
    if (normalizedCustomId && !/^\d+$/.test(normalizedCustomId)) {
      notify("Enter a numeric Telegram custom emoji id", "err");
      return;
    }
    if (normalizedCustomId) {
      const lookup = await call<TgAny[]>("getCustomEmojiStickers", {
        custom_emoji_ids: [normalizedCustomId],
      });
      if (!lookup.ok) return;
      if (!(lookup.result || []).some((sticker) => String(sticker.custom_emoji_id || "") === normalizedCustomId)) {
        notify("Telegram could not resolve that custom emoji", "err");
        return;
      }
    }
    const reaction = normalizedCustomId
      ? [{ type: "custom_emoji", custom_emoji_id: normalizedCustomId }]
      : picked.map((emoji) => ({ type: "emoji", emoji }));
    const observationId = `reaction:${crypto.randomUUID()}`;
    const res = await call(
      "setMessageReaction",
      {
        chat_id: Number(selectedChatId),
        message_id: message.message_id,
        reaction,
        is_big: big || undefined,
      },
      { reactionLocalId: observationId }
    );
    if (res.ok) {
      setLocalBotReaction(String(selectedChatId), message.message_id, reaction, observationId);
      notify(reaction.length ? "Reaction set" : "Reaction removed");
      onClose();
    }
  };

  return (
    <Modal
      title="Set reaction (as the bot)"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => {
            setPicked([]);
            setCustomId("");
          }}>
            Clear
          </button>
          <button className="btn primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <div className="reaction-picker-tabs" role="tablist" aria-label="Reaction kind">
        <button type="button" className={tab === "emoji" ? "active" : ""} onClick={() => setTab("emoji")} role="tab" aria-selected={tab === "emoji"}>Emoji</button>
        <button type="button" className={tab === "custom" ? "active" : ""} onClick={() => setTab("custom")} role="tab" aria-selected={tab === "custom"}>Custom emoji</button>
      </div>

      {tab === "emoji" ? (
        <div className="reaction-emoji-grid">
          {reactionChoices.map((emoji) => (
            <button
              type="button"
              key={emoji}
              className={picked.includes(emoji) && !customId ? "selected" : ""}
              aria-pressed={picked.includes(emoji) && !customId}
              onClick={() => {
                setCustomId("");
                setPicked((current) => current[0] === emoji ? [] : [emoji]);
              }}
            >
              {emoji}
            </button>
          ))}
          {!reactionChoices.length && <span className="muted">This chat currently advertises no standard reactions.</span>}
        </div>
      ) : (
        <>
          <CustomReactionSelector
            selectedId={customId}
            onSelect={(sticker) => {
              setPicked([]);
              setCustomId(String(sticker.custom_emoji_id || ""));
            }}
          />
          <Field label="Custom emoji id" hint="You can also paste a numeric Telegram custom emoji id.">
            <TextInput value={customId} onChange={(event) => {
              setPicked([]);
              setCustomId(event.target.value.trim());
            }} />
          </Field>
          {/^\d+$/.test(customId) && (
            <div className="custom-reaction-preview">
              <CustomEmoji id={customId} fallback="🙂" />
              <span>Selected Telegram custom emoji</span>
            </div>
          )}
        </>
      )}
      <Toggle checked={big} onChange={setBig} label="Big animation (is_big)" />
      <p className="muted" style={{ fontSize: "0.75rem" }}>
        A bot may set exactly one reaction per message. A custom reaction must already be present
        on the message or be allowed by the chat administrators. Applying an empty selection removes it.
        Telegram does not send reaction updates for reactions set by bots, so Humanoid mirrors a successful change into this browser immediately.
      </p>
    </Modal>
  );
}

/* -------------------------------------------------------- edit markup */

function MarkupModal({ message, onClose }: { message: StoredMessage; onClose: () => void }) {
  const { call, notify, selectedChatId } = useStore();
  const [kb, setKb] = useState<KbDraft>(() => fromMarkup(message.reply_markup));

  const apply = async () => {
    const ephemeral = typeof message.ephemeral_message_id === "number";
    const receiverUserId = Number(message.receiver_user?.id || message.from?.id);
    if (ephemeral && !receiverUserId) return notify("Receiver user id is unavailable", "err");
    const res = await call(ephemeral ? "editEphemeralMessageReplyMarkup" : "editMessageReplyMarkup", {
      chat_id: Number(selectedChatId),
      message_id: ephemeral ? undefined : message.message_id,
      ephemeral_message_id: ephemeral ? message.ephemeral_message_id : undefined,
      receiver_user_id: ephemeral ? receiverUserId : undefined,
      reply_markup: buildReplyMarkup(kb) ?? { inline_keyboard: [] },
    });
    if (res.ok) {
      notify("Keyboard updated");
      onClose();
    }
  };

  return (
    <Modal
      title="Edit inline keyboard"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={() => setKb({ ...kb, mode: "inline", rows: [[]] })}>
            Remove all
          </button>
          <button className="btn primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <KeyboardBuilder value={kb} onChange={setKb} />
      <div className="section-title" style={{ marginTop: "0.75rem" }}>
        reply_markup
      </div>
      <Json value={buildReplyMarkup(kb) ?? { inline_keyboard: [] }} />
    </Modal>
  );
}

/** Best-effort reverse of buildReplyMarkup so editing starts from what's there. */
function fromMarkup(markup?: TgAny): KbDraft {
  if (!markup?.inline_keyboard) return { ...emptyKb, mode: "inline" };
  const rows = markup.inline_keyboard.map((row: TgAny[]) =>
    row.map((b) => {
      const kind =
        (b.url && "url") ||
        (b.callback_data && "callback_data") ||
        (b.web_app && "web_app") ||
        (b.login_url && "login_url") ||
        (b.switch_inline_query !== undefined && "switch_inline_query") ||
        (b.switch_inline_query_current_chat !== undefined &&
          "switch_inline_query_current_chat") ||
        (b.copy_text && "copy_text") ||
        (b.pay && "pay") ||
        (b.callback_game && "callback_game") ||
        "callback_data";
      const value =
        b.url ||
        b.callback_data ||
        b.web_app?.url ||
        b.login_url?.url ||
        b.switch_inline_query ||
        b.switch_inline_query_current_chat ||
        b.copy_text?.text ||
        "";
      return { text: b.text, kind: kind as string, value: String(value) };
    })
  );
  return { ...emptyKb, mode: "inline", rows };
}

/* --------------------------------------------------------- edit media */

function EditMediaModal({ message, onClose }: { message: StoredMessage; onClose: () => void }) {
  const { call, upload, notify, selectedChatId } = useStore();
  const [type, setType] = useState(
    message.photo ? "photo" : message.video ? "video" : message.animation ? "animation" : "document"
  );
  const ephemeral = typeof message.ephemeral_message_id === "number";
  const [source, setSource] = useState<"upload" | "ref">(ephemeral ? "ref" : "upload");
  const [file, setFile] = useState<File | null>(null);
  const [ref, setRef] = useState("");
  const [caption, setCaption] = useState(message.caption || "");

  const apply = async () => {
    const receiverUserId = Number(message.receiver_user?.id || message.from?.id);
    if (ephemeral && !receiverUserId) return notify("Receiver user id is unavailable", "err");
    if (ephemeral && source === "upload") return notify("Telegram does not allow new uploads in ephemeral edits", "err");
    const media: TgAny = {
      type,
      media: source === "upload" ? "attach://newmedia" : ref,
      caption: caption || undefined,
      parse_mode: caption ? "MarkdownV2" : undefined,
    };
    const params = {
      chat_id: Number(selectedChatId),
      message_id: ephemeral ? undefined : message.message_id,
      ephemeral_message_id: ephemeral ? message.ephemeral_message_id : undefined,
      receiver_user_id: ephemeral ? receiverUserId : undefined,
      media,
    };
    const res =
      !ephemeral && source === "upload" && file
        ? await upload("editMessageMedia", params, { newmedia: file })
        : await call(ephemeral ? "editEphemeralMessageMedia" : "editMessageMedia", params);
    if (res.ok) {
      notify("Media replaced");
      onClose();
    }
  };

  return (
    <Modal
      title="Replace media"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={apply}>
            Apply
          </button>
        </>
      }
    >
      <Field label="Type">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={["photo", "video", "animation", "audio", "document"]}
        />
      </Field>
      <Field label="Source">
        <Select
          value={source}
          onChange={(e) => setSource(e.target.value as any)}
          options={ephemeral
            ? [{ value: "ref", label: "Existing file_id or URL (required for ephemeral edits)" }]
            : [
                { value: "upload", label: "Upload a file" },
                { value: "ref", label: "file_id or URL" },
              ]}
        />
      </Field>
      {source === "upload" ? (
        <Field label="File">
          <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </Field>
      ) : (
        <Field label="file_id / URL">
          <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
        </Field>
      )}
      <Field label="Caption">
        <TextInput value={caption} onChange={(e) => setCaption(e.target.value)} />
      </Field>
    </Modal>
  );
}
