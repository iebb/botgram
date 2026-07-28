"use client";

import React from "react";
import type { TgAny } from "@/lib/types";
import { Field, Select, TextInput, Toggle } from "./UI";
import { IconClose, IconPlus } from "./Icons";

export type KbMode = "none" | "inline" | "reply" | "remove" | "force";

export interface BtnDraft {
  text: string;
  kind: string;
  value: string;
  /** second value for the button kinds that need one (login forward text, etc.) */
  value2?: string;
}

export interface KbDraft {
  mode: KbMode;
  rows: BtnDraft[][];
  // reply-keyboard options
  resize: boolean;
  oneTime: boolean;
  persistent: boolean;
  selective: boolean;
  placeholder: string;
}

export const emptyKb: KbDraft = {
  mode: "none",
  rows: [[{ text: "Button 1", kind: "callback_data", value: "btn_1" }]],
  resize: true,
  oneTime: false,
  persistent: false,
  selective: false,
  placeholder: "",
};

const INLINE_KINDS = [
  { value: "callback_data", label: "Callback data" },
  { value: "url", label: "Open URL" },
  { value: "web_app", label: "Web App" },
  { value: "login_url", label: "Login URL" },
  { value: "switch_inline_query", label: "Switch inline (any chat)" },
  { value: "switch_inline_query_current_chat", label: "Switch inline (this chat)" },
  { value: "switch_inline_query_chosen_chat", label: "Switch inline (chosen chat)" },
  { value: "copy_text", label: "Copy text" },
  { value: "pay", label: "Pay" },
  { value: "callback_game", label: "Play game" },
];

const REPLY_KINDS = [
  { value: "text", label: "Plain text" },
  { value: "request_contact", label: "Request contact" },
  { value: "request_location", label: "Request location" },
  { value: "request_poll", label: "Request poll" },
  { value: "request_users", label: "Request users" },
  { value: "request_chat", label: "Request chat" },
  { value: "request_managed_bot", label: "Create managed bot" },
  { value: "web_app", label: "Web App" },
];

const NEEDS_VALUE: Record<string, string> = {
  callback_data: "callback_data (max 64 bytes)",
  url: "https://…",
  web_app: "https://… (Web App URL)",
  login_url: "https://… (login URL)",
  switch_inline_query: "query to insert",
  switch_inline_query_current_chat: "query to insert",
  switch_inline_query_chosen_chat: "query to insert",
  copy_text: "text to copy",
  request_poll: "quiz | regular | (blank = any)",
  request_users: "request_id (number)",
  request_chat: "request_id (number)",
  request_managed_bot: "request_id (number)",
};

/** Turn the visual draft into a real reply_markup object. */
export function buildReplyMarkup(kb: KbDraft): TgAny | undefined {
  switch (kb.mode) {
    case "none":
      return undefined;

    case "remove":
      return { remove_keyboard: true, selective: kb.selective || undefined };

    case "force":
      return {
        force_reply: true,
        input_field_placeholder: kb.placeholder || undefined,
        selective: kb.selective || undefined,
      };

    case "inline": {
      const inline_keyboard = kb.rows
        .map((row) => row.map(inlineButton).filter(Boolean))
        .filter((r) => r.length > 0);
      return inline_keyboard.length ? { inline_keyboard } : undefined;
    }

    case "reply": {
      const keyboard = kb.rows
        .map((row) => row.map(replyButton).filter(Boolean))
        .filter((r) => r.length > 0);
      if (!keyboard.length) return undefined;
      return {
        keyboard,
        resize_keyboard: kb.resize || undefined,
        one_time_keyboard: kb.oneTime || undefined,
        is_persistent: kb.persistent || undefined,
        selective: kb.selective || undefined,
        input_field_placeholder: kb.placeholder || undefined,
      };
    }
  }
}

/** Telegram-like, non-interactive rendering used by the Rich Studio preview. */
export function KeyboardPreview({ value }: { value: KbDraft }) {
  if (value.mode === "none") return null;
  if (value.mode === "remove" || value.mode === "force") {
    return (
      <div className="keyboard-preview-state">
        {value.mode === "remove" ? "Reply keyboard will be removed" : `Force reply${value.placeholder ? ` · ${value.placeholder}` : ""}`}
      </div>
    );
  }

  const rows = value.rows
    .map((row) => row.filter((button) => button.text.trim()))
    .filter((row) => row.length);
  if (!rows.length) return null;

  return (
    <div className={`keyboard-preview ${value.mode}`} aria-label={`${value.mode} keyboard preview`}>
      {value.mode === "reply" && <div className="keyboard-preview-label">Reply keyboard</div>}
      {rows.map((row, rowIndex) => (
        <div
          key={rowIndex}
          className="keyboard-preview-row"
          style={{ gridTemplateColumns: `repeat(${row.length}, minmax(0, 1fr))` }}
        >
          {row.map((button, buttonIndex) => (
            <div
              key={buttonIndex}
              className="keyboard-preview-button"
              title={buttonPreviewTitle(button)}
              aria-disabled="true"
            >
              <span className="truncate-1">{button.text}</span>
              {buttonPreviewGlyph(button.kind) && (
                <small aria-hidden>{buttonPreviewGlyph(button.kind)}</small>
              )}
            </div>
          ))}
        </div>
      ))}
      {value.mode === "reply" && value.placeholder && (
        <div className="keyboard-preview-placeholder">{value.placeholder}</div>
      )}
    </div>
  );
}

