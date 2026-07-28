"use client";

import React from "react";
import { useStore } from "./Store";
import { IconInfo } from "./Icons";

export default function GroupPrivacyWarning({ compact = false }: { compact?: boolean }) {
  const { state, notify } = useStore();
  const me = state.me;
  if (me?.can_read_all_group_messages !== false) return null;

  const username = me.username ? `@${me.username}` : "this bot";

  return (
    <div
      role="alert"
      style={{
        position: "relative",
        zIndex: 3,
        display: "flex",
        alignItems: compact ? "flex-start" : "center",
        gap: "0.625rem",
        flexWrap: "wrap",
        padding: compact ? "0.75rem" : "0.625rem 0.875rem",
        margin: compact ? "0.75rem 1rem 0" : 0,
        background: "rgba(245, 158, 11, 0.14)",
        border: "1px solid rgba(245, 158, 11, 0.42)",
        borderRadius: compact ? "0.625rem" : 0,
        color: "var(--text)",
        fontSize: "0.75rem",
        lineHeight: 1.45,
      }}
    >
      <IconInfo size={18} style={{ color: "#f59e0b", flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: "14rem" }}>
        <strong>Telegram Group Privacy is enabled.</strong> In groups where {username} is not an
        admin, Telegram sends service events such as joins plus eligible commands and replies, but
        withholds ordinary messages. Make it an admin in the affected group, or disable privacy in
        BotFather and then remove and re-add the bot. Reload Humanoid after the change.
      </div>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <a
          className="btn sm primary"
          href="https://t.me/BotFather"
          target="_blank"
          rel="noreferrer"
        >
          Open @BotFather
        </a>
        <button
          className="btn sm"
          onClick={async () => {
            try {
              if (!navigator.clipboard) throw new Error("Clipboard access is unavailable");
              await navigator.clipboard.writeText("/setprivacy");
              notify("/setprivacy copied — select the bot, choose Disable, then re-add it");
            } catch {
              notify("Copy failed — send /setprivacy to @BotFather manually", "err");
            }
          }}
        >
          Copy /setprivacy
        </button>
        <a
          className="btn sm ghost"
          href="https://core.telegram.org/bots/features#privacy-mode"
          target="_blank"
          rel="noreferrer"
        >
          Why?
        </a>
        <button className="btn sm ghost" onClick={() => window.location.reload()}>
          Recheck
        </button>
      </div>
    </div>
  );
}
