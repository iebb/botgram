"use client";

import React, { useState } from "react";
import type { StoredMessage, TgAny } from "@/lib/types";
import { chatName, messagePreview, serviceText, timeHHMM, userName } from "@/lib/format";
import { MessageContent } from "./MessageContent";
import { InlineKeyboard, ReplyKeyboardPreview } from "./Keyboards";
import { Avatar } from "./UI";
import { IconChecks, IconDots, IconPin } from "./Icons";
import CustomEmoji from "./CustomEmoji";
import { normalizeReactionCounts, reactionKey, reactionType } from "@/lib/reactions";

export type MsgAction =
  | "reply"
  | "edit"
  | "edit-markup"
  | "edit-media"
  | "delete"
  | "forward"
  | "copy"
  | "pin"
  | "unpin"
  | "react"
  | "stop-poll"
  | "json"
  | "copy-id"
  | "live-location";

export function MessageItem({
  m,
  out,
  showSender,
  showAvatar,
  tail,
  chatType,
  onAction,
  onJumpTo,
}: {
  m: StoredMessage;
  out: boolean;
  showSender: boolean;
  showAvatar: boolean;
  tail: boolean;
  chatType?: string;
  onAction: (a: MsgAction, m: StoredMessage, e?: React.MouseEvent) => void;
  onJumpTo?: (messageId: number) => void;
}) {
  const [hover, setHover] = useState(false);
  const service = serviceText(m);
  const sender = m.from || m.sender_chat;
  const senderName = m.from ? userName(m.from) : m.sender_chat ? chatName(m.sender_chat) : "Unknown";

  if (service && !m.text && !m.photo) {
    return <div className="service-msg">{service}</div>;
  }

  const mediaOnly =
    !m.text &&
    !m.caption &&
    (m.sticker || m.video_note || m.dice) &&
    !m.reply_to_message;

  const reactions = normalizeReactionCounts(m._reactions);

  return (
    <div
      className={`msg-row ${out ? "out" : "in"}${tail ? " grouped-end" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      id={`msg-${m.message_id}`}
    >
      {!out && chatType !== "private" && (
        <div style={{ width: "2.375rem", flexShrink: 0, alignSelf: "flex-end" }}>
          {showAvatar && sender && (
            <Avatar
              id={sender.id}
              name={senderName}
              size="sm"
              entity={sender}
              avatarKind={m.from ? "user" : "chat"}
            />
          )}
        </div>
      )}

      {out && hover && (
        <MenuButton onClick={(e) => onAction("json", m, e)} side="left" />
      )}

      <div
        className={`bubble ${out ? "out" : "in"}${tail ? (out ? " tail-out" : " tail-in") : ""}${
          mediaOnly ? " media-only" : ""
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          onAction("json", m, e);
        }}
      >
        {tail && !mediaOnly && <Tail out={out} />}

        {showSender && !out && sender && chatType !== "private" && (
          <div className="msg-sender" style={{ color: "var(--accent)" }}>
            {senderName}
          </div>
        )}

        {m.forward_origin && <ForwardHeader origin={m.forward_origin} />}

        {m.reply_to_message && (
          <div
            className="reply-quote"
            onClick={() => onJumpTo?.(m.reply_to_message.message_id)}
          >
            <div style={{ fontWeight: 500, fontSize: "0.75rem" }}>
              {m.reply_to_message.from
                ? userName(m.reply_to_message.from)
                : chatName(m.reply_to_message.chat)}
            </div>
            <div className="truncate-1" style={{ opacity: 0.85 }}>
              {messagePreview(m.reply_to_message)}
            </div>
          </div>
        )}

        {m.external_reply && (
          <div className="reply-quote">
            <div style={{ fontWeight: 500, fontSize: "0.75rem" }}>Reply to another chat</div>
          </div>
        )}

        {m.quote && (
          <div className="reply-quote" style={{ opacity: 0.85 }}>
            <div className="truncate-1">“{m.quote.text}”</div>
          </div>
        )}

        <MessageContent m={m} out={out} />

        {reactions.length > 0 && (
          <div className="message-reactions" aria-label="Message reactions">
            {reactions.map((reaction: TgAny) => (
              <ReactionChip key={reactionKey(reaction)} reaction={reaction} />
            ))}
          </div>
        )}

        <div className="msg-meta">
          {m.author_signature && <span>{m.author_signature} </span>}
          {m.is_pinned && <IconPin size={11} />}
          {m.edit_date && <span>edited</span>}
          {m.has_protected_content && <span title="protected content">🔒</span>}
          <span>{timeHHMM(m.date)}</span>
          {out && <IconChecks size={15} style={{ marginRight: "-0.125rem" }} />}
        </div>

        {m.reply_markup?.inline_keyboard && <InlineKeyboard markup={m.reply_markup} />}
        {m.reply_markup && !m.reply_markup.inline_keyboard && (
          <ReplyKeyboardPreview markup={m.reply_markup} />
        )}
      </div>

      {!out && hover && <MenuButton onClick={(e) => onAction("json", m, e)} side="right" />}
    </div>
  );
}

function ReactionChip({ reaction }: { reaction: TgAny }) {
  const type = reactionType(reaction);
  const count = Number(reaction.total_count) || 1;
  if (!type) return null;
  return (
    <span className="message-reaction" title={`${count} reaction${count === 1 ? "" : "s"}`}>
      {type.type === "custom_emoji" ? (
        <CustomEmoji
          id={String(type.custom_emoji_id || "")}
          fallback="🙂"
          className="reaction-custom-emoji"
        />
      ) : type.type === "paid" ? (
        <span aria-label="Paid reaction">⭐</span>
      ) : (
        <span>{String(type.emoji || "👍")}</span>
      )}
      {count > 1 && <span className="message-reaction-count">{count}</span>}
    </span>
  );
}

function MenuButton({
  onClick,
  side,
}: {
  onClick: (e: React.MouseEvent) => void;
  side: "left" | "right";
}) {
  return (
    <button
      className="icon-btn"
      style={{
        width: "1.75rem",
        height: "1.75rem",
        alignSelf: "flex-end",
        margin: side === "left" ? "0 0.25rem 0.25rem 0" : "0 0 0.25rem 0.25rem",
        background: "rgba(127,127,127,.2)",
      }}
      onClick={onClick}
      aria-label="Message actions"
    >
      <IconDots size={16} />
    </button>
  );
}

function Tail({ out }: { out: boolean }) {
  return (
    <svg className={`bubble-tail ${out ? "out" : "in"}`} viewBox="0 0 11 20" aria-hidden>
      {out ? (
        <path d="M0 8c0 7 3 11 11 12H0z" fill="currentColor" />
      ) : (
        <path d="M11 8c0 7-3 11-11 12h11z" fill="currentColor" />
      )}
    </svg>
  );
}

function ForwardHeader({ origin }: { origin: TgAny }) {
  let who = "Unknown";
  if (origin.type === "user") who = userName(origin.sender_user);
  else if (origin.type === "hidden_user") who = origin.sender_user_name;
  else if (origin.type === "chat") who = chatName(origin.sender_chat);
  else if (origin.type === "channel") who = chatName(origin.chat);

  return (
    <div style={{ fontSize: "0.8125rem", marginBottom: "0.125rem" }}>
      <span className="muted">Forwarded from </span>
      <span style={{ fontWeight: 500, color: "var(--accent)" }}>{who}</span>
    </div>
  );
}
