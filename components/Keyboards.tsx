"use client";

import React from "react";
import type { TgAny } from "@/lib/types";
import { useStore } from "./Store";

/** Small glyph telling you what a button actually does when a user taps it. */
function buttonKind(b: TgAny): { glyph: string; hint: string } {
  if (b.url) return { glyph: "↗", hint: `opens ${b.url}` };
  if (b.callback_data) return { glyph: "⚡︎", hint: `callback_data: ${b.callback_data}` };
  if (b.web_app) return { glyph: "▤", hint: `web app: ${b.web_app.url}` };
  if (b.login_url) return { glyph: "🔑", hint: `login: ${b.login_url.url}` };
  if (b.switch_inline_query !== undefined)
    return { glyph: "⤳", hint: `switch inline: "${b.switch_inline_query}"` };
  if (b.switch_inline_query_current_chat !== undefined)
    return { glyph: "⤳", hint: `switch inline here: "${b.switch_inline_query_current_chat}"` };
  if (b.switch_inline_query_chosen_chat)
    return { glyph: "⤳", hint: "switch inline to chosen chat" };
  if (b.copy_text) return { glyph: "⧉", hint: `copies: ${b.copy_text.text}` };
  if (b.callback_game) return { glyph: "🎮", hint: "launches the game" };
  if (b.pay) return { glyph: "💳", hint: "payment button" };
  if (b.request_contact) return { glyph: "☎", hint: "asks the user for their contact" };
  if (b.request_location) return { glyph: "📍", hint: "asks the user for their location" };
  if (b.request_poll) return { glyph: "📊", hint: "asks the user to create a poll" };
  if (b.request_users) return { glyph: "👥", hint: "asks the user to pick users" };
  if (b.request_chat) return { glyph: "💬", hint: "asks the user to pick a chat" };
  return { glyph: "", hint: "plain text button" };
}

export function InlineKeyboard({ markup }: { markup: TgAny }) {
  const { notify } = useStore();
  const rows: TgAny[][] = markup?.inline_keyboard || [];
  if (!rows.length) return null;

  return (
    <div className="inline-kb">
      {rows.map((row, ri) => (
        <div className="inline-kb-row" key={ri}>
          {row.map((b, bi) => {
            const { glyph, hint } = buttonKind(b);
            return (
              <button
                key={bi}
                className="inline-kb-btn"
                title={hint}
                onClick={(e) => {
                  e.stopPropagation();
                  if (b.url) {
                    window.open(b.url, "_blank", "noopener");
                  } else if (b.copy_text) {
                    navigator.clipboard?.writeText(b.copy_text.text);
                    notify("Copied to clipboard");
                  } else {
                    notify(
                      `${hint} — only a real user can press this. Their tap arrives here as a callback_query.`
                    );
                  }
                }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{b.text}</span>
                {glyph && <span style={{ opacity: 0.65, fontSize: "0.6875rem" }}>{glyph}</span>}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

/**
 * Reply keyboards live on the user's device, not in the message. We show a
 * faithful preview so you can see what the recipient is looking at.
 */
export function ReplyKeyboardPreview({ markup }: { markup: TgAny }) {
  if (!markup) return null;

  if (markup.remove_keyboard) {
    return <KbNote text="Reply keyboard removed for the recipient" />;
  }
  if (markup.force_reply) {
    return (
      <KbNote
        text={`Force reply${markup.input_field_placeholder ? ` — “${markup.input_field_placeholder}”` : ""}`}
      />
    );
  }
  const rows: TgAny[][] = markup.keyboard || [];
  if (!rows.length) return null;

  return (
    <div style={{ marginTop: "0.375rem" }}>
      <div style={{ fontSize: "0.625rem", opacity: 0.6, marginBottom: "0.1875rem" }}>
        REPLY KEYBOARD ON THE USER&apos;S DEVICE
        {markup.is_persistent ? " · persistent" : ""}
        {markup.one_time_keyboard ? " · one-time" : ""}
        {markup.resize_keyboard ? " · resized" : ""}
      </div>
      <div className="reply-kb">
        {rows.map((row, ri) => (
          <div key={ri} style={{ display: "flex", gap: "0.25rem" }}>
            {row.map((b, bi) => {
              const btn = typeof b === "string" ? { text: b } : b;
              const { glyph, hint } = buttonKind(btn);
              return (
                <div key={bi} className="reply-kb-btn" title={hint}>
                  {btn.text} {glyph && <span style={{ opacity: 0.6 }}>{glyph}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function KbNote({ text }: { text: string }) {
  return (
    <div
      style={{
        marginTop: "0.375rem",
        fontSize: "0.6875rem",
        opacity: 0.7,
        fontStyle: "italic",
      }}
    >
      {text}
    </div>
  );
}
