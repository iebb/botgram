"use client";

import React, { useState } from "react";
import Sidebar from "./Sidebar";
import ChatPane from "./ChatPane";
import RightPanel from "./RightPanel";
import { useStore } from "./Store";
import LoginScreen from "./LoginScreen";
import RichMessageEditor from "./RichMessageEditor";

export default function AppShell() {
  const { toasts, state, selectedChatId, authStatus } = useStore();
  const [panelOpen, setPanelOpen] = useState(true);
  const [tab, setTab] = useState("updates");
  const [richEditorOpen, setRichEditorOpen] = useState(false);

  const openPanel = (t: string) => {
    setTab(t);
    setPanelOpen(true);
  };

  if (authStatus !== "authenticated") return <LoginScreen />;

  return (
    <div className={`app-shell${selectedChatId ? "" : " no-chat"}`}>
      <Sidebar onOpenPanel={openPanel} onOpenRichEditor={() => setRichEditorOpen(true)} />
      <ChatPane
        onOpenPanel={openPanel}
        onOpenRichEditor={() => setRichEditorOpen(true)}
        panelOpen={panelOpen}
      />
      {panelOpen && <RightPanel tab={tab} setTab={setTab} onClose={() => setPanelOpen(false)} />}
      {richEditorOpen && <RichMessageEditor onClose={() => setRichEditorOpen(false)} />}

      {!state.connected && (
        <div
          style={{
            position: "fixed",
            top: "0.75rem",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 400,
            background: "var(--warning)",
            color: "#000",
            padding: "0.25rem 0.75rem",
            borderRadius: "1rem",
            fontSize: "0.75rem",
            fontWeight: 500,
          }}
        >
          Reconnecting to the update stream…
        </div>
      )}

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast${t.kind === "err" ? " err" : ""}`}>
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
