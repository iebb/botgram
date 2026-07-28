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
import {
  IconBolt,
  IconBot,
  IconClose,
  IconInfo,
  IconRefresh,
  IconShield,
  IconSticker,
  IconTerminal,
  IconWebhook,
} from "./Icons";
import { useStore } from "./Store";
import { isBotAdministrator } from "@/lib/chatPermissions";

const TABS = [
  { id: "info", label: "Info", Icon: IconInfo },
  { id: "send", label: "Tools", Icon: IconBolt },
  { id: "admin", label: "Admin", Icon: IconShield },
  { id: "bot", label: "Bot", Icon: IconBot },
  { id: "updates", label: "Updates", Icon: IconRefresh },
  { id: "stickers", label: "Stickers", Icon: IconSticker },
  { id: "webhook", label: "Webhook", Icon: IconWebhook },
  { id: "console", label: "Console", Icon: IconTerminal },
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
  const { botChatMember } = useStore();
  const canAdminister = isBotAdministrator(botChatMember);
  const tabs = TABS.filter((item) => item.id !== "admin" || canAdminister);

  React.useEffect(() => {
    if (tab === "admin" && !canAdminister) setTab("info");
  }, [canAdminister, setTab, tab]);

  return (
    <aside className="right-panel">
      <div className="topbar" style={{ paddingLeft: "1rem" }}>
        <div style={{ fontWeight: 600, flex: 1 }}>Bot control</div>
        <button className="icon-btn" onClick={onClose} aria-label="Close panel">
          <IconClose size={20} />
        </button>
      </div>

      <div className="panel-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`panel-tab${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
            title={t.label}
            aria-label={t.label}
          >
            <t.Icon size={17} />
            <span>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "info" && <InfoPanel />}
      {tab === "send" && <ActionsPanel />}
      {tab === "admin" && canAdminister && <AdminPanel />}
      {tab === "bot" && <BotPanel />}
      {tab === "updates" && <UpdatesPanel />}
      {tab === "stickers" && <StickersPanel />}
      {tab === "webhook" && <WebhookPanel />}
      {tab === "console" && <ConsolePanel />}
    </aside>
  );
}
