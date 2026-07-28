"use client";

import React, { useMemo, useState } from "react";
import { useStore } from "./Store";
import { Avatar, useOutsideClick } from "./UI";
import {
  IconBolt,
  IconBot,
  IconChecks,
  IconLink,
  IconMenu,
  IconMoon,
  IconDoc,
  IconSearch,
  IconSun,
  IconTerminal,
  IconWebhook,
} from "./Icons";
import { chatName, listTime, messagePreview } from "@/lib/format";
import type { ChatEntry } from "@/lib/types";

export default function Sidebar({
  onOpenPanel,
  onOpenRichEditor,
}: {
  onOpenPanel: (tab: string) => void;
  onOpenRichEditor: () => void;
}) {
  const { state, selectedChatId, selectChat, theme, setTheme, notify, logout } = useStore();
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false));

  const chats = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return state.chats;
    return state.chats.filter((c) => {
      const name = chatName(c.chat).toLowerCase();
      const uname = (c.chat.username || "").toLowerCase();
      return name.includes(q) || uname.includes(q) || String(c.chat.id).includes(q);
    });
  }, [state.chats, query]);

  const botLink = state.me?.username ? `https://t.me/${state.me.username}` : "";

  return (
    <aside className="sidebar">
      <div className="topbar">
        <div style={{ position: "relative" }}>
          <button className="icon-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Menu">
            <IconMenu />
          </button>
          {menuOpen && (
            <div
              ref={menuRef}
              className="ctx-menu"
              style={{ position: "absolute", top: "2.75rem", left: 0, minWidth: "14rem" }}
            >
              <button
                className="ctx-item"
                onClick={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setMenuOpen(false);
                }}
              >
                {theme === "dark" ? <IconSun size={18} /> : <IconMoon size={18} />}
                {theme === "dark" ? "Day mode" : "Night mode"}
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  onOpenPanel("bot");
                  setMenuOpen(false);
                }}
              >
                <IconBot size={18} /> Bot settings
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  onOpenPanel("updates");
                  setMenuOpen(false);
                }}
              >
                <IconBolt size={18} /> Updates &amp; queries
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  onOpenPanel("webhook");
                  setMenuOpen(false);
                }}
              >
                <IconWebhook size={18} /> Webhook
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  onOpenRichEditor();
                  setMenuOpen(false);
                }}
              >
                <IconDoc size={18} /> Rich Message Studio
              </button>
              <button
                className="ctx-item"
                onClick={() => {
                  onOpenPanel("console");
                  setMenuOpen(false);
                }}
              >
                <IconTerminal size={18} /> API console
              </button>
              <div style={{ borderTop: "1px solid var(--panel-border)", margin: "0.25rem 0" }} />
              <button
                className="ctx-item"
                onClick={() => {
                  setMenuOpen(false);
                  void logout();
                }}
              >
                <span style={{ width: 18, textAlign: "center" }}>↪</span> Lock dashboard
              </button>
            </div>
          )}
        </div>

        <div style={{ position: "relative", flex: 1 }}>
          <IconSearch
            size={18}
            style={{
              position: "absolute",
              left: "0.625rem",
              top: "50%",
              transform: "translateY(-50%)",
              color: "var(--text-tertiary)",
            }}
          />
          <input
            className="input"
            style={{ paddingLeft: "2.125rem", borderRadius: "1.25rem", height: "2.5rem" }}
            placeholder="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <BotIdentity />

      <div className="scroll-y" style={{ flex: 1, paddingBottom: "0.5rem" }}>
        {chats.length === 0 && (
          <div style={{ padding: "1.5rem 1.25rem", color: "var(--text-secondary)" }}>
            <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: "0.5rem" }}>
              No chats yet
            </div>
            <p style={{ fontSize: "0.8125rem", lineHeight: 1.5, margin: "0 0 0.75rem" }}>
              Telegram does not let bots enumerate old chats or open a conversation first.
              Updates received while Humanoid is open are saved here and survive local reloads.
            </p>
            {botLink && (
              <button
                className="btn primary"
                style={{ width: "100%" }}
                onClick={() => {
                  navigator.clipboard?.writeText(botLink);
                  notify("Bot link copied — open it in Telegram and press Start");
                }}
              >
                <IconLink size={16} /> Copy {botLink.replace("https://", "")}
              </button>
            )}
          </div>
        )}

        {chats.map((c) => (
          <ChatRow
            key={c.chat.id}
            entry={c}
            selected={String(c.chat.id) === selectedChatId}
            onClick={() => selectChat(String(c.chat.id))}
            meId={state.me?.id}
          />
        ))}
      </div>
    </aside>
  );
}

function BotIdentity() {
  const { state } = useStore();
  const me = state.me;
  const p = state.polling;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        padding: "0.5rem 0.9rem 0.6rem",
        borderBottom: "1px solid var(--sidebar-border)",
      }}
    >
      <Avatar id={me?.id || 0} name={me?.first_name || "Bot"} size="sm" entity={me || undefined} avatarKind="user" />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="truncate-1" style={{ fontWeight: 600, fontSize: "0.875rem" }}>
          {me?.first_name || "Connecting…"}
          <span className="chip accent" style={{ marginLeft: "0.375rem" }}>
            BOT
          </span>
        </div>
        <div
          className="truncate-1 muted"
          style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: "0.3125rem" }}
        >
          <span
            className={`dot ${p.lastError ? "err" : p.running && state.connected ? "on" : "off"}`}
          />
          {p.lastError
            ? p.lastError.slice(0, 44)
            : me?.can_read_all_group_messages === false
              ? "group privacy on · admin needed for all text"
              : p.running
                ? `browser history · ${p.updatesSeen} updates`
                : "webhook needs attention"}
        </div>
      </div>
    </div>
  );
}

function ChatRow({
  entry,
  selected,
  onClick,
  meId,
}: {
  entry: ChatEntry;
  selected: boolean;
  onClick: () => void;
  meId?: number;
}) {
  const last = entry.lastMessage;
  const outgoing = last?.from?.id === meId;
  const name = chatName(entry.chat);

  return (
    <div className={`chat-row${selected ? " selected" : ""}`} onClick={onClick}>
      <Avatar
        id={entry.chat.id}
        name={name}
        entity={entry.chat}
        avatarKind={entry.chat.type === "private" ? "user" : "chat"}
      />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
          <div className="truncate-1" style={{ fontWeight: 500, flex: 1 }}>
            {name}
          </div>
          <div className="chat-row-time muted" style={{ fontSize: "0.75rem" }}>
            {listTime(last?.date)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.25rem", marginTop: "0.125rem" }}>
          {outgoing && (
            <IconChecks size={15} style={{ color: selected ? "#fff" : "var(--accent)" }} />
          )}
          <div className="truncate-1 muted" style={{ flex: 1, fontSize: "0.8125rem" }}>
            {last && entry.chat.type !== "private" && last.from && !outgoing
              ? `${last.from.first_name}: ${messagePreview(last)}`
              : messagePreview(last)}
          </div>
          {entry.unread > 0 && <div className="badge">{entry.unread}</div>}
        </div>
      </div>
    </div>
  );
}
