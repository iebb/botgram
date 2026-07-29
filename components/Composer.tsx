"use client";

import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useStore } from "./Store";
import { Field, Select, TextInput, Toggle, useOutsideClick } from "./UI";
import KeyboardBuilder, { buildReplyMarkup, emptyKb, type KbDraft } from "./KeyboardBuilder";
import type { AttachKind } from "./SendMedia";
import { messagePreview } from "@/lib/format";
import type { TgAny } from "@/lib/types";
import { attachmentKindForFiles } from "@/lib/media";
import { buildPlainTextRichMessage, buildPlainTextThinkingDraft } from "@/lib/rich";
import {
  IconAttach,
  IconBolt,
  IconClose,
  IconContact,
  IconDice,
  IconDoc,
  IconEdit,
  IconGift,
  IconKeyboard,
  IconLocation,
  IconMic,
  IconMoney,
  IconPhoto,
  IconPoll,
  IconReply,
  IconSend,
  IconSettings,
  IconSmile,
  IconStar,
  IconSticker,
  IconVideo,
} from "./Icons";

const AttachModal = dynamic(() => import("./SendMedia"));
const StickerSelector = dynamic(() => import("./StickerSelector"));

const EMOJI = [
  "😀","😂","🥰","😍","🤔","😅","😭","😡","👍","👎","🙏","👏","🔥","❤️","🎉","✨",
  "🚀","💯","👀","🤖","⚡️","🌟","💡","📌","✅","❌","⚠️","📊","🎯","🎲","🎁","⭐️",
];

const EFFECTS = [
  { value: "", label: "No effect" },
  { value: "5104841245755180586", label: "🔥 Fire" },
  { value: "5107584321108051014", label: "👍 Thumbs up" },
  { value: "5104858069142078462", label: "👎 Thumbs down" },
  { value: "5159385139981059251", label: "❤️ Heart" },
  { value: "5046509860389126442", label: "🎉 Party" },
  { value: "5046589136895476101", label: "💩 Poop" },
];

const CHAT_ACTIONS = [
  "typing",
  "upload_photo",
  "record_video",
  "upload_video",
  "record_voice",
  "upload_voice",
  "upload_document",
  "choose_sticker",
  "find_location",
  "record_video_note",
  "upload_video_note",
];

const ATTACH_ITEMS: { kind: AttachKind; label: string; Icon: React.ComponentType<any> }[] = [
  { kind: "photo", label: "Photo", Icon: IconPhoto },
  { kind: "live_photo", label: "Live photo", Icon: IconPhoto },
  { kind: "video", label: "Video", Icon: IconVideo },
  { kind: "animation", label: "Animation / GIF", Icon: IconVideo },
  { kind: "audio", label: "Audio", Icon: IconMic },
  { kind: "voice", label: "Voice message", Icon: IconMic },
  { kind: "video_note", label: "Video note", Icon: IconVideo },
  { kind: "document", label: "Document", Icon: IconDoc },
  { kind: "sticker", label: "Sticker", Icon: IconSticker },
  { kind: "media_group", label: "Album (media group)", Icon: IconPhoto },
  { kind: "paid_media", label: "Paid media", Icon: IconStar },
  { kind: "location", label: "Location", Icon: IconLocation },
  { kind: "venue", label: "Venue", Icon: IconLocation },
  { kind: "contact", label: "Contact", Icon: IconContact },
  { kind: "poll", label: "Poll / Quiz", Icon: IconPoll },
  { kind: "checklist", label: "Checklist", Icon: IconPoll },
  { kind: "dice", label: "Dice", Icon: IconDice },
  { kind: "invoice", label: "Invoice", Icon: IconMoney },
  { kind: "game", label: "Game", Icon: IconGift },
];

interface AttachDraft {
  kind: AttachKind;
  files?: File[];
  caption?: string;
  parseMode?: string;
  consumeComposerText?: boolean;
}

