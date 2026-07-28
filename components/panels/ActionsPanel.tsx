"use client";

import React, { useState } from "react";
import { useStore } from "../Store";
import { Collapsible, Field, Json, Select, TextArea, TextInput, Toggle } from "../UI";
import { chatName } from "@/lib/format";
import type { TgAny } from "@/lib/types";

const CHAT_ACTIONS = [
  "typing",
  "upload_photo",
  "record_video",
  "upload_video",
  "record_voice",
  "upload_voice",
  "upload_document",
  "choose_sticker",
  "find_location",
  "record_video_note",
  "upload_video_note",
];

export default function ActionsPanel() {
  const { selectedChatId, chat, call, notify, state } = useStore();
  const [result, setResult] = useState<unknown>(null);

  if (!selectedChatId || !chat) {
    return (
      <div className="muted" style={{ padding: "1.5rem", textAlign: "center" }}>
        Select a chat to use the bot tools.
      </div>
    );
  }
  const chat_id = Number(selectedChatId);

  const run = async (method: string, params: TgAny, okMsg?: string) => {
    const res = await call(method, params);
    setResult(res.ok ? res.result : res);
    if (res.ok && okMsg) notify(okMsg);
  };

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <div className="section">
        <div className="section-title">Chat actions</div>
        <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0 }}>
          Shows the “bot is typing…” style status for ~5 seconds.
        </p>
        <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
          {CHAT_ACTIONS.map((a) => (
            <button
              key={a}
              className="btn sm"
              onClick={() => run("sendChatAction", { chat_id, action: a }, `“${a}” sent`)}
            >
              {a}
            </button>
          ))}
        </div>
      </div>

      <BulkMessages chat_id={chat_id} run={run} />
      <LiveLocation chat_id={chat_id} run={run} />
      <Broadcast />
      <PreparedInline />

      {result != null && (
        <div className="section" style={{ borderBottom: "none" }}>
          <div className="section-title">Last result</div>
          <Json value={result} />
        </div>
      )}
    </div>
  );
}

type Run = (method: string, params: TgAny, okMsg?: string) => Promise<void>;

function BulkMessages({ chat_id, run }: { chat_id: number; run: Run }) {
  const { state } = useStore();
  const [ids, setIds] = useState("");
  const [target, setTarget] = useState("");

  const parsed = ids
    .split(/[,\s]+/)
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  return (
    <Collapsible title="Bulk message operations" defaultOpen>
      <Field label="message_ids" hint="Comma or space separated. Max 100.">
        <TextInput value={ids} onChange={(e) => setIds(e.target.value)} placeholder="12, 13, 14" />
      </Field>
      <div className="muted" style={{ fontSize: "0.6875rem", marginBottom: "0.5rem" }}>
        {parsed.length} id{parsed.length === 1 ? "" : "s"} parsed
      </div>

      <Field label="Target chat (for forward/copy)">
        <Select
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          options={[
            { value: "", label: "— pick a chat —" },
            ...state.chats.map((c) => ({
              value: String(c.chat.id),
              label: `${chatName(c.chat)} (${c.chat.id})`,
            })),
          ]}
        />
      </Field>

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "forwardMessages",
              { chat_id: Number(target), from_chat_id: chat_id, message_ids: parsed },
              "Forwarded"
            )
          }
        >
          forwardMessages
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "copyMessages",
              { chat_id: Number(target), from_chat_id: chat_id, message_ids: parsed },
              "Copied"
            )
          }
        >
          copyMessages
        </button>
        <button
          className="btn sm danger"
          onClick={() => run("deleteMessages", { chat_id, message_ids: parsed }, "Deleted")}
        >
          deleteMessages
        </button>
        <button
          className="btn sm"
          onClick={() => run("unpinAllChatMessages", { chat_id }, "All unpinned")}
        >
          unpinAllChatMessages
        </button>
      </div>
    </Collapsible>
  );
}

