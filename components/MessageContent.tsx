"use client";

import React, { useState } from "react";
import type { StoredMessage, TgAny } from "@/lib/types";
import {
  bestPhoto,
  bytesLabel,
  durationLabel,
  fileSrc,
  formatAmount,
  renderEntities,
} from "@/lib/format";
import {
  IconContact,
  IconDownload,
  IconLocation,
  IconMoney,
  IconPlay,
  IconStar,
} from "./Icons";
import RichMessageContent from "./RichMessageContent";

const MEDIA_RADIUS = "0.5rem";

export function MessageContent({ m, out }: { m: StoredMessage; out: boolean }) {
  const caption = m.caption ? (
    <div style={{ marginTop: m.sticker || m.dice ? 0 : "0.25rem" }}>
      {renderEntities(m.caption, m.caption_entities)}
    </div>
  ) : null;

  if (m.rich_message) return <RichMessageContent rich={m.rich_message} />;
  if (m.live_photo) return <LivePhoto m={m} />;
  if (m.photo) return <>{<Photo m={m} />}{caption}</>;
  if (m.video) return <>{<Video m={m} />}{caption}</>;
  if (m.animation) return <>{<Animation m={m} />}{caption}</>;
  if (m.video_note) return <VideoNote m={m} />;
  if (m.voice) return <>{<Voice m={m} out={out} />}{caption}</>;
  if (m.audio) return <>{<Audio m={m} />}{caption}</>;
  if (m.sticker) return <Sticker m={m} />;
  if (m.document) return <>{<Document m={m} out={out} />}{caption}</>;
  if (m.paid_media) return <>{<PaidMedia m={m} />}{caption}</>;
  if (m.contact) return <Contact m={m} />;
  if (m.venue) return <Venue m={m} />;
  if (m.location) return <Location m={m} />;
  if (m.poll) return <Poll m={m} />;
  if (m.dice) return <Dice m={m} />;
  if (m.game) return <Game m={m} />;
  if (m.invoice) return <Invoice m={m} />;
  if (m.giveaway || m.giveaway_winners) return <Giveaway m={m} />;
  if (m.checklist) return <Checklist m={m} />;
  if (m.story) return <Simple label="📖 Story" sub="Forwarded story" />;

  if (m.text) return <>{renderEntities(m.text, m.entities)}</>;
  return caption || <span className="muted">Unsupported content</span>;
}

function LivePhoto({ m }: { m: StoredMessage }) {
  const live = m.live_photo as TgAny;
  return (
    <video
      src={fileSrc(live.file_id || live.video?.file_id)}
      poster={live.thumbnail?.file_id ? fileSrc(live.thumbnail.file_id) : undefined}
      controls
      loop
      playsInline
      className="rich-media"
    />
  );
}

/* ---------------------------------------------------------------- photo */

function Photo({ m }: { m: StoredMessage }) {
  const size = bestPhoto(m.photo);
  const spoiler = m.has_media_spoiler;
  const [revealed, setRevealed] = useState(!spoiler);
  if (!size) return null;
  const ratio = size.width && size.height ? size.width / size.height : 1.4;

  return (
    <div
      style={{
        borderRadius: MEDIA_RADIUS,
        overflow: "hidden",
        maxWidth: "20rem",
        aspectRatio: String(ratio),
        background: "rgba(127,127,127,0.2)",
        cursor: spoiler && !revealed ? "pointer" : "default",
        position: "relative",
      }}
      onClick={() => setRevealed(true)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={fileSrc(size.file_id)}
        alt="photo"
        loading="lazy"
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          display: "block",
          filter: revealed ? "none" : "blur(1.5rem)",
          transition: "filter 0.3s",
        }}
      />
      {!revealed && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: "0.75rem",
            fontWeight: 600,
            textShadow: "0 1px 3px rgba(0,0,0,.6)",
          }}
        >
          TAP TO REVEAL
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- video */

function Video({ m }: { m: StoredMessage }) {
  const v = m.video as TgAny;
  return (
    <div style={{ borderRadius: MEDIA_RADIUS, overflow: "hidden", maxWidth: "20rem" }}>
      <video
        src={fileSrc(v.file_id)}
        poster={v.thumbnail ? fileSrc(v.thumbnail.file_id) : undefined}
        controls
        preload="metadata"
        style={{ width: "100%", display: "block", borderRadius: MEDIA_RADIUS }}
      />
      <div className="muted" style={{ fontSize: "0.6875rem", marginTop: "0.125rem" }}>
        {durationLabel(v.duration)} · {bytesLabel(v.file_size)}
        {v.has_spoiler ? " · spoiler" : ""}
      </div>
    </div>
  );
}

