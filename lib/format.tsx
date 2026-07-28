"use client";

import React from "react";
import type { TgAny, TgChat, TgMessage, TgUser } from "./types";

/* ------------------------------------------------------------------ names */

export function userName(u?: TgUser | TgAny | null): string {
  if (!u) return "Unknown";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id);
}

export function chatName(c?: TgChat | TgAny | null): string {
  if (!c) return "Unknown chat";
  if (c.title) return c.title;
  const n = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return n || c.username || String(c.id);
}

export function chatKindLabel(c?: TgChat | TgAny | null): string {
  switch (c?.type) {
    case "private":
      return "private chat";
    case "group":
      return "group";
    case "supergroup":
      return c?.is_forum ? "forum" : "supergroup";
    case "channel":
      return "channel";
    default:
      return "chat";
  }
}

/* --------------------------------------------------------------- avatars */

// The seven peer colours Telegram cycles through.
const AVATAR_COLORS = [
  ["#ff845e", "#e5645e"], // red
  ["#fdbb50", "#f6a24c"], // orange
  ["#b694f9", "#8f74e0"], // violet
  ["#9ad164", "#67b35c"], // green
  ["#6ec9cb", "#54b3b8"], // cyan
  ["#7bc4ff", "#5aa5e8"], // blue
  ["#ff8aac", "#ee6a95"], // pink
];

export function avatarGradient(id: number | string): string {
  const n = Math.abs(Number(String(id).replace(/[^0-9]/g, "")) || 0);
  const [a, b] = AVATAR_COLORS[n % AVATAR_COLORS.length];
  return `linear-gradient(180deg, ${a} 0%, ${b} 100%)`;
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return [...parts[0]][0]?.toUpperCase() ?? "?";
  return ([...parts[0]][0] + [...parts[parts.length - 1]][0]).toUpperCase();
}

/* ------------------------------------------------------------------ time */

export function timeHHMM(unix: number): string {
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function dayLabel(unix: number): string {
  const d = new Date(unix * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86_400_000);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yest)) return "Yesterday";
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