function buttonPreviewGlyph(kind: string): string {
  if (["url", "web_app", "login_url", "switch_inline_query", "switch_inline_query_current_chat", "switch_inline_query_chosen_chat"].includes(kind)) return "↗";
  if (kind === "copy_text") return "⧉";
  if (kind === "pay") return "⭐";
  if (kind === "callback_game") return "🎮";
  if (kind === "request_contact") return "☏";
  if (kind === "request_location") return "⌖";
  if (kind.startsWith("request_")) return "+";
  return "";
}

function buttonPreviewTitle(button: BtnDraft): string {
  const detail = button.value || button.value2;
  return detail ? `${button.kind}: ${detail}` : button.kind.replaceAll("_", " ");
}

function inlineButton(b: BtnDraft): TgAny | null {
  if (!b.text.trim()) return null;
  const base: TgAny = { text: b.text };
  switch (b.kind) {
    case "url":
      return { ...base, url: b.value };
    case "callback_data":
      return { ...base, callback_data: b.value || b.text };
    case "web_app":
      return { ...base, web_app: { url: b.value } };
    case "login_url":
      return { ...base, login_url: { url: b.value, forward_text: b.value2 || undefined } };
    case "switch_inline_query":
      return { ...base, switch_inline_query: b.value };
    case "switch_inline_query_current_chat":
      return { ...base, switch_inline_query_current_chat: b.value };
    case "switch_inline_query_chosen_chat":
      return {
        ...base,
        switch_inline_query_chosen_chat: {
          query: b.value,
          allow_user_chats: true,
          allow_bot_chats: true,
          allow_group_chats: true,
          allow_channel_chats: true,
        },
      };
    case "copy_text":
      return { ...base, copy_text: { text: b.value || b.text } };
    case "pay":
      return { ...base, pay: true };
    case "callback_game":
      return { ...base, callback_game: {} };
    default:
      return { ...base, callback_data: b.value || b.text };
  }
}

function replyButton(b: BtnDraft): TgAny | null {
  if (!b.text.trim()) return null;
  const base: TgAny = { text: b.text };
  switch (b.kind) {
    case "request_contact":
      return { ...base, request_contact: true };
    case "request_location":
      return { ...base, request_location: true };
    case "request_poll":
      return { ...base, request_poll: b.value ? { type: b.value } : {} };
    case "request_users":
      return {
        ...base,
        request_users: { request_id: Number(b.value) || 1, max_quantity: 1 },
      };
    case "request_chat":
      return {
        ...base,
        request_chat: { request_id: Number(b.value) || 1, chat_is_channel: false },
      };
    case "request_managed_bot":
      return {
        ...base,
        request_managed_bot: {
          request_id: Number(b.value) || 1,
          suggested_username: b.value2 || undefined,
        },
      };
    case "web_app":
      return { ...base, web_app: { url: b.value } };
    default:
      return base;
  }
}

