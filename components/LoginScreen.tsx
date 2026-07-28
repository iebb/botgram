"use client";

import React, { FormEvent, useState } from "react";
import { useStore } from "./Store";

export default function LoginScreen() {
  const { authStatus, authBusy, authError, login } = useStore();
  const [token, setToken] = useState("");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!token.trim()) return;
    if (await login(token.trim())) setToken("");
  };

  return (
    <main className="login-screen">
      <div className="login-card">
        <div className="login-mark" aria-hidden="true">H</div>
        <div className="login-eyebrow">HUMANOID</div>
        <h1>Telegram for your bot</h1>
        <p>
          Open the Bot API as a familiar Telegram workspace. Chats appear after somebody contacts
          the bot; a bot still cannot start a new user conversation.
        </p>

        {authStatus === "checking" ? (
          <div className="login-checking"><span className="dot on" /> Checking your session…</div>
        ) : (
          <form onSubmit={submit}>
            <label htmlFor="bot-token">Telegram bot token</label>
            <input
              id="bot-token"
              className="input login-token"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="123456789:AA…"
              autoFocus
            />
            {authError && <div className="login-error" role="alert">{authError}</div>}
            <button className="btn primary login-button" type="submit" disabled={authBusy || !token.trim()}>
              {authBusy ? "Connecting…" : "Open Humanoid"}
            </button>
          </form>
        )}

        <div className="login-security">
          The token is saved only in this browser&apos;s local storage. Requests pass it through the
          Worker to Telegram, but the Worker has no token secret, session database, or credential
          storage. Chat state remains separate in this device&apos;s IndexedDB.
        </div>
      </div>
    </main>
  );
}