function LiveLocation({ chat_id, run }: { chat_id: number; run: Run }) {
  const [messageId, setMessageId] = useState("");
  const [lat, setLat] = useState("51.5074");
  const [lon, setLon] = useState("-0.1278");
  const [heading, setHeading] = useState("");

  return (
    <Collapsible title="Live location">
      <Field label="message_id of the live location">
        <TextInput value={messageId} onChange={(e) => setMessageId(e.target.value)} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Latitude">
          <TextInput value={lat} onChange={(e) => setLat(e.target.value)} />
        </Field>
        <Field label="Longitude">
          <TextInput value={lon} onChange={(e) => setLon(e.target.value)} />
        </Field>
      </div>
      <Field label="Heading (1–360)">
        <TextInput value={heading} onChange={(e) => setHeading(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "editMessageLiveLocation",
              {
                chat_id,
                message_id: Number(messageId),
                latitude: Number(lat),
                longitude: Number(lon),
                heading: heading ? Number(heading) : undefined,
              },
              "Location moved"
            )
          }
        >
          Move
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run("stopMessageLiveLocation", { chat_id, message_id: Number(messageId) }, "Stopped")
          }
        >
          Stop sharing
        </button>
        <button
          className="btn sm ghost"
          onClick={() =>
            navigator.geolocation?.getCurrentPosition((p) => {
              setLat(String(p.coords.latitude));
              setLon(String(p.coords.longitude));
            })
          }
        >
          Use my location
        </button>
      </div>
    </Collapsible>
  );
}

function Broadcast() {
  const { state, call, notify } = useStore();
  const [text, setText] = useState("");
  const [parseMode, setParseMode] = useState("MarkdownV2");
  const [silent, setSilent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string[]>([]);

  const go = async () => {
    if (!text.trim()) return notify("Nothing to send", "err");
    setBusy(true);
    setReport([]);
    const lines: string[] = [];
    for (const c of state.chats) {
      const res = await call("sendMessage", {
        chat_id: c.chat.id,
        text,
        parse_mode: parseMode === "none" ? undefined : parseMode,
        disable_notification: silent || undefined,
      });
      lines.push(`${res.ok ? "✓" : "✗"} ${chatName(c.chat)}${res.ok ? "" : ` — ${res.description}`}`);
      setReport([...lines]);
      // Telegram tolerates roughly 30 messages/second; stay well under it.
      await new Promise((r) => setTimeout(r, 120));
    }
    setBusy(false);
    notify(`Broadcast finished — ${lines.filter((l) => l.startsWith("✓")).length}/${lines.length} delivered`);
  };

  return (
    <Collapsible title={`Broadcast to all ${state.chats.length} chats`}>
      <Field label="Message">
        <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
      </Field>
      <Field label="parse_mode">
        <Select
          value={parseMode}
          onChange={(e) => setParseMode(e.target.value)}
          options={["MarkdownV2", "HTML", "Markdown", "none"]}
        />
      </Field>
      <Toggle checked={silent} onChange={setSilent} label="Silent" />
      <button className="btn sm primary" onClick={go} disabled={busy} style={{ marginTop: "0.375rem" }}>
        {busy ? "Sending…" : "Send to everyone"}
      </button>
      {report.length > 0 && (
        <div className="json-view" style={{ marginTop: "0.5rem" }}>
          {report.join("\n")}
        </div>
      )}
    </Collapsible>
  );
}

function PreparedInline() {
  const { call, notify } = useStore();
  const [userId, setUserId] = useState("");
  const [json, setJson] = useState(
    JSON.stringify(
      {
        type: "article",
        id: "1",
        title: "Prepared message",
        input_message_content: { message_text: "Sent from a prepared inline message" },
      },
      null,
      2
    )
  );
  const [result, setResult] = useState<unknown>(null);

  return (
    <Collapsible title="Prepared inline message">
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0, lineHeight: 1.5 }}>
        Creates a message a Mini App can hand to the user to forward anywhere — one of the few ways
        a bot reaches a chat it isn&apos;t in.
      </p>
      <Field label="user_id">
        <TextInput value={userId} onChange={(e) => setUserId(e.target.value)} />
      </Field>
      <Field label="result (InlineQueryResult)">
        <TextArea className="mono" rows={8} value={json} onChange={(e) => setJson(e.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={async () => {
          let parsed: unknown;
          try {
            parsed = JSON.parse(json);
          } catch (e: any) {
            return notify(`Bad JSON: ${e.message}`, "err");
          }
          const res = await call("savePreparedInlineMessage", {
            user_id: Number(userId),
            result: parsed,
            allow_user_chats: true,
            allow_group_chats: true,
            allow_channel_chats: true,
            allow_bot_chats: true,
          });
          setResult(res.ok ? res.result : res);
          if (res.ok) notify("Prepared message saved");
        }}
      >
        savePreparedInlineMessage
      </button>
      {result != null && <Json value={result} />}
    </Collapsible>
  );
}