export default function KeyboardBuilder({
  value,
  onChange,
  compact,
}: {
  value: KbDraft;
  onChange: (v: KbDraft) => void;
  compact?: boolean;
}) {
  const kinds = value.mode === "reply" ? REPLY_KINDS : INLINE_KINDS;
  const editable = value.mode === "inline" || value.mode === "reply";

  const set = (patch: Partial<KbDraft>) => onChange({ ...value, ...patch });

  const updateBtn = (ri: number, bi: number, patch: Partial<BtnDraft>) => {
    const rows = value.rows.map((r, i) =>
      i === ri ? r.map((b, j) => (j === bi ? { ...b, ...patch } : b)) : r
    );
    set({ rows });
  };

  const addBtn = (ri: number) => {
    const rows = value.rows.map((r, i) =>
      i === ri
        ? [
            ...r,
            {
              text: `Button ${r.length + 1}`,
              kind: value.mode === "reply" ? "text" : "callback_data",
              value: "",
            },
          ]
        : r
    );
    set({ rows });
  };

  const removeBtn = (ri: number, bi: number) => {
    const rows = value.rows
      .map((r, i) => (i === ri ? r.filter((_, j) => j !== bi) : r))
      .filter((r) => r.length > 0);
    set({ rows: rows.length ? rows : [[]] });
  };

  const addRow = () =>
    set({
      rows: [
        ...value.rows,
        [
          {
            text: `Button ${value.rows.flat().length + 1}`,
            kind: value.mode === "reply" ? "text" : "callback_data",
            value: "",
          },
        ],
      ],
    });

  return (
    <div>
      <Field label="Keyboard type">
        <Select
          value={value.mode}
          onChange={(e) => set({ mode: e.target.value as KbMode })}
          options={[
            { value: "none", label: "None" },
            { value: "inline", label: "Inline keyboard (under the message)" },
            { value: "reply", label: "Reply keyboard (replaces the user's keyboard)" },
            { value: "remove", label: "Remove reply keyboard" },
            { value: "force", label: "Force reply" },
          ]}
        />
      </Field>

      {editable && (
        <>
          {value.rows.map((row, ri) => (
            <div
              key={ri}
              style={{
                border: "1px solid var(--input-border)",
                borderRadius: "0.5rem",
                padding: "0.5rem",
                marginBottom: "0.5rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.6875rem",
                  color: "var(--text-tertiary)",
                  marginBottom: "0.375rem",
                }}
              >
                Row {ri + 1}
              </div>

              {row.map((b, bi) => (
                <div
                  key={bi}
                  style={{
                    display: "grid",
                    gridTemplateColumns: compact ? "1fr" : "1fr 1fr",
                    gap: "0.375rem",
                    marginBottom: "0.5rem",
                    paddingBottom: "0.5rem",
                    borderBottom:
                      bi < row.length - 1 ? "1px dashed var(--input-border)" : "none",
                  }}
                >
                  <div style={{ display: "flex", gap: "0.25rem" }}>
                    <TextInput
                      placeholder="Button label"
                      value={b.text}
                      onChange={(e) => updateBtn(ri, bi, { text: e.target.value })}
                    />
                    <button
                      className="icon-btn"
                      style={{ width: "1.75rem", height: "1.75rem", flexShrink: 0 }}
                      onClick={() => removeBtn(ri, bi)}
                      aria-label="Remove button"
                    >
                      <IconClose size={14} />
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                    <Select
                      value={b.kind}
                      onChange={(e) => updateBtn(ri, bi, { kind: e.target.value })}
                      options={kinds}
                    />
                    {NEEDS_VALUE[b.kind] && (
                      <TextInput
                        placeholder={NEEDS_VALUE[b.kind]}
                        value={b.value}
                        onChange={(e) => updateBtn(ri, bi, { value: e.target.value })}
                      />
                    )}
                    {(b.kind === "login_url" || b.kind === "request_managed_bot") && (
                      <TextInput
                        placeholder={b.kind === "login_url" ? "forward_text (optional)" : "suggested_username (optional)"}
                        value={b.value2 || ""}
                        onChange={(e) => updateBtn(ri, bi, { value2: e.target.value })}
                      />
                    )}
                  </div>
                </div>
              ))}

              <button className="btn sm ghost" onClick={() => addBtn(ri)}>
                <IconPlus size={13} /> Button in this row
              </button>
            </div>
          ))}

          <button className="btn sm ghost" onClick={addRow} style={{ marginBottom: "0.625rem" }}>
            <IconPlus size={13} /> Add row
          </button>
        </>
      )}

      {value.mode === "reply" && (
        <div style={{ marginTop: "0.25rem" }}>
          <Toggle checked={value.resize} onChange={(v) => set({ resize: v })} label="Resize keyboard" />
          <Toggle checked={value.oneTime} onChange={(v) => set({ oneTime: v })} label="One-time keyboard" />
          <Toggle checked={value.persistent} onChange={(v) => set({ persistent: v })} label="Always show" />
          <Toggle checked={value.selective} onChange={(v) => set({ selective: v })} label="Selective" />
          <Field label="Input placeholder">
            <TextInput
              value={value.placeholder}
              onChange={(e) => set({ placeholder: e.target.value })}
              placeholder="Shown in the user's input field"
            />
          </Field>
        </div>
      )}

      {value.mode === "force" && (
        <>
          <Field label="Input placeholder">
            <TextInput
              value={value.placeholder}
              onChange={(e) => set({ placeholder: e.target.value })}
            />
          </Field>
          <Toggle checked={value.selective} onChange={(v) => set({ selective: v })} label="Selective" />
        </>
      )}

      {value.mode === "remove" && (
        <Toggle checked={value.selective} onChange={(v) => set({ selective: v })} label="Selective" />
      )}
    </div>
  );
}
