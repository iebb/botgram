"use client";

import React from "react";
import InfoPanel from "./panels/InfoPanel";
import ActionsPanel from "./panels/ActionsPanel";
import AdminPanel from "./panels/AdminPanel";
import BotPanel from "./panels/BotPanel";
import UpdatesPanel from "./panels/UpdatesPanel";
import WebhookPanel from "./panels/WebhookPanel";
import StickersPanel from "./panels/StickersPanel";
import ConsolePanel from "./panels/ConsolePanel";
import { IconClose } from "./Icons";

const TABS = [
  { id: "info", label: "Info" },
  { id: "send", label: "Tools" },
  { id: "admin", label: "Admin" },
  { id: "bot", label: "Bot" },
  { id: "updates", label: "Updates" },
  { id: "stickers", label: "Stickers" },
  { id: "webhook", label: "Webhook" },
  { id: "console", label: "Console" },
];

export default function RightPanel({
  tab,
  setTab,
  onClose,
}: {
  tab: string;
  setTab: (t: string) => void;
  onClose: () => void;
}) {
  return (
    <aside className="right-panel">
      <div className="topbar" style={{ paddingLeft: "1rem" }}>
        <div style={{ fontWeight: 600, flex: 1 }}>Bot control</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <IconClose size={20} />
        </button>
      </div>

      <div className="panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`panel-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "info" && <InfoPanel />}
      {tab === "send" && <ActionsPanel />}
      {tab === "admin" && <AdminPanel />}
      {tab === "bot" && <BotPanel />}
      {tab === "updates" && <UpdatesPanel />}
      {tab === "stickers" && <StickersPanel />}
      {tab === "webhook" && <WebhookPanel />}
      {tab === "console" && <ConsolePanel />}
    </aside>
  );
}
