"use client";

import React, { FormEvent, useState } from "react";
import { useStore } from "./Store";
import { IconBot, IconClose } from "./Icons";

export default function LoginScreen() {
  const {
    authStatus,
    authBusy,
    authError,
    botAccounts,
    forgetAccount,
    login,
    switchAccount,
  } = useStore();
  const [token, setToken] = useState("");
  const [switchingId, setSwitchingId] = useState("");

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
          Open the Bot API as a familiar Telegram workspace. Telegram has no contacts or joined-groups
          listing for bots, so Humanoid restores chats this browser learned from live updates.
        </p>

        {authStatus === "checking" ? (
          <div className="login-checking"><span className="dot on" /> Checking your session…</div>
        ) : (
          <>
            {botAccounts.length > 0 && (
              <section className="login-accounts" aria-label="Saved bot accounts">
                <div className="login-section-label">Saved bots</div>
                {botAccounts.map((account) => (
                  <div className="login-account" key={account.botId}>
                    <button
                      type="button"
                      className="login-account-select"
                      disabled={authBusy}
                      onClick={async () => {
                        setSwitchingId(account.botId);
                        try {
                          await switchAccount(account.botId);
                        } finally {
                          setSwitchingId("");
                        }
                      }}
                    >
                      <span className="login-account-icon"><IconBot size={18} /></span>
                      <span className="login-account-name">
                        <strong>{account.name}</strong>
                        <small>{account.username ? `@${account.username}` : `Bot ${account.botId}`}</small>
                      </span>
                      <span className="login-account-action">
                        {switchingId === account.botId ? "Connecting…" : "Open"}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="login-account-forget"
                      aria-label={`Forget ${account.name}`}
                      title="Forget this bot token"
                      disabled={authBusy}
                      onClick={() => {
                        if (window.confirm(`Forget ${account.name} on this browser? Its IndexedDB chat history will remain until you clear it.`)) {
                          forgetAccount(account.botId);
                        }
                      }}
                    >
                      <IconClose size={16} />
                    </button>
                  </div>
                ))}
              </section>
            )}

            <form onSubmit={submit}>
              <label htmlFor="bot-token">{botAccounts.length ? "Add another bot token" : "Telegram bot token"}</label>
              <input
                id="bot-token"
                className="input login-token"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="123456789:AA…"
                autoFocus={!botAccounts.length}
              />
              {authError && <div className="login-error" role="alert">{authError}</div>}
              <button className="btn primary login-button" type="submit" disabled={authBusy || !token.trim()}>
                {authBusy ? "Connecting…" : botAccounts.length ? "Add and open bot" : "Open Humanoid"}
              </button>
            </form>
          </>
        )}

        <div className="login-security">
          Saved bot tokens stay only in this browser&apos;s local storage. Requests pass the active token through the
          Worker to Telegram, but the Worker has no token secret, session database, or credential
          storage. Each bot&apos;s chat state remains isolated in this device&apos;s IndexedDB.
        </div>
      </div>
    </main>
  );
}
