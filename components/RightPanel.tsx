"use client";

import React from "react";
import dynamic from "next/dynamic";
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

const InfoPanel = dynamic(() => import("./panels/InfoPanel"));
const ActionsPanel = dynamic(() => import("./panels/ActionsPanel"));
const AdminPanel = dynamic(() => import("./panels/AdminPanel"));
const BotPanel = dynamic(() => import("./panels/BotPanel"));
const UpdatesPanel = dynamic(() => import("./panels/UpdatesPanel"));
const WebhookPanel = dynamic(() => import("./panels/WebhookPanel"));
const StickersPanel = dynamic(() => import("./panels/StickersPanel"));
const ConsolePanel = dynamic(() => import("./panels/ConsolePanel"));

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
