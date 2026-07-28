"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "../Store";
import { Avatar, Json } from "../UI";
import { chatKindLabel, chatName, fileSrc, userName } from "@/lib/format";
import type { TgAny } from "@/lib/types";

export default function InfoPanel() {
  const { chat, call, selectedChatId, notify, state } = useStore();
  const [full, setFull] = useState<TgAny | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!selectedChatId) return;
    setFull(null);
    setCount(null);
    (async () => {
      const c = await call("getChat", { chat_id: Number(selectedChatId) });
      if (c.ok) setFull(c.result);
      const n = await call("getChatMemberCount", { chat_id: Number(selectedChatId) });
      if (n.ok) setCount(n.result);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChatId]);

  if (!chat) return <Empty />;

  const c = full || chat.chat;
  const photo = c.photo?.big_file_id;
  const known = Object.values(chat.knownUsers || {});

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <div className="section" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.625rem" }}>
          <Avatar
            id={c.id}
            name={chatName(c)}
            size="lg"
            entity={c}
            avatarKind={c.type === "private" ? "user" : "chat"}
            photoUrl={photo ? fileSrc(photo) : undefined}
          />
        </div>
        <div style={{ fontWeight: 600, fontSize: "1.125rem" }}>{chatName(c)}</div>
        <div className="muted" style={{ fontSize: "0.8125rem" }}>
          {chatKindLabel(c)}
          {count != null ? ` · ${count} members` : ""}
        </div>
        {c.username && (
          <a
            className="tg-link"
            href={`https://t.me/${c.username}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: "0.8125rem" }}
          >
            @{c.username}
          </a>
        )}
      </div>

      <div className="section">
        <div className="section-title">Details</div>
        <Row k="Chat ID" v={String(c.id)} copyable />
        <Row k="Type" v={c.type} />
        {c.bio && <Row k="Bio" v={c.bio} />}
        {c.description && <Row k="Description" v={c.description} />}
        {c.invite_link && <Row k="Invite link" v={c.invite_link} copyable />}
        {c.slow_mode_delay != null && <Row k="Slow mode" v={`${c.slow_mode_delay}s`} />}
        {c.linked_chat_id && <Row k="Linked chat" v={String(c.linked_chat_id)} />}
        {c.is_forum && <Row k="Forum" v="yes" />}
        {c.has_protected_content && <Row k="Protected content" v="yes" />}
        {c.message_auto_delete_time && (
          <Row k="Auto-delete" v={`${c.message_auto_delete_time}s`} />
        )}
        {c.accent_color_id != null && <Row k="Accent colour id" v={String(c.accent_color_id)} />}
        {c.max_reaction_count != null && (
          <Row k="Max reactions" v={String(c.max_reaction_count)} />
        )}
      </div>

      {c.permissions && (
        <div className="section">
          <div className="section-title">Default permissions</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.125rem" }}>
            {Object.entries(c.permissions).map(([k, v]) => (
              <div key={k} style={{ fontSize: "0.75rem" }}>
                <span style={{ color: v ? "var(--success)" : "var(--text-tertiary)" }}>
                  {v ? "✓" : "✗"}
                </span>{" "}
                <span className="muted">{k.replace(/^can_/, "")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {known.length > 0 && (
        <div className="section">
          <div className="section-title">People the bot has seen here</div>
          {known.map((u: TgAny) => (
            <div
              key={u.id}
              style={{ display: "flex", gap: "0.5rem", alignItems: "center", padding: "0.25rem 0" }}
            >
              <Avatar id={u.id} name={userName(u)} size="xs" entity={u} avatarKind="user" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="truncate-1" style={{ fontSize: "0.8125rem" }}>
                  {userName(u)} {u.is_premium && "⭐️"}
                </div>
                <div className="muted" style={{ fontSize: "0.6875rem" }}>
                  id {u.id}
                  {u.username ? ` · @${u.username}` : ""}
                  {u.language_code ? ` · ${u.language_code}` : ""}
                </div>
              </div>
              <button
                className="btn sm ghost"
                onClick={() => {
                  navigator.clipboard?.writeText(String(u.id));
                  notify("user_id copied");
                }}
              >
                copy id
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="section" style={{ borderBottom: "none" }}>
        <div className="section-title">Raw getChat</div>
        <Json value={full || chat.chat} />
      </div>
    </div>
  );
}

function Row({ k, v, copyable }: { k: string; v: string; copyable?: boolean }) {
  const { notify } = useStore();
  return (
    <div style={{ display: "flex", gap: "0.5rem", padding: "0.25rem 0", fontSize: "0.8125rem" }}>
      <div className="muted" style={{ width: "8rem", flexShrink: 0 }}>
        {k}
      </div>
      <div style={{ flex: 1, wordBreak: "break-word" }}>{v}</div>
      {copyable && (
        <button
          className="btn sm ghost"
          onClick={() => {
            navigator.clipboard?.writeText(v);
            notify("Copied");
          }}
        >
          copy
        </button>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="muted" style={{ padding: "1.5rem", textAlign: "center" }}>
      No chat selected.
    </div>
  );
}
