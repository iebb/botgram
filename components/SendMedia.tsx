"use client";

import React, { useState } from "react";
import { Field, Modal, Select, TextArea, TextInput, Toggle } from "./UI";
import { useStore } from "./Store";
import type { TgAny } from "@/lib/types";

export type AttachKind =
  | "photo"
  | "live_photo"
  | "video"
  | "animation"
  | "audio"
  | "document"
  | "voice"
  | "video_note"
  | "sticker"
  | "media_group"
  | "paid_media"
  | "location"
  | "venue"
  | "contact"
  | "poll"
  | "dice"
  | "invoice"
  | "game"
  | "checklist";

const TITLES: Record<AttachKind, string> = {
  photo: "Send photo",
  live_photo: "Send live photo",
  video: "Send video",
  animation: "Send animation (GIF)",
  audio: "Send audio",
  document: "Send document",
  voice: "Send voice message",
  video_note: "Send video note",
  sticker: "Send sticker",
  media_group: "Send album (media group)",
  paid_media: "Send paid media",
  location: "Send location",
  venue: "Send venue",
  contact: "Send contact",
  poll: "Send poll",
  dice: "Send dice",
  invoice: "Send invoice",
  game: "Send game",
  checklist: "Send checklist",
};

const FILE_KINDS: AttachKind[] = [
  "photo",
  "video",
  "animation",
  "audio",
  "document",
  "voice",
  "video_note",
  "sticker",
];

const METHOD: Partial<Record<AttachKind, string>> = {
  photo: "sendPhoto",
  live_photo: "sendLivePhoto",
  video: "sendVideo",
  animation: "sendAnimation",
  audio: "sendAudio",
  document: "sendDocument",
  voice: "sendVoice",
  video_note: "sendVideoNote",
  sticker: "sendSticker",
  media_group: "sendMediaGroup",
  paid_media: "sendPaidMedia",
  location: "sendLocation",
  venue: "sendVenue",
  contact: "sendContact",
  poll: "sendPoll",
  dice: "sendDice",
  invoice: "sendInvoice",
  game: "sendGame",
  checklist: "sendChecklist",
};

