"use client";

import React, { useState } from "react";
import { useStore } from "../Store";
import { Field, Json, TextArea, TextInput, Toggle } from "../UI";
import { polling as pollingApi } from "@/lib/client/api";
import { userName } from "@/lib/format";
import type { PendingQuery } from "@/lib/types";

export default function UpdatesPanel() {
  const { state, notify, browserStorage, clearBrowserHistory } = useStore();
  const [view, setView] = useState<"queries" | "raw" | "log">("queries");
  const p = state.polling;

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
      {/* ------------------------------------------------ webhook status */}
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--panel-border)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
          <span className={`dot ${p.lastError ? "err" : p.running ? "on" : "off"}`} />
          <div style={{ flex: 1, fontSize: "0.8125rem" }}>
            {p.running ? "Telegram webhook leased to this dashboard" : "Webhook connecting…"}
            <span className="muted">
              {p.lastPollAt ? ` · last update ${new Date(p.lastPollAt).toLocaleTimeString()}` : ""}
              {` · ${p.updatesSeen} saved updates`}
              {p.pendingUpdates ? ` · ${p.pendingUpdates} waiting at Telegram` : ""}
            </span>
          </div>
        </div>
        <div className={`chip ${browserStorage === "ready" ? "ok" : browserStorage === "memory-only" ? "err" : ""}`} style={{ marginBottom: "0.55rem" }}>
          {browserStorage === "ready" ? "Saved in this browser · IndexedDB" : browserStorage === "memory-only" ? "Browser storage unavailable" : "Loading browser history…"}
        </div>
        <p className="muted" style={{ margin: "0 0 0.55rem", fontSize: "0.7rem", lineHeight: 1.45 }}>
          Chats, incoming updates, API activity, and avatar references stay on this device. The Worker stores none of them.
        </p>
        {p.lastError && (
          <div className="chip err" style={{ display: "block", marginBottom: "0.5rem", whiteSpace: "normal" }}>
            {p.lastError}
          </div>
        )}
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          <button
            className="btn sm primary"
            onClick={async () => {
              const result = await pollingApi("start");
              notify(result.ok ? "Dashboard webhook restored" : result.description || "Webhook restore failed", result.ok ? "ok" : "err");
            }}
          >
            Restore webhook
          </button>
          <button
            className="btn sm"
            onClick={async () => {
              if (!window.confirm("Delete Humanoid's saved chats and updates from this browser? Telegram messages are not affected.")) return;
              const cleared = await clearBrowserHistory();
              notify(
                cleared ? "Saved browser history cleared" : "Current view cleared, but IndexedDB could not be erased",
                cleared ? "ok" : "err"
              );
            }}
          >
            Clear browser history
          </button>
        </div>
      </div>

      <div className="panel-tabs">
        {(["queries", "raw", "log"] as const).map((v) => (
          <button
            key={v}
            className={`panel-tab${view === v ? " active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "queries"
              ? `Queries (${state.queries.filter((q) => !q.answered).length})`
              : v === "raw"
                ? `Raw updates (${state.rawUpdates.length})`
                : `API log (${state.log.length})`}
          </button>
        ))}
      </div>

      <div className="scroll-y" style={{ flex: 1 }}>
        {view === "queries" &&
          (state.queries.length === 0 ? (
            <Hint>
              Nothing yet. Press an inline button, send an inline query, or add the bot to a group —
              every non-message update lands here with the exact call needed to answer it.
            </Hint>
          ) : (
            state.queries.map((q) => <QueryCard key={q.id} q={q} />)
          ))}

        {view === "raw" &&
          (state.rawUpdates.length === 0 ? (
            <Hint>No incoming updates have been saved in this browser yet.</Hint>
          ) : (
            state.rawUpdates.map((u) => (
              <div key={u.update_id} className="section" style={{ borderBottomWidth: "1px" }}>
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.375rem" }}>
                  <span className="chip accent">#{u.update_id}</span>
                  <span className="chip">
                    {Object.keys(u).filter((k) => k !== "update_id")[0] || "unknown"}
                  </span>
                </div>
                <Json value={u} />
              </div>
            ))
          ))}

        {view === "log" &&
          (state.log.length === 0 ? <Hint>Bot API activity will be saved locally in this browser.</Hint> : state.log.map((l) => (
            <div key={l.id} className="section" style={{ borderBottomWidth: "1px" }}>
              <div style={{ display: "flex", gap: "0.375rem", alignItems: "center", marginBottom: "0.375rem" }}>
                <span className={`chip ${l.ok ? "ok" : "err"}`}>{l.ok ? "ok" : "error"}</span>
                <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{l.method}</span>
                <span className="muted" style={{ fontSize: "0.6875rem", marginLeft: "auto" }}>
                  {l.ms}ms · {new Date(l.at).toLocaleTimeString()}
                </span>
              </div>
              {l.error && <div className="chip err" style={{ whiteSpace: "normal" }}>{l.error}</div>}
              <Json value={{ params: l.params, result: l.result }} />
            </div>
          )))}
      </div>
    </div>
  );
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="muted" style={{ padding: "1.5rem 1.25rem", fontSize: "0.8125rem", lineHeight: 1.5 }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- queries */

function QueryCard({ q }: { q: PendingQuery }) {
  const [open, setOpen] = useState(!q.answered);
  const from = q.payload?.from || q.payload?.user;

  return (
    <div className="section" style={{ borderBottomWidth: "1px", opacity: q.answered ? 0.6 : 1 }}>
      <div
        style={{ display: "flex", gap: "0.375rem", alignItems: "center", cursor: "pointer" }}
        onClick={() => setOpen(!open)}
      >
        <span className="chip accent">{q.kind}</span>
        {from && <span style={{ fontSize: "0.8125rem" }}>{userName(from)}</span>}
        {q.answered && <span className="chip ok">answered</span>}
        <span className="muted" style={{ fontSize: "0.6875rem", marginLeft: "auto" }}>
          {new Date(q.at).toLocaleTimeString()}
        </span>
      </div>

      {q.kind === "callback_query" && q.payload.data && (
        <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem" }}>
          data: <code className="tg-code">{q.payload.data}</code>
        </div>
      )}
      {q.kind === "inline_query" && (
        <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem" }}>
          query: <code className="tg-code">{q.payload.query || "(empty)"}</code>
        </div>
      )}
      {q.kind === "guest_message" && (
        <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem" }}>
          guest message: <code className="tg-code">{q.payload.text || q.payload.caption || "(media)"}</code>
        </div>
      )}

      {open && (
        <div style={{ marginTop: "0.625rem" }}>
          <Answerer q={q} />
          <details style={{ marginTop: "0.5rem" }}>
            <summary style={{ fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer" }}>
              Raw payload
            </summary>
            <Json value={q.payload} />
          </details>
        </div>
      )}
    </div>
  );
}

function Answerer({ q }: { q: PendingQuery }) {
  switch (q.kind) {
    case "callback_query":
      return <CallbackAnswer q={q} />;
    case "inline_query":
      return <InlineAnswer q={q} />;
    case "shipping_query":
      return <ShippingAnswer q={q} />;
    case "pre_checkout_query":
      return <PreCheckoutAnswer q={q} />;
    case "guest_message":
      return <GuestAnswer q={q} />;
    case "chat_join_request":
      return <JoinRequestAnswer q={q} />;
    default:
      return (
        <div className="muted" style={{ fontSize: "0.75rem" }}>
          Informational update — nothing to answer.
        </div>
      );
  }
}

function GuestAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [result, setResult] = useState(
    JSON.stringify(
      {
        type: "article",
        id: "humanoid-reply",
        title: "Guest reply",
        input_message_content: {
          message_text: `Reply from the bot to: ${q.payload.text || "guest message"}`,
        },
      },
      null,
      2
    )
  );

  return (
    <>
      <Field label="result (InlineQueryResult)" hint="Guest replies can include media, rich message content, and inline keyboards.">
        <TextArea className="mono" rows={10} value={result} onChange={(event) => setResult(event.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(result);
          } catch (error) {
            return notify(error instanceof Error ? `Bad JSON: ${error.message}` : "Bad JSON", "err");
          }
          const response = await call(
            "answerGuestQuery",
            { guest_query_id: q.payload.guest_query_id, result: parsed },
            { queryLocalId: q.id }
          );
          if (response.ok) notify("Guest query answered");
        }}
      >
        answerGuestQuery
      </button>
    </>
  );
}

function JoinRequestAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [webAppUrl, setWebAppUrl] = useState("");
  const queryId = typeof q.payload.query_id === "string" ? q.payload.query_id : "";

  if (!queryId) {
    return (
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn sm primary"
          onClick={async () => {
            const response = await call(
              "approveChatJoinRequest",
              { chat_id: q.payload.chat.id, user_id: q.payload.from.id },
              { queryLocalId: q.id }
            );
            if (response.ok) notify("Join request approved");
          }}
        >
          Approve
        </button>
        <button
          className="btn sm danger"
          onClick={async () => {
            const response = await call(
              "declineChatJoinRequest",
              { chat_id: q.payload.chat.id, user_id: q.payload.from.id },
              { queryLocalId: q.id }
            );
            if (response.ok) notify("Join request declined");
          }}
        >
          Decline
        </button>
      </div>
    );
  }

  const answer = async (result: "approve" | "decline" | "queue") => {
    const response = await call(
      "answerChatJoinRequestQuery",
      { chat_join_request_query_id: queryId, result },
      { queryLocalId: q.id }
    );
    if (response.ok) notify(`Join request query answered: ${result}`);
  };

  return (
    <>
      <div className="chip" style={{ whiteSpace: "normal", marginBottom: "0.5rem" }}>
        Guard-bot query: answer within Telegram&apos;s 10-second window.
      </div>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button className="btn sm primary" onClick={() => void answer("approve")}>Approve</button>
        <button className="btn sm danger" onClick={() => void answer("decline")}>Decline</button>
        <button className="btn sm" onClick={() => void answer("queue")}>Send to admin queue</button>
      </div>
      <Field label="Mini App URL" hint="Optionally show a Web App before resolving the query.">
        <TextInput value={webAppUrl} onChange={(event) => setWebAppUrl(event.target.value)} placeholder="https://…" />
      </Field>
      <button
        className="btn sm"
        disabled={!webAppUrl.trim()}
        onClick={async () => {
          const response = await call("sendChatJoinRequestWebApp", {
            chat_join_request_query_id: queryId,
            web_app_url: webAppUrl.trim(),
          });
          if (response.ok) notify("Join-request Mini App opened");
        }}
      >
        sendChatJoinRequestWebApp
      </button>
    </>
  );
}

function CallbackAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [text, setText] = useState("");
  const [alert, setAlert] = useState(false);
  const [url, setUrl] = useState("");
  const [cache, setCache] = useState("0");

  return (
    <>
      <Field label="Toast / alert text" hint="Max 200 characters. Empty just dismisses the spinner.">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Toggle checked={alert} onChange={setAlert} label="Show as alert (show_alert)" />
      <Field label="URL to open (games / t.me deep link)">
        <TextInput value={url} onChange={(e) => setUrl(e.target.value)} />
      </Field>
      <Field label="cache_time (s)">
        <TextInput value={cache} onChange={(e) => setCache(e.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={async () => {
          const res = await call(
            "answerCallbackQuery",
            {
              callback_query_id: q.payload.id,
              text: text || undefined,
              show_alert: alert || undefined,
              url: url || undefined,
              cache_time: Number(cache) || undefined,
            },
            { queryLocalId: q.id }
          );
          if (res.ok) notify("Callback answered");
        }}
      >
        answerCallbackQuery
      </button>
    </>
  );
}

function InlineAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [results, setResults] = useState(
    JSON.stringify(
      [
        {
          type: "article",
          id: "1",
          title: `You typed: ${q.payload.query || "(nothing)"}`,
          description: "Tap to send",
          input_message_content: {
            message_text: `Result for *${q.payload.query || "empty query"}*`,
            parse_mode: "MarkdownV2",
          },
        },
      ],
      null,
      2
    )
  );
  const [personal, setPersonal] = useState(true);
  const [cache, setCache] = useState("0");
  const [buttonText, setButtonText] = useState("");
  const [buttonParam, setButtonParam] = useState("");

  return (
    <>
      <Field label="results (InlineQueryResult[])">
        <TextArea
          className="mono"
          rows={10}
          value={results}
          onChange={(e) => setResults(e.target.value)}
        />
      </Field>
      <Toggle checked={personal} onChange={setPersonal} label="is_personal" />
      <Field label="cache_time (s)">
        <TextInput value={cache} onChange={(e) => setCache(e.target.value)} />
      </Field>
      <Field label="Switch-to-PM button text">
        <TextInput value={buttonText} onChange={(e) => setButtonText(e.target.value)} />
      </Field>
      <Field label="start_parameter">
        <TextInput value={buttonParam} onChange={(e) => setButtonParam(e.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(results);
          } catch (e: any) {
            return notify(`Bad JSON: ${e.message}`, "err");
          }
          const res = await call(
            "answerInlineQuery",
            {
              inline_query_id: q.payload.id,
              results: parsed,
              is_personal: personal || undefined,
              cache_time: Number(cache) || 0,
              button: buttonText
                ? { text: buttonText, start_parameter: buttonParam || "start" }
                : undefined,
            },
            { queryLocalId: q.id }
          );
          if (res.ok) notify("Inline query answered");
        }}
      >
        answerInlineQuery
      </button>
    </>
  );
}

function ShippingAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [ok, setOk] = useState(true);
  const [error, setError] = useState("");
  const [options, setOptions] = useState(
    JSON.stringify([{ id: "std", title: "Standard", prices: [{ label: "Shipping", amount: 500 }] }], null, 2)
  );

  return (
    <>
      <Toggle checked={ok} onChange={setOk} label="Delivery possible (ok)" />
      {ok ? (
        <Field label="shipping_options">
          <TextArea className="mono" rows={7} value={options} onChange={(e) => setOptions(e.target.value)} />
        </Field>
      ) : (
        <Field label="error_message">
          <TextInput value={error} onChange={(e) => setError(e.target.value)} />
        </Field>
      )}
      <button
        className="btn sm primary"
        onClick={async () => {
          let shippingOptions: unknown;
          if (ok) {
            try {
              shippingOptions = JSON.parse(options);
            } catch (parseError) {
              return notify(
                parseError instanceof Error ? `Bad JSON: ${parseError.message}` : "Bad JSON",
                "err"
              );
            }
          }
          const res = await call(
            "answerShippingQuery",
            {
              shipping_query_id: q.payload.id,
              ok,
              shipping_options: ok ? shippingOptions : undefined,
              error_message: ok ? undefined : error,
            },
            { queryLocalId: q.id }
          );
          if (res.ok) notify("Shipping query answered");
        }}
      >
        answerShippingQuery
      </button>
    </>
  );
}

function PreCheckoutAnswer({ q }: { q: PendingQuery }) {
  const { call, notify } = useStore();
  const [ok, setOk] = useState(true);
  const [error, setError] = useState("");

  return (
    <>
      <Toggle checked={ok} onChange={setOk} label="Approve the order (ok)" />
      {!ok && (
        <Field label="error_message">
          <TextInput value={error} onChange={(e) => setError(e.target.value)} />
        </Field>
      )}
      <button
        className="btn sm primary"
        onClick={async () => {
          const res = await call(
            "answerPreCheckoutQuery",
            {
              pre_checkout_query_id: q.payload.id,
              ok,
              error_message: ok ? undefined : error,
            },
            { queryLocalId: q.id }
          );
          if (res.ok) notify("Pre-checkout answered");
        }}
      >
        answerPreCheckoutQuery
      </button>
    </>
  );
}