function Animation({ m }: { m: StoredMessage }) {
  const a = m.animation as TgAny;
  return (
    <div style={{ borderRadius: MEDIA_RADIUS, overflow: "hidden", maxWidth: "20rem", position: "relative" }}>
      <video
        src={fileSrc(a.file_id)}
        poster={a.thumbnail ? fileSrc(a.thumbnail.file_id) : undefined}
        autoPlay
        loop
        muted
        playsInline
        style={{ width: "100%", display: "block" }}
      />
      <span
        style={{
          position: "absolute",
          left: "0.375rem",
          top: "0.375rem",
          background: "rgba(0,0,0,.45)",
          color: "#fff",
          fontSize: "0.625rem",
          fontWeight: 600,
          padding: "0.0625rem 0.3125rem",
          borderRadius: "0.5rem",
        }}
      >
        GIF
      </span>
    </div>
  );
}

function VideoNote({ m }: { m: StoredMessage }) {
  const v = m.video_note as TgAny;
  return (
    <div style={{ width: "12.5rem", height: "12.5rem", borderRadius: "50%", overflow: "hidden" }}>
      <video
        src={fileSrc(v.file_id)}
        poster={v.thumbnail ? fileSrc(v.thumbnail.file_id) : undefined}
        controls
        style={{ width: "100%", height: "100%", objectFit: "cover" }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- audio */

function Voice({ m, out }: { m: StoredMessage; out: boolean }) {
  const v = m.voice as TgAny;
  // Fake but stable waveform: Telegram doesn't hand bots the real one.
  const bars = React.useMemo(
    () =>
      Array.from({ length: 40 }, (_, i) => {
        const seed = (v.file_unique_id || "x").charCodeAt(i % (v.file_unique_id?.length || 1)) || 60;
        return 0.25 + (((seed * (i + 7)) % 100) / 100) * 0.75;
      }),
    [v.file_unique_id]
  );

  return (
    <div style={{ minWidth: "15rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.125rem", height: "1.75rem" }}>
        {bars.map((h, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${h * 100}%`,
              background: out ? "rgba(255,255,255,.55)" : "var(--accent)",
              opacity: out ? 1 : 0.55,
              borderRadius: "0.0625rem",
            }}
          />
        ))}
      </div>
      <audio src={fileSrc(v.file_id)} controls style={{ width: "100%", height: "2rem", marginTop: "0.25rem" }} />
      <div className="muted" style={{ fontSize: "0.6875rem" }}>
        {durationLabel(v.duration)} · voice
      </div>
    </div>
  );
}

function Audio({ m }: { m: StoredMessage }) {
  const a = m.audio as TgAny;
  return (
    <div style={{ minWidth: "16rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <div
          style={{
            width: "2.75rem",
            height: "2.75rem",
            borderRadius: "50%",
            background: "var(--accent)",
            color: "#fff",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <IconPlay size={18} />
        </div>
        <div style={{ minWidth: 0 }}>
          <div className="truncate-1" style={{ fontWeight: 500 }}>
            {a.title || a.file_name || "Audio"}
          </div>
          <div className="truncate-1 muted" style={{ fontSize: "0.75rem" }}>
            {a.performer || "Unknown artist"} · {durationLabel(a.duration)}
          </div>
        </div>
      </div>
      <audio src={fileSrc(a.file_id)} controls style={{ width: "100%", height: "2rem", marginTop: "0.375rem" }} />
    </div>
  );
}

/* -------------------------------------------------------------- sticker */

function Sticker({ m }: { m: StoredMessage }) {
  const s = m.sticker as TgAny;
  const animated = s.is_animated || s.is_video;
  // .tgs/.webm stickers can't be drawn by the browser; fall back to the thumb.
  const src = animated
    ? s.thumbnail
      ? fileSrc(s.thumbnail.file_id)
      : ""
    : fileSrc(s.file_id);

  return (
    <div style={{ position: "relative", width: "8.75rem", height: "8.75rem" }}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={s.emoji || "sticker"}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      ) : (
        <div style={{ fontSize: "4.5rem", textAlign: "center" }}>{s.emoji || "🙂"}</div>
      )}
      {animated && (
        <span
          className="chip"
          style={{ position: "absolute", bottom: 0, left: 0, fontSize: "0.5625rem" }}
        >
          {s.is_video ? "VIDEO" : "ANIMATED"}
        </span>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- document */

function Document({ m, out }: { m: StoredMessage; out: boolean }) {
  const d = m.document as TgAny;
  return (
    <a
      href={fileSrc(d.file_id)}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.625rem",
        minWidth: "13rem",
        color: "inherit",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          width: "2.75rem",
          height: "2.75rem",
          borderRadius: "50%",
          background: out ? "rgba(255,255,255,.25)" : "var(--accent)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <IconDownload size={20} />
      </div>
      <div style={{ minWidth: 0 }}>
        <div className="truncate-1" style={{ fontWeight: 500 }}>
          {d.file_name || "File"}
        </div>
        <div className="truncate-1" style={{ fontSize: "0.75rem", opacity: 0.7 }}>
          {bytesLabel(d.file_size)} · {d.mime_type || "file"}
        </div>
      </div>
    </a>
  );
}

function PaidMedia({ m }: { m: StoredMessage }) {
  const p = m.paid_media as TgAny;
  return (
    <div
      style={{
        minWidth: "14rem",
        padding: "0.75rem",
        borderRadius: MEDIA_RADIUS,
        background: "rgba(127,127,127,.15)",
        textAlign: "center",
      }}
    >
      <IconStar size={28} style={{ color: "#f0b537" }} />
      <div style={{ fontWeight: 600, marginTop: "0.25rem" }}>{p.star_count} Stars</div>
      <div className="muted" style={{ fontSize: "0.75rem" }}>
        {p.paid_media?.length || 0} paid item(s)
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- contact */

function Contact({ m }: { m: StoredMessage }) {
  const c = m.contact as TgAny;
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return (
    <div style={{ display: "flex", gap: "0.625rem", alignItems: "center", minWidth: "13rem" }}>
      <div
        style={{
          width: "2.75rem",
          height: "2.75rem",
          borderRadius: "50%",
          background: "var(--accent)",
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <IconContact size={22} />
      </div>
      <div>
        <div style={{ fontWeight: 500 }}>{name}</div>
        <div style={{ fontSize: "0.8125rem", opacity: 0.8 }}>{c.phone_number}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- location */

function MapTile({ lat, lon, live }: { lat: number; lon: number; live?: boolean }) {
  return (
    <a
      href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=15/${lat}/${lon}`}
      target="_blank"
      rel="noreferrer"
      style={{
        display: "block",
        position: "relative",
        width: "16rem",
        height: "9rem",
        borderRadius: MEDIA_RADIUS,
        overflow: "hidden",
        background:
          "repeating-linear-gradient(0deg,#cfe0c8,#cfe0c8 1px,transparent 1px,transparent 1.75rem)," +
          "repeating-linear-gradient(90deg,#cfe0c8,#cfe0c8 1px,transparent 1px,transparent 1.75rem)," +
          "linear-gradient(160deg,#e8f0e2,#d7e6f0)",
        textDecoration: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "50%",
          transform: "translate(-50%,-100%)",
          color: "#e5484d",
        }}
      >
        <IconLocation size={32} />
      </div>
      {live && (
        <span
          className="chip"
          style={{ position: "absolute", left: "0.375rem", top: "0.375rem", background: "#e5484d", color: "#fff" }}
        >
          LIVE
        </span>
      )}
      <span
        style={{
          position: "absolute",
          bottom: "0.25rem",
          right: "0.375rem",
          fontSize: "0.625rem",
          color: "#33404d",
          background: "rgba(255,255,255,.7)",
          padding: "0 0.25rem",
          borderRadius: "0.25rem",
        }}
      >
        {lat.toFixed(5)}, {lon.toFixed(5)}
      </span>
    </a>
  );
}

function Location({ m }: { m: StoredMessage }) {
  const l = m.location as TgAny;
  return <MapTile lat={l.latitude} lon={l.longitude} live={!!l.live_period} />;
}

function Venue({ m }: { m: StoredMessage }) {
  const v = m.venue as TgAny;
  return (
    <div>
      <MapTile lat={v.location.latitude} lon={v.location.longitude} />
      <div style={{ marginTop: "0.25rem", fontWeight: 500 }}>{v.title}</div>
      <div className="muted" style={{ fontSize: "0.8125rem" }}>
        {v.address}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- poll */

function Poll({ m }: { m: StoredMessage }) {
  const p = m.poll as TgAny;
  const total = p.total_voter_count || 0;
  return (
    <div style={{ minWidth: "15rem" }}>
      <div style={{ fontWeight: 500, marginBottom: "0.125rem" }}>
        {renderEntities(p.question, p.question_entities)}
      </div>
      <div className="muted" style={{ fontSize: "0.75rem", marginBottom: "0.375rem" }}>
        {p.type === "quiz" ? "Quiz" : p.is_anonymous ? "Anonymous poll" : "Poll"}
        {p.is_closed ? " · closed" : ""}
        {p.allows_multiple_answers ? " · multiple answers" : ""}
      </div>
      {(p.options || []).map((o: TgAny, i: number) => {
        const pct = total ? Math.round(((o.voter_count || 0) / total) * 100) : 0;
        const correct = p.type === "quiz" && p.correct_option_id === i;
        return (
          <div key={i} style={{ marginBottom: "0.375rem" }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
              <span>
                {correct ? "✅ " : ""}
                {renderEntities(o.text, o.text_entities)}
              </span>
              <span className="muted">{pct}%</span>
            </div>
            <div
              style={{
                height: "0.25rem",
                background: "rgba(127,127,127,.25)",
                borderRadius: "0.125rem",
                marginTop: "0.125rem",
                overflow: "hidden",
              }}
            >
              <div style={{ width: `${pct}%`, height: "100%", background: "currentColor", opacity: 0.75 }} />
            </div>
          </div>
        );
      })}
      <div className="muted" style={{ fontSize: "0.75rem" }}>
        {total} vote{total === 1 ? "" : "s"}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- misc */

function Dice({ m }: { m: StoredMessage }) {
  const d = m.dice as TgAny;
  return (
    <div style={{ textAlign: "center", padding: "0.25rem 1rem" }}>
      <div style={{ fontSize: "3.5rem", lineHeight: 1 }}>{d.emoji}</div>
      <div className="muted" style={{ fontSize: "0.8125rem", marginTop: "0.25rem" }}>
        rolled {d.value}
      </div>
    </div>
  );
}

function Game({ m }: { m: StoredMessage }) {
  const g = m.game as TgAny;
  const photo = bestPhoto(g.photo);
  return (
    <div style={{ maxWidth: "18rem" }}>
      {photo && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={fileSrc(photo.file_id)}
          alt={g.title}
          style={{ width: "100%", borderRadius: MEDIA_RADIUS, display: "block" }}
        />
      )}
      <div style={{ fontWeight: 600, marginTop: "0.25rem" }}>🎮 {g.title}</div>
      <div className="muted" style={{ fontSize: "0.8125rem" }}>
        {g.description}
      </div>
    </div>
  );
}

function Invoice({ m }: { m: StoredMessage }) {
  const inv = m.invoice as TgAny;
  return (
    <div style={{ maxWidth: "18rem" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontWeight: 600 }}>
        <IconMoney size={18} /> {inv.title}
      </div>
      <div className="muted" style={{ fontSize: "0.8125rem", margin: "0.125rem 0" }}>
        {inv.description}
      </div>
      <div style={{ fontWeight: 600 }}>{formatAmount(inv.total_amount, inv.currency)}</div>
    </div>
  );
}

function Giveaway({ m }: { m: StoredMessage }) {
  const g = (m.giveaway || m.giveaway_winners) as TgAny;
  return (
    <Simple
      label="🎁 Giveaway"
      sub={`${g.winner_count || g.winners_selected ? `${g.winner_count} winners` : "Giveaway"}`}
    />
  );
}

function Checklist({ m }: { m: StoredMessage }) {
  const c = m.checklist as TgAny;
  return (
    <div style={{ minWidth: "13rem" }}>
      <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>
        {renderEntities(c.title, c.title_entities)}
      </div>
      {(c.tasks || []).map((t: TgAny) => (
        <div key={t.id} style={{ display: "flex", gap: "0.375rem", fontSize: "0.8125rem" }}>
          <span>{t.completed_by_user ? "☑️" : "⬜️"}</span>
          <span>{renderEntities(t.text, t.text_entities)}</span>
        </div>
      ))}
    </div>
  );
}

function Simple({ label, sub }: { label: string; sub?: string }) {
  return (
    <div>
      <div style={{ fontWeight: 500 }}>{label}</div>
      {sub && (
        <div className="muted" style={{ fontSize: "0.8125rem" }}>
          {sub}
        </div>
      )}
    </div>
  );
}