export default function Composer({ onOpenRichEditor }: { onOpenRichEditor: () => void }) {
  const { chat, selectedChatId, call, notify, replyTo, setReplyTo, editing, setEditing } =
    useStore();

  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState("MarkdownV2");
  const [kb, setKb] = useState<KbDraft>(emptyKb);
  const [attach, setAttach] = useState<AttachDraft | null>(null);
  const [showAttach, setShowAttach] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showStickers, setShowStickers] = useState(false);
  const [showKb, setShowKb] = useState(false);
  const [showOpts, setShowOpts] = useState(false);
  const [busy, setBusy] = useState(false);
  const [thinkingEnabled, setThinkingEnabled] = useState(false);
  const [thinkingIntervalSeconds, setThinkingIntervalSeconds] = useState(3);
  const [thinkingSentAt, setThinkingSentAt] = useState<number | null>(null);

  const [opts, setOpts] = useState({
    disable_notification: false,
    protect_content: false,
    allow_paid_broadcast: false,
    link_preview_disabled: false,
    link_preview_above: false,
    link_preview_small: false,
    link_preview_large: false,
    link_preview_url: "",
    message_effect_id: "",
    message_thread_id: "",
    direct_messages_topic_id: "",
    business_connection_id: "",
    receiver_user_id: "",
    callback_query_id: "",
    quote: "",
  });

  const ta = useRef<HTMLTextAreaElement>(null);
  const mediaPicker = useRef<HTMLInputElement>(null);
  const attachRef = useOutsideClick<HTMLDivElement>(() => setShowAttach(false));
  const emojiRef = useOutsideClick<HTMLDivElement>(() => setShowEmoji(false));
  const stickerRef = useOutsideClick<HTMLDivElement>(() => setShowStickers(false));
  const optsRef = useOutsideClick<HTMLDivElement>(() => setShowOpts(false));
  const thinkingDraftId = useRef((Date.now() % 2_147_483_647) || 1);
  const thinkingRequested = useRef(false);
  const thinkingInFlight = useRef(false);
  const thinkingPending = useRef<Promise<void> | null>(null);
  const thinkingLastSignature = useRef("");
  const thinkingLastSuccessAt = useRef(0);
  const isPrivateChat = chat?.chat.type === "private";
  const canStreamThinking = Boolean(selectedChatId && isPrivateChat && !editing);
  const thinkingInput = useRef({
    eligible: false,
    chatId: "",
    messageThreadId: undefined as number | undefined,
    text: "",
    draftId: thinkingDraftId.current,
  });
  thinkingInput.current = {
    eligible: canStreamThinking,
    chatId: selectedChatId || "",
    messageThreadId: opts.message_thread_id ? Number(opts.message_thread_id) : undefined,
    text,
    draftId: thinkingDraftId.current,
  };

  // Load an existing message into the box when the user hits "edit".
  useEffect(() => {
    if (editing) {
      setText(editing.text || editing.caption || "");
      ta.current?.focus();
    }
  }, [editing]);

  useEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 192) + "px";
  }, [text]);

  useEffect(() => {
    thinkingRequested.current = false;
    setThinkingEnabled(false);
    setThinkingSentAt(null);
    thinkingLastSignature.current = "";
    thinkingLastSuccessAt.current = 0;
    thinkingDraftId.current = (Date.now() % 2_147_483_647) || 1;
  }, [selectedChatId]);

  useEffect(() => {
    if (thinkingEnabled && !canStreamThinking) {
      thinkingRequested.current = false;
      setThinkingEnabled(false);
    }
  }, [canStreamThinking, thinkingEnabled]);

  useEffect(() => {
    if (!thinkingEnabled) return;
    let active = true;

    const publish = async () => {
      const current = thinkingInput.current;
      if (
        !thinkingRequested.current
        || !current.eligible
        || !current.text.trim()
        || thinkingInFlight.current
      ) return;
      const signature = JSON.stringify(current);
      const now = Date.now();
      if (signature === thinkingLastSignature.current && now - thinkingLastSuccessAt.current < 15_000) return;

      thinkingInFlight.current = true;
      try {
        const response = await call("sendRichMessageDraft", {
          chat_id: Number(current.chatId),
          message_thread_id: current.messageThreadId,
          draft_id: current.draftId,
          rich_message: buildPlainTextThinkingDraft(current.text),
        });
        if (!active) return;
        if (!response.ok) {
          thinkingRequested.current = false;
          setThinkingEnabled(false);
          return;
        }
        thinkingLastSignature.current = signature;
        thinkingLastSuccessAt.current = Date.now();
        setThinkingSentAt(thinkingLastSuccessAt.current);
      } catch (error) {
        if (!active) return;
        notify(error instanceof Error ? error.message : "Could not stream this draft", "err");
        thinkingRequested.current = false;
        setThinkingEnabled(false);
      } finally {
        thinkingInFlight.current = false;
      }
    };

    const runPublish = () => {
      const pending = publish();
      thinkingPending.current = pending;
      void pending.finally(() => {
        if (thinkingPending.current === pending) thinkingPending.current = null;
      });
    };
    thinkingRequested.current = true;
    const first = window.setTimeout(runPublish, 600);
    const interval = window.setInterval(runPublish, thinkingIntervalSeconds * 1_000);
    return () => {
      active = false;
      thinkingRequested.current = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [call, notify, thinkingEnabled, thinkingIntervalSeconds]);

  if (!selectedChatId) return null;

  const baseParams = (): TgAny => ({
    chat_id: Number(selectedChatId),
    message_thread_id: opts.message_thread_id ? Number(opts.message_thread_id) : undefined,
    direct_messages_topic_id: opts.direct_messages_topic_id
      ? Number(opts.direct_messages_topic_id)
      : undefined,
    business_connection_id: opts.business_connection_id || undefined,
    receiver_user_id: opts.receiver_user_id
      ? Number(opts.receiver_user_id)
      : replyTo?.ephemeral_message_id
        ? Number(replyTo.receiver_user?.id || replyTo.from?.id)
        : undefined,
    callback_query_id: opts.callback_query_id || undefined,
    disable_notification: opts.disable_notification || undefined,
    protect_content: opts.protect_content || undefined,
    allow_paid_broadcast: opts.allow_paid_broadcast || undefined,
    message_effect_id: opts.message_effect_id || undefined,
    reply_parameters: replyTo
      ? {
          message_id: replyTo.ephemeral_message_id ? undefined : replyTo.message_id,
          ephemeral_message_id: replyTo.ephemeral_message_id || undefined,
          quote: opts.quote || undefined,
          quote_parse_mode: opts.quote && parseMode !== "none" ? parseMode : undefined,
          allow_sending_without_reply: replyTo.ephemeral_message_id ? undefined : true,
        }
      : undefined,
    reply_markup: buildReplyMarkup(kb),
  });

  const linkPreview = () => {
    const lp: TgAny = {};
    if (opts.link_preview_disabled) lp.is_disabled = true;
    if (opts.link_preview_above) lp.show_above_text = true;
    if (opts.link_preview_small) lp.prefer_small_media = true;
    if (opts.link_preview_large) lp.prefer_large_media = true;
    if (opts.link_preview_url) lp.url = opts.link_preview_url;
    return Object.keys(lp).length ? lp : undefined;
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    const finalizeThinkingDraft = thinkingEnabled;
    setBusy(true);
    try {
      if (thinkingEnabled) {
        thinkingRequested.current = false;
        setThinkingEnabled(false);
        if (thinkingPending.current) await thinkingPending.current;
      }
      if (editing) {
        const isCaption = !editing.text && !!editing.caption;
        const ephemeral = typeof editing.ephemeral_message_id === "number";
        const receiverUserId = Number(editing.receiver_user?.id || editing.from?.id);
        if (ephemeral && !receiverUserId) {
          return notify("This ephemeral message is missing its receiver user id", "err");
        }
        const method = ephemeral
          ? isCaption
            ? "editEphemeralMessageCaption"
            : "editEphemeralMessageText"
          : isCaption
            ? "editMessageCaption"
            : "editMessageText";
        const res = await call(method, {
          chat_id: Number(selectedChatId),
          message_id: ephemeral ? undefined : editing.message_id,
          ephemeral_message_id: ephemeral ? editing.ephemeral_message_id : undefined,
          receiver_user_id: ephemeral ? receiverUserId : undefined,
          business_connection_id: ephemeral ? undefined : opts.business_connection_id || undefined,
          [isCaption ? "caption" : "text"]: body,
          parse_mode: parseMode === "none" ? undefined : parseMode,
          link_preview_options: isCaption ? undefined : linkPreview(),
          reply_markup: buildReplyMarkup(kb),
        });
        if (res.ok) {
          setEditing(null);
          setText("");
        }
        return;
      }

      const res = finalizeThinkingDraft
        ? await call("sendRichMessage", {
            ...baseParams(),
            rich_message: buildPlainTextRichMessage(body),
          })
        : await call("sendMessage", {
            ...baseParams(),
            text: body,
            parse_mode: parseMode === "none" ? undefined : parseMode,
            link_preview_options: linkPreview(),
          });
      if (res.ok) {
        setText("");
        setThinkingSentAt(null);
        setReplyTo(null);
        setOpts((o) => ({ ...o, quote: "" }));
      }
    } finally {
      setBusy(false);
    }
  };

  const sendPickedSticker = async (sticker: TgAny) => {
    if (!sticker.file_id || editing) return;
    setBusy(true);
    try {
      const res = await call("sendSticker", {
        ...baseParams(),
        sticker: sticker.file_id,
      });
      if (res.ok) {
        setReplyTo(null);
        setOpts((current) => ({ ...current, quote: "" }));
      }
    } finally {
      setBusy(false);
    }
  };

  const openSelectedMedia = (files: File[]) => {
    const kind = attachmentKindForFiles(files);
    if (!kind) return;
    if (editing) {
      notify("Finish editing the current message before attaching media", "err");
      return;
    }
    setShowAttach(false);
    setShowEmoji(false);
    setShowStickers(false);
    setAttach({
      kind,
      files,
      caption: text,
      parseMode,
      consumeComposerText: Boolean(text),
    });
  };

  const pastedFiles = (event: React.ClipboardEvent<HTMLTextAreaElement>): File[] => {
    const itemFiles = Array.from(event.clipboardData.items)
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));
    return itemFiles.length ? itemFiles : Array.from(event.clipboardData.files);
  };

  const wrap = (before: string, after: string) => {
    const el = ta.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const sel = text.slice(start, end) || "text";
    const next = text.slice(0, start) + before + sel + after + text.slice(end);
    setText(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  const fmt = (kind: string) => {
    const html = parseMode === "HTML";
    switch (kind) {
      case "bold":
        return wrap(html ? "<b>" : "*", html ? "</b>" : "*");
      case "italic":
        return wrap(html ? "<i>" : "_", html ? "</i>" : "_");
      case "underline":
        return wrap(html ? "<u>" : "__", html ? "</u>" : "__");
      case "strike":
        return wrap(html ? "<s>" : "~", html ? "</s>" : "~");
      case "spoiler":
        return wrap(html ? '<span class="tg-spoiler">' : "||", html ? "</span>" : "||");
      case "code":
        return wrap(html ? "<code>" : "`", html ? "</code>" : "`");
      case "pre":
        return wrap(html ? "<pre>" : "```\n", html ? "</pre>" : "\n```");
      case "quote":
        return wrap(html ? "<blockquote>" : ">", html ? "</blockquote>" : "");
      case "link": {
        const url = prompt("Link URL", "https://");
        if (!url) return;
        return wrap(html ? `<a href="${url}">` : "[", html ? "</a>" : `](${url})`);
      }
    }
  };

  const kbActive = kb.mode !== "none";

  return (
    <>
      <input
        ref={mediaPicker}
        type="file"
        accept="image/*,video/*"
        multiple
        hidden
        onChange={(event) => {
          openSelectedMedia(Array.from(event.currentTarget.files || []));
          event.currentTarget.value = "";
        }}
      />
      <div className="composer">
        <div className="composer-box">
          {/* -------------------------------------------- reply / edit bar */}
          {(replyTo || editing) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem 0",
              }}
            >
              {editing ? <IconEdit size={18} /> : <IconReply size={18} />}
              <div
                style={{
                  flex: 1,
                  minWidth: 0,
                  borderLeft: "2px solid var(--accent)",
                  paddingLeft: "0.5rem",
                }}
              >
                <div style={{ fontSize: "0.75rem", color: "var(--accent)", fontWeight: 500 }}>
                  {editing ? "Editing message" : "Reply to"}
                </div>
                <div className="truncate-1 muted" style={{ fontSize: "0.8125rem" }}>
                  {messagePreview(editing || replyTo)}
                </div>
              </div>
              <button
                className="icon-btn"
                style={{ width: "1.75rem", height: "1.75rem" }}
                onClick={() => {
                  setReplyTo(null);
                  setEditing(null);
                  if (editing) setText("");
                }}
              >
                <IconClose size={16} />
              </button>
            </div>
          )}

          {/* --------------------------------------------- format toolbar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.125rem",
              padding: "0.375rem 0.5rem 0",
              flexWrap: "wrap",
            }}
          >
            {[
              ["bold", "B", { fontWeight: 700 }],
              ["italic", "I", { fontStyle: "italic" }],
              ["underline", "U", { textDecoration: "underline" }],
              ["strike", "S", { textDecoration: "line-through" }],
              ["spoiler", "▨", {}],
              ["code", "‹›", {}],
              ["pre", "⌗", {}],
              ["quote", "❝", {}],
              ["link", "🔗", {}],
            ].map(([k, label, style]) => (
              <button
                key={k as string}
                className="btn sm"
                style={{ background: "transparent", padding: "0.125rem 0.375rem", ...(style as any) }}
                title={k as string}
                onClick={() => fmt(k as string)}
              >
                {label as string}
              </button>
            ))}
            <div style={{ width: "1px", height: "1rem", background: "var(--input-border)", margin: "0 0.25rem" }} />
            <select
              className="select"
              style={{ width: "auto", padding: "0.125rem 0.375rem", fontSize: "0.6875rem" }}
              value={parseMode}
              onChange={(e) => setParseMode(e.target.value)}
              title="parse_mode"
            >
              <option value="MarkdownV2">MarkdownV2</option>
              <option value="HTML">HTML</option>
              <option value="Markdown">Markdown</option>
              <option value="none">Plain</option>
            </select>
            <button className="chip accent" onClick={onOpenRichEditor} title="Open the dedicated Rich Message Studio">
              Rich studio
            </button>
            {kbActive && (
              <button className="chip accent" onClick={() => setShowKb(true)}>
                {kb.mode} keyboard ·{" "}
                {kb.mode === "inline" || kb.mode === "reply" ? `${kb.rows.flat().length} btn` : "set"}
              </button>
            )}
            {opts.message_effect_id && <span className="chip accent">effect</span>}
            {(opts.disable_notification || opts.protect_content) && (
              <span className="chip">
                {opts.disable_notification ? "silent " : ""}
                {opts.protect_content ? "protected" : ""}
              </span>
            )}
          </div>

          {/* ---------------------------------------------------- input row */}
          <div style={{ display: "flex", alignItems: "flex-end", padding: "0 0.5rem 0.25rem" }}>
            <div style={{ position: "relative" }}>
              <button
                className="icon-btn"
                onClick={() => {
                  setShowStickers(false);
                  setShowEmoji((v) => !v);
                }}
                aria-label="Emoji"
              >
                <IconSmile />
              </button>
              {showEmoji && (
                <div
                  ref={emojiRef}
                  className="ctx-menu"
                  style={{
                    position: "absolute",
                    bottom: "3rem",
                    left: 0,
                    display: "grid",
                    gridTemplateColumns: "repeat(8, 2rem)",
                    minWidth: 0,
                  }}
                >
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      style={{ fontSize: "1.25rem", padding: "0.25rem", borderRadius: "0.375rem" }}
                      onClick={() => {
                        setText((t) => t + e);
                        ta.current?.focus();
                      }}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div ref={stickerRef} style={{ position: "relative" }}>
              <button
                className={`icon-btn${showStickers ? " active" : ""}`}
                onClick={() => {
                  setShowEmoji(false);
                  setShowStickers((visible) => !visible);
                }}
                aria-label="Stickers"
                title={editing ? "Finish editing before sending a sticker" : "Stickers"}
                disabled={Boolean(editing)}
              >
                <IconSticker />
              </button>
              {showStickers && (
                <StickerSelector
                  busy={busy}
                  onClose={() => setShowStickers(false)}
                  onSelect={sendPickedSticker}
                />
              )}
            </div>

            <textarea
              ref={ta}
              className="composer-input"
              placeholder={editing ? "Edit message…" : "Message"}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(event) => {
                const files = pastedFiles(event);
                if (!files.length) return;
                event.preventDefault();
                openSelectedMedia(files);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />

            <div style={{ position: "relative" }}>
              <button
                className={`icon-btn${kbActive ? " active" : ""}`}
                onClick={() => setShowKb(true)}
                aria-label="Keyboard builder"
                title="Attach an inline or reply keyboard"
              >
                <IconKeyboard />
              </button>
            </div>

            <div style={{ position: "relative" }}>
              <button
                className="icon-btn"
                onClick={() => setShowOpts((v) => !v)}
                aria-label="Send options"
                title="Send options"
              >
                <IconSettings />
              </button>
              {showOpts && (
                <div
                  ref={optsRef}
                  className="ctx-menu"
                  style={{ position: "absolute", bottom: "3rem", right: 0, width: "20rem", padding: "0.75rem" }}
                >
                  <div className="section-title">Send options</div>
                  <Toggle
                    checked={opts.disable_notification}
                    onChange={(v) => setOpts({ ...opts, disable_notification: v })}
                    label="Silent (disable_notification)"
                  />
                  <Toggle
                    checked={opts.protect_content}
                    onChange={(v) => setOpts({ ...opts, protect_content: v })}
                    label="Protect content (no forward/save)"
                  />
                  <Toggle
                    checked={opts.allow_paid_broadcast}
                    onChange={(v) => setOpts({ ...opts, allow_paid_broadcast: v })}
                    label="Allow paid broadcast"
                  />
                  <div className="section-title" style={{ marginTop: "0.625rem" }}>
                    Link preview
                  </div>
                  <Toggle
                    checked={opts.link_preview_disabled}
                    onChange={(v) => setOpts({ ...opts, link_preview_disabled: v })}
                    label="Disable preview"
                  />
                  <Toggle
                    checked={opts.link_preview_above}
                    onChange={(v) => setOpts({ ...opts, link_preview_above: v })}
                    label="Show above text"
                  />
                  <Toggle
                    checked={opts.link_preview_small}
                    onChange={(v) => setOpts({ ...opts, link_preview_small: v })}
                    label="Prefer small media"
                  />
                  <Toggle
                    checked={opts.link_preview_large}
                    onChange={(v) => setOpts({ ...opts, link_preview_large: v })}
                    label="Prefer large media"
                  />
                  <Field label="Preview URL override">
                    <TextInput
                      value={opts.link_preview_url}
                      onChange={(e) => setOpts({ ...opts, link_preview_url: e.target.value })}
                    />
                  </Field>

                  <div className="section-title" style={{ marginTop: "0.625rem" }}>
                    Extras
                  </div>
                  <Field label="Message effect">
                    <Select
                      value={opts.message_effect_id}
                      onChange={(e) => setOpts({ ...opts, message_effect_id: e.target.value })}
                      options={EFFECTS}
                    />
                  </Field>
                  <Field label="Thread / topic id">
                    <TextInput
                      value={opts.message_thread_id}
                      onChange={(e) => setOpts({ ...opts, message_thread_id: e.target.value })}
                      placeholder="message_thread_id"
                    />
                  </Field>
                  <Field label="Direct-messages topic id">
                    <TextInput
                      value={opts.direct_messages_topic_id}
                      onChange={(e) => setOpts({ ...opts, direct_messages_topic_id: e.target.value })}
                      placeholder="direct_messages_topic_id"
                    />
                  </Field>
                  <Field label="Business connection id">
                    <TextInput
                      value={opts.business_connection_id}
                      onChange={(e) => setOpts({ ...opts, business_connection_id: e.target.value })}
                    />
                  </Field>
                  <Field
                    label="Ephemeral receiver user id"
                    hint="Makes supported message types visible only to this group member and the bot."
                  >
                    <TextInput
                      value={opts.receiver_user_id}
                      onChange={(e) => setOpts({ ...opts, receiver_user_id: e.target.value })}
                      placeholder="receiver_user_id"
                    />
                  </Field>
                  <Field label="Triggering callback query id" hint="Optional context for an ephemeral response.">
                    <TextInput
                      value={opts.callback_query_id}
                      onChange={(e) => setOpts({ ...opts, callback_query_id: e.target.value })}
                    />
                  </Field>
                  {replyTo && (
                    <Field label="Quote from the replied message">
                      <TextInput
                        value={opts.quote}
                        onChange={(e) => setOpts({ ...opts, quote: e.target.value })}
                        placeholder="exact substring to quote"
                      />
                    </Field>
                  )}
                </div>
              )}
            </div>

            <div style={{ position: "relative" }}>
              <button
                className="icon-btn"
                onClick={() => setShowAttach((v) => !v)}
                aria-label="Attach"
              >
                <IconAttach />
              </button>
              {showAttach && (
                <div
                  ref={attachRef}
                  className="ctx-menu"
                  style={{ position: "absolute", bottom: "3rem", right: 0, width: "15rem" }}
                >
                  <button
                    className="ctx-item"
                    onClick={() => {
                      setShowAttach(false);
                      mediaPicker.current?.click();
                    }}
                  >
                    <IconPhoto size={17} /> Photos & videos
                  </button>
                  <div
                    style={{
                      borderTop: "1px solid var(--panel-border)",
                      margin: "0.25rem 0",
                    }}
                  />
                  {ATTACH_ITEMS.map(({ kind, label, Icon }) => (
                    <button
                      key={kind}
                      className="ctx-item"
                      onClick={() => {
                        setAttach({ kind });
                        setShowAttach(false);
                      }}
                    >
                      <Icon size={17} /> {label}
                    </button>
                  ))}
                  <div
                    style={{
                      borderTop: "1px solid var(--panel-border)",
                      margin: "0.25rem 0",
                    }}
                  />
                  {CHAT_ACTIONS.slice(0, 4).map((a) => (
                    <button
                      key={a}
                      className="ctx-item"
                      onClick={async () => {
                        setShowAttach(false);
                        await call("sendChatAction", {
                          chat_id: Number(selectedChatId),
                          action: a,
                        });
                        notify(`Chat action "${a}" sent`);
                      }}
                    >
                      <IconBolt size={17} /> Action: {a}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="composer-send-stack">
          {isPrivateChat && !editing && (
            <div
              className={`composer-thinking-quick${thinkingEnabled ? " active" : ""}`}
              title={thinkingEnabled
                ? `Thinking is on · updating every ${thinkingIntervalSeconds}s${thinkingSentAt ? ` · last sent ${new Date(thinkingSentAt).toLocaleTimeString()}` : " · waiting for input"}`
                : "Thinking is off · stream unfinished input as a temporary private-chat draft"}
            >
              <label className="composer-thinking-checkbox">
                <input
                  type="checkbox"
                  checked={thinkingEnabled}
                  disabled={!canStreamThinking || busy}
                  aria-label="Stream unfinished input with Thinking"
                  onChange={(event) => {
                    thinkingRequested.current = event.target.checked;
                    thinkingLastSignature.current = "";
                    thinkingLastSuccessAt.current = 0;
                    setThinkingSentAt(null);
                    setThinkingEnabled(event.target.checked);
                  }}
                />
                <span className="composer-thinking-checkmark" aria-hidden="true">
                  <IconBolt size={13} />
                </span>
              </label>
              <select
                className="composer-thinking-interval"
                value={thinkingIntervalSeconds}
                disabled={busy}
                aria-label="Thinking update interval"
                title="Thinking update interval"
                onChange={(event) => setThinkingIntervalSeconds(Number(event.target.value))}
              >
                <option value={1}>1s</option>
                <option value={3}>3s</option>
                <option value={5}>5s</option>
              </select>
            </div>
          )}
          <button className="send-btn" onClick={send} disabled={busy || !text.trim()}>
            <IconSend size={24} />
          </button>
        </div>
      </div>

      {showKb && (
        <div className="modal-backdrop" onMouseDown={() => setShowKb(false)}>
          <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "0.875rem 1rem",
                borderBottom: "1px solid var(--panel-border)",
              }}
            >
              <div style={{ fontWeight: 600, flex: 1 }}>Keyboard builder</div>
              <button className="icon-btn" onClick={() => setShowKb(false)}>
                <IconClose size={20} />
              </button>
            </div>
            <div className="scroll-y" style={{ padding: "1rem" }}>
              <KeyboardBuilder value={kb} onChange={setKb} />
              <div className="section-title" style={{ marginTop: "1rem" }}>
                Generated reply_markup
              </div>
              <div className="json-view">
                {JSON.stringify(buildReplyMarkup(kb) ?? null, null, 2)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
                padding: "0.75rem 1rem",
                borderTop: "1px solid var(--panel-border)",
              }}
            >
              <button className="btn ghost" onClick={() => setKb(emptyKb)}>
                Reset
              </button>
              <button className="btn primary" onClick={() => setShowKb(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {attach && (
        <AttachModal
          kind={attach.kind}
          base={baseParams()}
          initialFiles={attach.files}
          initialCaption={attach.caption}
          initialParseMode={attach.parseMode}
          onSent={() => {
            if (attach.consumeComposerText) setText("");
            setReplyTo(null);
            setOpts((current) => ({ ...current, quote: "" }));
          }}
          onClose={() => setAttach(null)}
        />
      )}
    </>
  );
}