export function listTime(unix?: number): string {
  if (!unix) return "";
  const d = new Date(unix * 1000);
  const today = new Date();
  if (d.toDateString() === today.toDateString()) return timeHHMM(unix);
  if (Date.now() - unix * 1000 < 7 * 86_400_000)
    return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export function durationLabel(seconds?: number): string {
  if (!seconds && seconds !== 0) return "";
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m % 60)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

export function bytesLabel(n?: number): string {
  if (!n) return "";
  const units = ["B", "KB", "MB", "GB"];
  let v = n;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 && i > 0 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

/* -------------------------------------------------------------- entities */

function Spoiler({ children }: { children: React.ReactNode }) {
  const [shown, setShown] = React.useState(false);
  return (
    <span
      className={`tg-spoiler${shown ? " revealed" : ""}`}
      onClick={(e) => {
        e.stopPropagation();
        setShown(true);
      }}
    >
      {children}
    </span>
  );
}

function wrapEntity(e: TgAny, children: React.ReactNode, key: string): React.ReactNode {
  switch (e.type) {
    case "bold":
      return <strong key={key}>{children}</strong>;
    case "italic":
      return <em key={key}>{children}</em>;
    case "underline":
      return <u key={key}>{children}</u>;
    case "strikethrough":
      return <s key={key}>{children}</s>;
    case "spoiler":
      return <Spoiler key={key}>{children}</Spoiler>;
    case "code":
      return (
        <code key={key} className="tg-code">
          {children}
        </code>
      );
    case "pre":
      return (
        <pre key={key} className="tg-pre">
          <code>{children}</code>
        </pre>
      );
    case "blockquote":
    case "expandable_blockquote":
      return (
        <blockquote key={key} className="tg-quote">
          {children}
        </blockquote>
      );
    case "text_link":
      return (
        <a
          key={key}
          className="tg-link"
          href={e.url}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(ev) => ev.stopPropagation()}
        >
          {children}
        </a>
      );
    case "url": {
      const raw = typeof children === "string" ? children : "";
      const href = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
      return (
        <a
          key={key}
          className="tg-link"
          href={href}
          target="_blank"
          rel="noreferrer noopener"
          onClick={(ev) => ev.stopPropagation()}
        >
          {children}
        </a>
      );
    }
    case "email":
      return (
        <a key={key} className="tg-link" href={`mailto:${children}`}>
          {children}
        </a>
      );
    case "phone_number":
      return (
        <a key={key} className="tg-link" href={`tel:${children}`}>
          {children}
        </a>
      );
    case "mention":
    case "hashtag":
    case "cashtag":
    case "bot_command":
    case "text_mention":
      return (
        <span key={key} className="tg-link" style={{ cursor: "pointer" }}>
          {children}
        </span>
      );
    case "custom_emoji":
      return (
        <span key={key} title={`custom emoji ${e.custom_emoji_id}`}>
          {children}
        </span>
      );
    default:
      return <span key={key}>{children}</span>;
  }
}

/**
 * Renders Telegram text + entities. Offsets are UTF-16 code units, which is
 * exactly how JS indexes strings, so no conversion is needed.
 */
export function renderEntities(text: string, entities?: TgAny[]): React.ReactNode {
  if (!text) return null;
  if (!entities || entities.length === 0) return withLineBreaks(text);

  const build = (ents: TgAny[], start: number, end: number, depth: number): React.ReactNode[] => {
    const out: React.ReactNode[] = [];
    const sorted = [...ents].sort((a, b) => a.offset - b.offset || b.length - a.length);
    let cursor = start;

    for (let i = 0; i < sorted.length; i++) {
      const e = sorted[i];
      const eEnd = e.offset + e.length;
      if (e.offset < cursor || eEnd > end) continue;
      if (e.offset > cursor) out.push(withLineBreaks(text.slice(cursor, e.offset), `t${depth}-${cursor}`));

      const children = sorted.filter(
        (x) => x !== e && x.offset >= e.offset && x.offset + x.length <= eEnd
      );
      const inner =
        children.length > 0
          ? build(children, e.offset, eEnd, depth + 1)
          : [withLineBreaks(text.slice(e.offset, eEnd), `i${depth}-${e.offset}`)];

      out.push(wrapEntity(e, inner, `e${depth}-${e.offset}-${e.type}`));
      cursor = eEnd;
    }

    if (cursor < end) out.push(withLineBreaks(text.slice(cursor, end), `t${depth}-${cursor}-end`));
    return out;
  };

  return build(entities, 0, text.length, 0);
}

function withLineBreaks(s: string, key = "s"): React.ReactNode {
  if (!s.includes("\n")) return s;
  const parts = s.split("\n");
  return (
    <React.Fragment key={key}>
      {parts.map((p, i) => (
        <React.Fragment key={i}>
          {i > 0 && <br />}
          {p}
        </React.Fragment>
      ))}
    </React.Fragment>
  );
}

/* ------------------------------------------------------- message preview */

const MEDIA_PREVIEW: [string, string][] = [
  ["photo", "🖼 Photo"],
  ["video", "📹 Video"],
  ["animation", "🎬 GIF"],
  ["audio", "🎵 Audio"],
  ["voice", "🎤 Voice message"],
  ["video_note", "⭕️ Video message"],
  ["document", "📎 Document"],
  ["sticker", "Sticker"],
  ["contact", "👤 Contact"],
  ["location", "📍 Location"],
  ["venue", "📍 Venue"],
  ["poll", "📊 Poll"],
  ["dice", "🎲 Dice"],
  ["game", "🎮 Game"],
  ["invoice", "🧾 Invoice"],
  ["successful_payment", "✅ Payment"],
  ["story", "📖 Story"],
  ["paid_media", "⭐️ Paid media"],
  ["giveaway", "🎁 Giveaway"],
  ["checklist", "☑️ Checklist"],
];

export function messagePreview(m?: TgMessage | null): string {
  if (!m) return "";
  if ((m as TgAny)._deleted) return "Deleted message";
  const service = serviceText(m);
  if (service) return service;
  if (m.text) return m.text.replace(/\n/g, " ");
  for (const [key, label] of MEDIA_PREVIEW) {
    if ((m as TgAny)[key]) {
      const cap = m.caption ? `: ${m.caption.replace(/\n/g, " ")}` : "";
      if (key === "sticker") return `${(m as TgAny).sticker.emoji || ""} Sticker`;
      if (key === "dice") return `${(m as TgAny).dice.emoji} Dice`;
      return label + cap;
    }
  }
  return m.caption?.replace(/\n/g, " ") || "Unsupported message";
}

/** Human wording for service (system) messages. */
export function serviceText(m: TgAny): string | null {
  if (m.new_chat_members)
    return `${m.new_chat_members.map(userName).join(", ")} joined the chat`;
  if (m.left_chat_member) return `${userName(m.left_chat_member)} left the chat`;
  if (m.new_chat_title) return `Chat name changed to "${m.new_chat_title}"`;
  if (m.new_chat_photo) return "Chat photo changed";
  if (m.delete_chat_photo) return "Chat photo removed";
  if (m.group_chat_created) return "Group created";
  if (m.supergroup_chat_created) return "Supergroup created";
  if (m.channel_chat_created) return "Channel created";
  if (m.migrate_to_chat_id) return "Group upgraded to supergroup";
  if (m.migrate_from_chat_id) return "Group upgraded from a basic group";
  if (m.pinned_message) return `Pinned: "${messagePreview(m.pinned_message)}"`;
  if (m.successful_payment)
    return `Payment of ${formatAmount(m.successful_payment.total_amount, m.successful_payment.currency)} received`;
  if (m.refunded_payment) return "Payment refunded";
  if (m.users_shared) return "Users shared with the bot";
  if (m.chat_shared) return "A chat was shared with the bot";
  if (m.write_access_allowed) return "The user allowed the bot to write to them";
  if (m.proximity_alert_triggered) return "Proximity alert triggered";
  if (m.video_chat_started) return "Video chat started";
  if (m.video_chat_ended) return `Video chat ended (${durationLabel(m.video_chat_ended.duration)})`;
  if (m.video_chat_scheduled) return "Video chat scheduled";
  if (m.video_chat_participants_invited) return "Participants invited to video chat";
  if (m.forum_topic_created) return `Topic "${m.forum_topic_created.name}" created`;
  if (m.forum_topic_edited) return "Topic edited";
  if (m.forum_topic_closed) return "Topic closed";
  if (m.forum_topic_reopened) return "Topic reopened";
  if (m.general_forum_topic_hidden) return "General topic hidden";
  if (m.general_forum_topic_unhidden) return "General topic unhidden";
  if (m.message_auto_delete_timer_changed)
    return `Auto-delete timer set to ${m.message_auto_delete_timer_changed.message_auto_delete_time}s`;
  if (m.boost_added) return `Chat boosted ×${m.boost_added.boost_count}`;
  if (m.chat_background_set) return "Chat background changed";
  if (m.gift || m.unique_gift) return "A gift was sent";
  if (m.paid_message_price_changed) return "Paid message price changed";
  return null;
}

export function formatAmount(amount: number, currency: string): string {
  if (currency === "XTR") return `⭐️ ${amount}`;
  // Most currencies use 2 decimals; the Bot API sends the smallest units.
  const zeroDecimal = ["JPY", "KRW", "VND", "CLP", "ISK", "UGX"];
  const div = zeroDecimal.includes(currency) ? 1 : 100;
  return `${(amount / div).toFixed(div === 1 ? 0 : 2)} ${currency}`;
}

/* --------------------------------------------------------------- helpers */

export function fileSrc(fileId?: string): string {
  return fileId ? `/api/file?id=${encodeURIComponent(fileId)}` : "";
}

export function bestPhoto(sizes?: TgAny[]): TgAny | undefined {
  if (!sizes?.length) return undefined;
  return [...sizes].sort((a, b) => a.width * a.height - b.width * b.height).pop();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Escape text for MarkdownV2, per the Bot API's list of reserved characters. */
export function escapeMarkdownV2(s: string): string {
  return s.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => "\\" + c);
}