export default function AttachModal({
  kind,
  base,
  onClose,
}: {
  kind: AttachKind;
  base: TgAny;
  onClose: () => void;
}) {
  const { call, upload, notify } = useStore();
  const [busy, setBusy] = useState(false);

  // shared media source state
  const [source, setSource] = useState<"upload" | "id" | "url">("upload");
  const [file, setFile] = useState<File | null>(null);
  const [liveVideo, setLiveVideo] = useState<File | null>(null);
  const [liveStill, setLiveStill] = useState<File | null>(null);
  const [liveVideoRef, setLiveVideoRef] = useState("");
  const [liveStillRef, setLiveStillRef] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [ref, setRef] = useState("");
  const [caption, setCaption] = useState("");
  const [parseMode, setParseMode] = useState("MarkdownV2");
  const [spoiler, setSpoiler] = useState(false);
  const [extra, setExtra] = useState<TgAny>(defaultsFor(kind));

  const setX = (patch: TgAny) => setExtra((e: TgAny) => ({ ...e, ...patch }));

  const send = async () => {
    setBusy(true);
    try {
      const method = METHOD[kind]!;
      let params: TgAny = { ...base };
      let uploads: Record<string, File> = {};

      if (!EPHEMERAL_KINDS.includes(kind)) {
        delete params.receiver_user_id;
        delete params.callback_query_id;
      }

      if (kind === "live_photo") {
        if (source === "upload") {
          if (!liveVideo || !liveStill) return notify("Pick both the short video and static photo", "err");
          uploads = { live_photo: liveVideo, photo: liveStill };
        } else {
          if (!liveVideoRef.trim() || !liveStillRef.trim()) {
            return notify("Enter both Telegram file_id values", "err");
          }
          params.live_photo = liveVideoRef.trim();
          params.photo = liveStillRef.trim();
        }
        if (caption) {
          params.caption = caption;
          if (parseMode !== "none") params.parse_mode = parseMode;
        }
        if (spoiler) params.has_spoiler = true;
      } else if (FILE_KINDS.includes(kind)) {
        const field = kind === "media_group" ? "" : kind;
        if (source === "upload") {
          if (!file) return notify("Pick a file first", "err");
          uploads[field] = file;
          params[field] = undefined; // multipart part carries it
        } else {
          params[field] = ref;
        }
        if (kind !== "sticker" && kind !== "voice" && kind !== "video_note") {
          if (caption) {
            params.caption = caption;
            if (parseMode !== "none") params.parse_mode = parseMode;
          }
        }
        if (["photo", "video", "animation"].includes(kind) && spoiler) {
          params.has_spoiler = true;
        }
        params = { ...params, ...clean(extra) };
      } else if (kind === "media_group") {
        if (files.length < 2) return notify("An album needs at least 2 items", "err");
        const media = files.map((f, i) => ({
          type: extra.groupType || "photo",
          media: `attach://f${i}`,
          caption: i === 0 && caption ? caption : undefined,
          parse_mode: i === 0 && caption && parseMode !== "none" ? parseMode : undefined,
          has_spoiler: spoiler || undefined,
        }));
        files.forEach((f, i) => (uploads[`f${i}`] = f));
        params.media = media;
      } else if (kind === "paid_media") {
        if (files.length === 0) return notify("Add at least one file", "err");
        params.star_count = Number(extra.star_count) || 1;
        params.media = files.map((f, i) => ({
          type: extra.groupType || "photo",
          media: `attach://f${i}`,
        }));
        files.forEach((f, i) => (uploads[`f${i}`] = f));
        if (caption) {
          params.caption = caption;
          if (parseMode !== "none") params.parse_mode = parseMode;
        }
      } else if (kind === "poll") {
        params.question = extra.question;
        params.options = String(extra.options || "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((text) => ({ text }));
        params.is_anonymous = extra.is_anonymous;
        params.type = extra.type;
        params.allows_multiple_answers = extra.type === "regular" ? extra.multi : undefined;
        params.correct_option_id =
          extra.type === "quiz" ? Number(extra.correct_option_id) || 0 : undefined;
        params.explanation = extra.type === "quiz" ? extra.explanation || undefined : undefined;
        params.explanation_parse_mode =
          extra.type === "quiz" && extra.explanation ? "MarkdownV2" : undefined;
        params.open_period = extra.open_period ? Number(extra.open_period) : undefined;
        params.is_closed = extra.is_closed || undefined;
      } else if (kind === "checklist") {
        params.checklist = {
          title: extra.title,
          tasks: String(extra.tasks || "")
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean)
            .map((text, i) => ({ id: i + 1, text })),
          others_can_add_tasks: extra.others_can_add_tasks || undefined,
          others_can_mark_tasks_as_done: extra.others_can_mark || undefined,
        };
      } else if (kind === "invoice") {
        params = {
          ...params,
          title: extra.title,
          description: extra.description,
          payload: extra.payload || `inv-${Date.now()}`,
          provider_token: extra.provider_token || undefined,
          currency: extra.currency,
          prices: String(extra.prices || "")
            .split("\n")
            .map((l) => l.split("|"))
            .filter((p) => p.length === 2)
            .map(([label, amount]) => ({ label: label.trim(), amount: Number(amount.trim()) })),
          photo_url: extra.photo_url || undefined,
          need_name: extra.need_name || undefined,
          need_email: extra.need_email || undefined,
          need_shipping_address: extra.need_shipping_address || undefined,
          is_flexible: extra.is_flexible || undefined,
          start_parameter: extra.start_parameter || undefined,
          max_tip_amount: extra.max_tip_amount ? Number(extra.max_tip_amount) : undefined,
        };
      } else {
        params = { ...params, ...clean(extra) };
      }

      const res = Object.keys(uploads).length
        ? await upload(method, params, uploads)
        : await call(method, params);

      if (res.ok) {
        notify(`${method} ok`);
        onClose();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={TITLES[kind]}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" onClick={send} disabled={busy}>
            {busy ? "Sending…" : "Send"}
          </button>
        </>
      }
    >
      {FILE_KINDS.includes(kind) && (
        <>
          <Field label="Source">
            <Select
              value={source}
              onChange={(e) => setSource(e.target.value as any)}
              options={[
                { value: "upload", label: "Upload from this computer" },
                { value: "id", label: "Existing file_id" },
                { value: "url", label: "Public HTTP URL" },
              ]}
            />
          </Field>
          {source === "upload" ? (
            <Field label="File">
              <input
                type="file"
                accept={acceptFor(kind)}
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="input"
              />
            </Field>
          ) : (
            <Field label={source === "id" ? "file_id" : "URL"}>
              <TextInput value={ref} onChange={(e) => setRef(e.target.value)} />
            </Field>
          )}
        </>
      )}

      {kind === "live_photo" && (
        <>
          <Field label="Source">
            <Select
              value={source === "url" ? "upload" : source}
              onChange={(event) => setSource(event.target.value as "upload" | "id")}
              options={[
                { value: "upload", label: "Upload both files" },
                { value: "id", label: "Existing Telegram file_id values" },
              ]}
            />
          </Field>
          {source === "id" ? (
            <>
              <Field label="Live-photo video file_id">
                <TextInput value={liveVideoRef} onChange={(event) => setLiveVideoRef(event.target.value)} />
              </Field>
              <Field label="Static photo file_id">
                <TextInput value={liveStillRef} onChange={(event) => setLiveStillRef(event.target.value)} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Short video" hint="Up to 10 seconds and 10 MB.">
                <input type="file" accept="video/*" className="input" onChange={(event) => setLiveVideo(event.target.files?.[0] || null)} />
              </Field>
              <Field label="Static photo">
                <input type="file" accept="image/*" className="input" onChange={(event) => setLiveStill(event.target.files?.[0] || null)} />
              </Field>
            </>
          )}
        </>
      )}

      {(kind === "media_group" || kind === "paid_media") && (
        <>
          <Field label="Item type">
            <Select
              value={extra.groupType || "photo"}
              onChange={(e) => setX({ groupType: e.target.value })}
              options={["photo", "video", "audio", "document"]}
            />
          </Field>
          <Field label="Files (2–10)" hint="All items in an album must be the same type.">
            <input
              type="file"
              multiple
              className="input"
              onChange={(e) => setFiles(Array.from(e.target.files || []))}
            />
          </Field>
          {kind === "paid_media" && (
            <Field label="Star price">
              <TextInput
                type="number"
                value={extra.star_count || 1}
                onChange={(e) => setX({ star_count: e.target.value })}
              />
            </Field>
          )}
        </>
      )}

      {/* -------------------------------------------------- per-kind extras */}
      <KindFields kind={kind} extra={extra} setX={setX} />

      {captionable(kind) && (
        <>
          <Field label="Caption">
            <TextArea value={caption} onChange={(e) => setCaption(e.target.value)} rows={3} />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
            <Field label="Caption parse mode">
              <Select
                value={parseMode}
                onChange={(e) => setParseMode(e.target.value)}
                options={["MarkdownV2", "HTML", "Markdown", "none"]}
              />
            </Field>
            {["photo", "live_photo", "video", "animation", "media_group"].includes(kind) && (
              <div style={{ alignSelf: "end", paddingBottom: "0.625rem" }}>
                <Toggle checked={spoiler} onChange={setSpoiler} label="Hide with spoiler" />
              </div>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

/* ---------------------------------------------------------- per-kind UI */

function KindFields({
  kind,
  extra,
  setX,
}: {
  kind: AttachKind;
  extra: TgAny;
  setX: (p: TgAny) => void;
}) {
  switch (kind) {
    case "video":
      return (
        <Row>
          <Field label="Duration (s)">
            <TextInput type="number" value={extra.duration || ""} onChange={(e) => setX({ duration: e.target.value })} />
          </Field>
          <Field label="Width">
            <TextInput type="number" value={extra.width || ""} onChange={(e) => setX({ width: e.target.value })} />
          </Field>
          <Field label="Height">
            <TextInput type="number" value={extra.height || ""} onChange={(e) => setX({ height: e.target.value })} />
          </Field>
          <div style={{ gridColumn: "1 / -1" }}>
            <Toggle
              checked={!!extra.supports_streaming}
              onChange={(v) => setX({ supports_streaming: v })}
              label="Supports streaming"
            />
          </div>
        </Row>
      );

    case "audio":
      return (
        <Row>
          <Field label="Performer">
            <TextInput value={extra.performer || ""} onChange={(e) => setX({ performer: e.target.value })} />
          </Field>
          <Field label="Title">
            <TextInput value={extra.title || ""} onChange={(e) => setX({ title: e.target.value })} />
          </Field>
          <Field label="Duration (s)">
            <TextInput type="number" value={extra.duration || ""} onChange={(e) => setX({ duration: e.target.value })} />
          </Field>
        </Row>
      );

    case "voice":
      return (
        <Field label="Duration (s)">
          <TextInput type="number" value={extra.duration || ""} onChange={(e) => setX({ duration: e.target.value })} />
        </Field>
      );

    case "video_note":
      return (
        <Row>
          <Field label="Length (px)">
            <TextInput type="number" value={extra.length || ""} onChange={(e) => setX({ length: e.target.value })} />
          </Field>
          <Field label="Duration (s)">
            <TextInput type="number" value={extra.duration || ""} onChange={(e) => setX({ duration: e.target.value })} />
          </Field>
        </Row>
      );

    case "sticker":
      return (
        <Field label="Emoji" hint="Only for newly uploaded .webp/.tgs stickers.">
          <TextInput value={extra.emoji || ""} onChange={(e) => setX({ emoji: e.target.value })} />
        </Field>
      );

    case "document":
      return (
        <Toggle
          checked={!!extra.disable_content_type_detection}
          onChange={(v) => setX({ disable_content_type_detection: v })}
          label="Disable content type detection"
        />
      );

    case "location":
      return (
        <>
          <Row>
            <Field label="Latitude">
              <TextInput value={extra.latitude ?? ""} onChange={(e) => setX({ latitude: e.target.value })} />
            </Field>
            <Field label="Longitude">
              <TextInput value={extra.longitude ?? ""} onChange={(e) => setX({ longitude: e.target.value })} />
            </Field>
          </Row>
          <Row>
            <Field label="Live period (s)" hint="60–86400, or 0x7FFFFFFF for indefinite">
              <TextInput value={extra.live_period ?? ""} onChange={(e) => setX({ live_period: e.target.value })} />
            </Field>
            <Field label="Heading (1–360)">
              <TextInput value={extra.heading ?? ""} onChange={(e) => setX({ heading: e.target.value })} />
            </Field>
            <Field label="Proximity radius (m)">
              <TextInput
                value={extra.proximity_alert_radius ?? ""}
                onChange={(e) => setX({ proximity_alert_radius: e.target.value })}
              />
            </Field>
          </Row>
          <button
            className="btn sm ghost"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition((p) =>
                setX({ latitude: p.coords.latitude, longitude: p.coords.longitude })
              )
            }
          >
            Use my location
          </button>
        </>
      );

    case "venue":
      return (
        <>
          <Row>
            <Field label="Latitude">
              <TextInput value={extra.latitude ?? ""} onChange={(e) => setX({ latitude: e.target.value })} />
            </Field>
            <Field label="Longitude">
              <TextInput value={extra.longitude ?? ""} onChange={(e) => setX({ longitude: e.target.value })} />
            </Field>
          </Row>
          <Field label="Title">
            <TextInput value={extra.title || ""} onChange={(e) => setX({ title: e.target.value })} />
          </Field>
          <Field label="Address">
            <TextInput value={extra.address || ""} onChange={(e) => setX({ address: e.target.value })} />
          </Field>
          <Row>
            <Field label="Foursquare ID">
              <TextInput value={extra.foursquare_id || ""} onChange={(e) => setX({ foursquare_id: e.target.value })} />
            </Field>
            <Field label="Google Place ID">
              <TextInput
                value={extra.google_place_id || ""}
                onChange={(e) => setX({ google_place_id: e.target.value })}
              />
            </Field>
          </Row>
        </>
      );

    case "contact":
      return (
        <>
          <Row>
            <Field label="Phone number">
              <TextInput value={extra.phone_number || ""} onChange={(e) => setX({ phone_number: e.target.value })} />
            </Field>
            <Field label="First name">
              <TextInput value={extra.first_name || ""} onChange={(e) => setX({ first_name: e.target.value })} />
            </Field>
            <Field label="Last name">
              <TextInput value={extra.last_name || ""} onChange={(e) => setX({ last_name: e.target.value })} />
            </Field>
          </Row>
          <Field label="vCard" hint="Optional, 0–2048 bytes">
            <TextArea value={extra.vcard || ""} onChange={(e) => setX({ vcard: e.target.value })} rows={2} />
          </Field>
        </>
      );

    case "poll":
      return (
        <>
          <Field label="Question">
            <TextInput value={extra.question || ""} onChange={(e) => setX({ question: e.target.value })} />
          </Field>
          <Field label="Options (one per line, 2–12)">
            <TextArea value={extra.options || ""} onChange={(e) => setX({ options: e.target.value })} rows={4} />
          </Field>
          <Row>
            <Field label="Type">
              <Select
                value={extra.type || "regular"}
                onChange={(e) => setX({ type: e.target.value })}
                options={["regular", "quiz"]}
              />
            </Field>
            <Field label="Open period (s)">
              <TextInput value={extra.open_period || ""} onChange={(e) => setX({ open_period: e.target.value })} />
            </Field>
            {extra.type === "quiz" && (
              <Field label="Correct option (0-based)">
                <TextInput
                  type="number"
                  value={extra.correct_option_id ?? 0}
                  onChange={(e) => setX({ correct_option_id: e.target.value })}
                />
              </Field>
            )}
          </Row>
          {extra.type === "quiz" && (
            <Field label="Explanation">
              <TextArea
                value={extra.explanation || ""}
                onChange={(e) => setX({ explanation: e.target.value })}
                rows={2}
              />
            </Field>
          )}
          <Toggle
            checked={extra.is_anonymous !== false}
            onChange={(v) => setX({ is_anonymous: v })}
            label="Anonymous"
          />
          {extra.type !== "quiz" && (
            <Toggle checked={!!extra.multi} onChange={(v) => setX({ multi: v })} label="Multiple answers" />
          )}
          <Toggle checked={!!extra.is_closed} onChange={(v) => setX({ is_closed: v })} label="Send already closed" />
        </>
      );

    case "dice":
      return (
        <Field label="Emoji" hint="🎲 1-6 · 🎯 1-6 · 🏀 1-5 · ⚽️ 1-5 · 🎳 1-6 · 🎰 1-64">
          <Select
            value={extra.emoji || "🎲"}
            onChange={(e) => setX({ emoji: e.target.value })}
            options={["🎲", "🎯", "🏀", "⚽️", "🎳", "🎰"]}
          />
        </Field>
      );

    case "game":
      return (
        <Field label="game_short_name" hint="Register games with @BotFather first.">
          <TextInput
            value={extra.game_short_name || ""}
            onChange={(e) => setX({ game_short_name: e.target.value })}
          />
        </Field>
      );

    case "checklist":
      return (
        <>
          <Field label="Title">
            <TextInput value={extra.title || ""} onChange={(e) => setX({ title: e.target.value })} />
          </Field>
          <Field label="Tasks (one per line)">
            <TextArea value={extra.tasks || ""} onChange={(e) => setX({ tasks: e.target.value })} rows={4} />
          </Field>
          <Toggle
            checked={!!extra.others_can_add_tasks}
            onChange={(v) => setX({ others_can_add_tasks: v })}
            label="Others can add tasks"
          />
          <Toggle
            checked={!!extra.others_can_mark}
            onChange={(v) => setX({ others_can_mark: v })}
            label="Others can mark as done"
          />
        </>
      );

    case "invoice":
      return (
        <>
          <Field label="Title">
            <TextInput value={extra.title || ""} onChange={(e) => setX({ title: e.target.value })} />
          </Field>
          <Field label="Description">
            <TextArea value={extra.description || ""} onChange={(e) => setX({ description: e.target.value })} rows={2} />
          </Field>
          <Row>
            <Field label="Currency" hint="XTR = Telegram Stars">
              <TextInput value={extra.currency || "XTR"} onChange={(e) => setX({ currency: e.target.value })} />
            </Field>
            <Field label="Provider token" hint="Leave empty for Stars (XTR)">
              <TextInput
                value={extra.provider_token || ""}
                onChange={(e) => setX({ provider_token: e.target.value })}
              />
            </Field>
          </Row>
          <Field label="Prices" hint="One per line: Label | amount-in-smallest-units">
            <TextArea
              value={extra.prices || ""}
              onChange={(e) => setX({ prices: e.target.value })}
              rows={3}
              placeholder={"Item|100\nShipping|50"}
            />
          </Field>
          <Field label="Payload">
            <TextInput value={extra.payload || ""} onChange={(e) => setX({ payload: e.target.value })} />
          </Field>
          <Field label="Photo URL">
            <TextInput value={extra.photo_url || ""} onChange={(e) => setX({ photo_url: e.target.value })} />
          </Field>
          <Toggle checked={!!extra.need_name} onChange={(v) => setX({ need_name: v })} label="Need name" />
          <Toggle checked={!!extra.need_email} onChange={(v) => setX({ need_email: v })} label="Need email" />
          <Toggle
            checked={!!extra.need_shipping_address}
            onChange={(v) => setX({ need_shipping_address: v })}
            label="Need shipping address"
          />
          <Toggle checked={!!extra.is_flexible} onChange={(v) => setX({ is_flexible: v })} label="Flexible price" />
        </>
      );

    default:
      return null;
  }
}

function Row({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(8rem, 1fr))",
        gap: "0.5rem",
      }}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------- helpers */

function defaultsFor(kind: AttachKind): TgAny {
  switch (kind) {
    case "poll":
      return { type: "regular", is_anonymous: true, options: "Yes\nNo" };
    case "dice":
      return { emoji: "🎲" };
    case "invoice":
      return { currency: "XTR", prices: "Item|100" };
    case "location":
    case "venue":
      return { latitude: 51.5074, longitude: -0.1278 };
    case "media_group":
    case "paid_media":
      return { groupType: "photo", star_count: 1 };
    default:
      return {};
  }
}

function captionable(kind: AttachKind) {
  return [
    "photo",
    "live_photo",
    "video",
    "animation",
    "audio",
    "document",
    "voice",
    "media_group",
    "paid_media",
  ].includes(kind);
}

const EPHEMERAL_KINDS: AttachKind[] = [
  "photo",
  "live_photo",
  "video",
  "animation",
  "audio",
  "document",
  "voice",
  "video_note",
  "sticker",
  "location",
  "venue",
  "contact",
];

function acceptFor(kind: AttachKind) {
  switch (kind) {
    case "photo":
      return "image/*";
    case "video":
    case "video_note":
      return "video/*";
    case "animation":
      return "video/mp4,image/gif";
    case "audio":
    case "voice":
      return "audio/*";
    case "sticker":
      return ".webp,.tgs,.webm";
    default:
      return undefined;
  }
}

function clean(o: TgAny): TgAny {
  const out: TgAny = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === "" || v === undefined || v === null) continue;
    if (k === "groupType" || k === "multi" || k === "tasks") continue;
    out[k] = v;
  }
  return out;
}
