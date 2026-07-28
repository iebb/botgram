"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "../Store";
import { Field, Json } from "../UI";
import { ALL_METHODS, METHOD_TEMPLATES } from "@/lib/methods";
import type { TgAny } from "@/lib/types";

export default function ConsolePanel() {
  const { call, upload, notify, selectedChatId, state } = useStore();
  const [method, setMethod] = useState("getMe");
  const [body, setBody] = useState("{}");
  const [file, setFile] = useState<File | null>(null);
  const [fileField, setFileField] = useState("");
  const [result, setResult] = useState<TgAny | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    const tpl = METHOD_TEMPLATES[method];
    if (tpl) {
      const withChat = JSON.parse(JSON.stringify(tpl));
      if (withChat.chat_id === 0 && selectedChatId) withChat.chat_id = Number(selectedChatId);
      setBody(JSON.stringify(withChat, null, 2));
    } else {
      setBody(selectedChatId && /chat|message|pin|ban/i.test(method)
        ? JSON.stringify({ chat_id: Number(selectedChatId) }, null, 2)
        : "{}");
    }
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [method]);

  const send = async () => {
    let params: TgAny;
    try {
      params = JSON.parse(body || "{}");
    } catch (e: any) {
      return notify(`Bad JSON: ${e.message}`, "err");
    }
    setBusy(true);
    try {
      const res =
        file && fileField
          ? await upload(method, params, { [fileField]: file })
          : await call(method, params);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  const visible = filter
    ? ALL_METHODS.filter((m) => m.toLowerCase().includes(filter.toLowerCase()))
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      <div style={{ padding: "0.875rem 1rem", borderBottom: "1px solid var(--panel-border)" }}>
        <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 0.625rem", lineHeight: 1.5 }}>
          Every Bot API method, including the ones without a dedicated screen. Responses that
          contain a Message are folded into this session's chat timeline. Results and activity are
          discarded when the page closes or reloads.
        </p>

        <Field label="Filter methods">
          <input
            className="input"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={`${ALL_METHODS.length} methods available`}
          />
        </Field>

        <Field label="Method" hint="Choose a catalogued method or type any newer Bot API method.">
          <input
            className="input mono"
            list="bot-api-methods"
            value={method}
            onChange={(e) => setMethod(e.target.value.trim())}
            spellCheck={false}
          />
          <datalist id="bot-api-methods">
            {(visible || ALL_METHODS).map((name) => <option key={name} value={name} />)}
          </datalist>
        </Field>

        {/ManagedBotToken/.test(method) && (
          <div className="chip err" style={{ display: "block", whiteSpace: "normal", marginBottom: "0.625rem" }}>
            This response contains a live bot credential. Humanoid shows it once here and omits it
            from the in-memory activity stream.
          </div>
        )}

        <Field label="Parameters (JSON)">
          <textarea
            className="textarea mono"
            rows={10}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            spellCheck={false}
          />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
          <Field label="File field name" hint="e.g. photo, document, sticker">
            <input
              className="input"
              value={fileField}
              onChange={(e) => setFileField(e.target.value)}
              placeholder="optional"
            />
          </Field>
          <Field label="File">
            <input type="file" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </Field>
        </div>

        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          <button className="btn primary sm" onClick={send} disabled={busy}>
            {busy ? "Calling…" : `POST /${method}`}
          </button>
          {selectedChatId && (
            <button
              className="btn sm"
              onClick={() => {
                try {
                  const p = JSON.parse(body || "{}");
                  p.chat_id = Number(selectedChatId);
                  setBody(JSON.stringify(p, null, 2));
                } catch {
                  notify("Fix the JSON first", "err");
                }
              }}
            >
              + chat_id
            </button>
          )}
          <button
            className="btn sm"
            onClick={() => {
              const m = state.me;
              if (!m) return;
              try {
                const p = JSON.parse(body || "{}");
                p.user_id = m.id;
                setBody(JSON.stringify(p, null, 2));
              } catch {
                notify("Fix the JSON first", "err");
              }
            }}
          >
            + user_id (bot)
          </button>
          <button className="btn sm ghost" onClick={() => setBody("{}")}>
            Clear
          </button>
        </div>
      </div>

      <div className="scroll-y" style={{ flex: 1, padding: "0.875rem 1rem" }}>
        {result ? (
          <>
            <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.5rem" }}>
              <span className={`chip ${result.ok ? "ok" : "err"}`}>
                {result.ok ? "ok: true" : `error ${result.error_code || ""}`}
              </span>
              {!result.ok && (
                <span className="chip err" style={{ whiteSpace: "normal" }}>
                  {result.description}
                </span>
              )}
            </div>
            <Json value={result.result ?? result} />
          </>
        ) : (
          <div className="muted" style={{ fontSize: "0.8125rem" }}>
            No response yet.
          </div>
        )}
      </div>
    </div>
  );
}
