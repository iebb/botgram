"use client";

import React, { useDeferredValue, useMemo, useState } from "react";
import { useStore } from "./Store";
import { Avatar, useOutsideClick } from "./UI";
import {
  IconBolt,
  IconBot,
  IconCheck,
  IconChecks,
  IconGitHub,
  IconLink,
  IconMenu,
  IconMoon,
  IconDoc,
  IconPlus,
  IconSearch,
  IconSun,
  IconTerminal,
  IconUsers,
  IconWebhook,
} from "./Icons";
import { chatName, listTime, messagePreview, userName } from "@/lib/format";
import { collectKnownPeople, exactUserId, searchKnownPeople, type KnownPerson } from "@/lib/people";
import type { ChatEntry, TgChat } from "@/lib/types";

const SOURCE_URL = "https://github.com/iebb/botgram";

export default function Sidebar({
  onOpenPanel,
  onOpenRichEditor,
}: {
  onOpenPanel: (tab: string) => void;
  onOpenRichEditor: () => void;
}) {
  const { state, selectedChatId, selectChat, theme, setTheme, notify, logout, call } = useStore();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [menuOpen, setMenuOpen] = useState(false);
  const [resolvingId, setResolvingId] = useState<number | null>(null);
  const menuRef = useOutsideClick<HTMLDivElement>(() => setMenuOpen(false));

  const chats = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    if (!q) return state.chats;
    return state.chats.filter((c) => {
      if (c.chat.type === "private") return false;
      const name = chatName(c.chat).toLowerCase();
      const uname = (c.chat.username || "").toLowerCase();
      return name.includes(q) || uname.includes(q) || String(c.chat.id).includes(q);
    });
  }, [state.chats, deferredQuery]);
  const allPeople = useMemo(
    () => collectKnownPeople(state.chats, state.me?.id),
    [state.chats, state.me?.id]
  );
  const people = useMemo(
    () => searchKnownPeople(allPeople, deferredQuery),
    [allPeople, deferredQuery]
  );
  const searching = Boolean(deferredQuery.trim());
  const lookupId = exactUserId(deferredQuery);

  const resolveUserId = async (userId: number) => {
    if (resolvingId != null) return;
    setResolvingId(userId);
    try {
      const result = await call<TgChat>("getChat", { chat_id: userId });
      if (!result.ok || !result.result) return;
      setQuery("");
      selectChat(String(result.result.id));
      notify(`Opened ${chatName(result.result)}`);
    } finally {
      setResolvingId(null);
    }
  };

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
                disabled={!selectedChatId}
                title={selectedChatId ? "Compose for the current chat" : "Open a chat first"}
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
                <IconBot size={18} /> Switch account
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
            placeholder="Search chats, @username or ID"
            aria-label="Search chats and known users"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      <BotIdentity />

      <div className="scroll-y" style={{ flex: 1, paddingBottom: "0.5rem" }}>
        {!searching && chats.length === 0 && (
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

        {searching && chats.length > 0 && <SearchSectionLabel label="Chats" count={chats.length} />}
        {chats.map((c) => (
          <ChatRow
            key={c.chat.id}
            entry={c}
            selected={String(c.chat.id) === selectedChatId}
            onClick={() => selectChat(String(c.chat.id))}
            meId={state.me?.id}
          />
        ))}

        {searching && people.length > 0 && <SearchSectionLabel label="People" count={people.length} />}
        {people.map((person) => (
          <PersonRow
            key={person.user.id}
            person={person}
            busy={resolvingId === person.user.id}
            onOpen={() => {
              if (person.privateChatId) {
                setQuery("");
                selectChat(person.privateChatId);
              } else {
                void resolveUserId(person.user.id);
              }
            }}
          />
        ))}

        {searching && lookupId != null && people.length === 0 && (
          <button
            type="button"
            className="search-id-result"
            disabled={resolvingId != null}
            onClick={() => void resolveUserId(lookupId)}
          >
            <span className="search-id-icon"><IconUsers size={18} /></span>
            <span style={{ minWidth: 0, flex: 1 }}>
              <strong>Check Telegram for ID {lookupId}</strong>
              <small>Works if the bot can access this private chat.</small>
            </span>
            <span className="search-result-action">
              {resolvingId === lookupId ? "Checking…" : "Resolve"}
            </span>
          </button>
        )}

        {searching && chats.length === 0 && people.length === 0 && lookupId == null && (
          <div className="search-empty">
            <strong>No locally known user</strong>
            <span>
              Usernames are searched from messages saved in this browser. Telegram bots cannot
              look up arbitrary people by username.
            </span>
          </div>
        )}
      </div>

      <footer className="sidebar-footer">
        <a
          className="sidebar-source-link"
          href={SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          aria-label="Open the Botgram source on GitHub"
        >
          <span className="sidebar-source-icon">
            <IconGitHub size={18} />
          </span>
          <span className="sidebar-source-copy">
            <strong>GitHub</strong>
            <small>iebb/botgram</small>
          </span>
        </a>
      </footer>
    </aside>
  );
}

function SearchSectionLabel({ label, count }: { label: string; count: number }) {
  return <div className="search-section-label">{label}<span>{count}</span></div>;
}

function PersonRow({
  person,
  busy,
  onOpen,
}: {
  person: KnownPerson;
  busy: boolean;
  onOpen: () => void;
}) {
  const { user, privateChatId, sourceChats } = person;
  const source = privateChatId
    ? "Private chat"
    : sourceChats.length
      ? `Seen in ${sourceChats[0].name}${sourceChats.length > 1 ? ` +${sourceChats.length - 1}` : ""}`
      : "Known from saved updates";

  return (
    <button type="button" className="person-row" onClick={onOpen} disabled={busy}>
      <Avatar id={user.id} name={userName(user)} entity={user} avatarKind="user" />
      <span className="person-row-copy">
        <strong>{userName(user)} {user.is_bot && <span className="chip accent">BOT</span>}</strong>
        <small>{user.username ? `@${user.username} · ` : ""}ID {user.id}</small>
        <small>{source}</small>
      </span>
      <span className="search-result-action">
        {busy ? "Checking…" : privateChatId ? "Open" : "Check ID"}
      </span>
    </button>
  );
}

function BotIdentity() {
  const { state, botAccounts, switchAccount, logout, authBusy, notify } = useStore();
  const [accountOpen, setAccountOpen] = useState(false);
  const [switchingId, setSwitchingId] = useState<string | null>(null);
  const accountRef = useOutsideClick<HTMLDivElement>(() => setAccountOpen(false));
  const me = state.me;
  const p = state.polling;
  const currentId = String(me?.id || "");
  const alternate = botAccounts.find((account) => account.botId !== currentId);

  const openAccount = async (botId: string) => {
    if (!botId || botId === currentId || switchingId) {
      setAccountOpen(false);
      return;
    }
    setSwitchingId(botId);
    await logout();
    const opened = await switchAccount(botId);
    if (!opened) notify("Could not open that saved bot account", "err");
    setSwitchingId(null);
    setAccountOpen(false);
  };

  return (
    <div className="bot-identity">
      <div ref={accountRef} className="bot-account-anchor">
        <button
          type="button"
          className={`bot-account-switcher${accountOpen ? " active" : ""}`}
          onClick={() => setAccountOpen((open) => !open)}
          aria-label={`Switch bot account${botAccounts.length > 1 ? `, ${botAccounts.length} saved` : ""}`}
          aria-haspopup="menu"
          aria-expanded={accountOpen}
        >
          <Avatar
            id={me?.id || 0}
            name={me?.first_name || "Bot"}
            size="sm"
            entity={me || undefined}
            avatarKind="user"
          />
          {alternate ? (
            <Avatar
              id={alternate.botId}
              name={alternate.name}
              size="xs"
              className="bot-account-overlap"
            />
          ) : (
            <span className="bot-account-overlap bot-account-add">
              <IconPlus size={10} />
            </span>
          )}
        </button>

        {accountOpen && (
          <div className="ctx-menu bot-account-menu" role="menu">
            <div className="bot-account-menu-title">
              <strong>Bot accounts</strong>
              <small>Saved only in this browser</small>
            </div>
            {botAccounts.map((account) => {
              const active = account.botId === currentId;
              const busy = switchingId === account.botId;
              return (
                <button
                  type="button"
                  className={`ctx-item bot-account-item${active ? " active" : ""}`}
                  key={account.botId}
                  role="menuitem"
                  aria-current={active ? "true" : undefined}
                  disabled={authBusy || Boolean(switchingId)}
                  onClick={() => void openAccount(account.botId)}
                >
                  <Avatar id={account.botId} name={account.name} size="xs" />
                  <span className="bot-account-item-copy">
                    <strong>{account.name}</strong>
                    <small>{account.username ? `@${account.username}` : `ID ${account.botId}`}</small>
                  </span>
                  {busy ? (
                    <span className="bot-account-state">Opening…</span>
                  ) : active ? (
                    <IconCheck size={16} />
                  ) : null}
                </button>
              );
            })}
            <div className="bot-account-menu-rule" />
            <button
              type="button"
              className="ctx-item"
              role="menuitem"
              disabled={authBusy || Boolean(switchingId)}
              onClick={() => {
                setAccountOpen(false);
                void logout();
              }}
            >
              <IconPlus size={17} /> Add or manage bots
            </button>
          </div>
        )}
      </div>
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
