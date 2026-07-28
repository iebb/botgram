"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "../Store";
import { Field, Json, TextInput, Toggle } from "../UI";
import { ALL_UPDATE_TYPES } from "@/lib/updateTypes";
import type { TgResult } from "@/lib/client/api";
import GroupPrivacyWarning from "../GroupPrivacyWarning";

export default function WebhookPanel() {
  const { call, notify, upload } = useStore();
  const [info, setInfo] = useState<unknown>(null);
  const [url, setUrl] = useState("");
  const [secret, setSecret] = useState("");
  const [ip, setIp] = useState("");
  const [maxConn, setMaxConn] = useState("40");
  const [drop, setDrop] = useState(false);
  const [allowed, setAllowed] = useState<string[]>([]);
  const [cert, setCert] = useState<File | null>(null);

  const refresh = async () => {
    const res = await call("getWebhookInfo");
    if (res.ok) setInfo(res.result);
  };

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (t: string) =>
    setAllowed((a) => (a.includes(t) ? a.filter((x) => x !== t) : [...a, t]));

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <GroupPrivacyWarning compact />
      <div className="section">
        <div className="section-title">Current webhook</div>
        <Json value={info} />
        <button className="btn sm" style={{ marginTop: "0.5rem" }} onClick={refresh}>
          Refresh
        </button>
        <p className="muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
          Humanoid relays updates from this Worker endpoint to open browsers. Each browser saves
          its own received updates in IndexedDB; the WebSocket coordinator stores no payloads.
        </p>
        <button
          className="btn sm primary"
          onClick={async () => {
            const response = await fetch("/api/webhook/install", { method: "POST" });
            const result = (await response.json()) as TgResult;
            notify(result.ok ? "Humanoid webhook restored" : result.description || "Restore failed", result.ok ? "ok" : "err");
            if (result.ok) refresh();
          }}
        >
          Restore this Worker webhook
        </button>
      </div>

      <div className="section">
        <div className="section-title">Advanced webhook override</div>
        <p className="muted" style={{ fontSize: "0.75rem", lineHeight: 1.5 }}>
          Changing or deleting the webhook intentionally pauses live updates in Humanoid. The full
          Bot API remains available here for testing.
        </p>
        <Field label="HTTPS URL">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/tg" />
        </Field>
        <Field label="secret_token" hint="Sent back as X-Telegram-Bot-Api-Secret-Token.">
          <TextInput value={secret} onChange={(e) => setSecret(e.target.value)} />
        </Field>
        <Field label="ip_address">
          <TextInput value={ip} onChange={(e) => setIp(e.target.value)} />
        </Field>
        <Field label="max_connections">
          <TextInput type="number" value={maxConn} onChange={(e) => setMaxConn(e.target.value)} />
        </Field>
        <Field label="Self-signed certificate">
          <input type="file" className="input" onChange={(e) => setCert(e.target.files?.[0] || null)} />
        </Field>
        <Toggle checked={drop} onChange={setDrop} label="Drop pending updates" />

        <div className="section-title" style={{ marginTop: "0.75rem" }}>
          allowed_updates {allowed.length ? `(${allowed.length})` : "(all default)"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.5rem" }}>
          {ALL_UPDATE_TYPES.map((t) => (
            <Toggle key={t} checked={allowed.includes(t)} onChange={() => toggle(t)} label={t} />
          ))}
        </div>

        <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.75rem", flexWrap: "wrap" }}>
          <button
            className="btn sm primary"
            onClick={async () => {
              const params = {
                url,
                secret_token: secret || undefined,
                ip_address: ip || undefined,
                max_connections: Number(maxConn) || undefined,
                drop_pending_updates: drop || undefined,
                allowed_updates: allowed.length ? allowed : undefined,
              };
              const res = cert
                ? await upload("setWebhook", params, { certificate: cert })
                : await call("setWebhook", params);
              if (res.ok) {
                notify("Webhook overridden — Humanoid will pause unless this is its own endpoint");
                refresh();
              }
            }}
          >
            setWebhook
          </button>
          <button
            className="btn sm danger"
            onClick={async () => {
              const res = await call("deleteWebhook", { drop_pending_updates: drop || undefined });
              if (res.ok) {
                notify("Webhook deleted — restore the Worker webhook to resume live updates");
                refresh();
              }
            }}
          >
            deleteWebhook
          </button>
        </div>
      </div>
    </div>
  );
}
