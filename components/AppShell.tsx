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

      <div className="toast-stack" aria-live="polite" aria-atomic="true">
        {!state.connected && (
          <div className="toast warning" role="status">Reconnecting to the update stream…</div>
        )}
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast${t.kind === "err" ? " err" : ""}`}
            role={t.kind === "err" ? "alert" : "status"}
          >
            {t.text}
          </div>
        ))}
      </div>
    </div>
  );
}
