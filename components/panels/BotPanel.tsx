"use client";

import React, { useState } from "react";
import { useStore } from "../Store";
import { Avatar, Collapsible, Field, Json, Select, TextArea, TextInput, Toggle } from "../UI";
import type { TgAny } from "@/lib/types";
import { profilePhotoKind } from "@/lib/media";
import { SelectedMediaGrid } from "../MediaPreview";

const SCOPES = [
  "default",
  "all_private_chats",
  "all_group_chats",
  "all_chat_administrators",
  "chat",
  "chat_administrators",
  "chat_member",
];

export default function BotPanel() {
  const { state, call, notify } = useStore();
  const [result, setResult] = useState<unknown>(null);

  const run = async (method: string, params: TgAny = {}, okMsg?: string) => {
    const res = await call(method, params);
    setResult(res.ok ? res.result : res);
    if (res.ok && okMsg) notify(okMsg);
  };

  const me = state.me;

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <div className="section" style={{ textAlign: "center" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: "0.5rem" }}>
          <Avatar id={me?.id || 0} name={me?.first_name || "Bot"} size="lg" entity={me || undefined} avatarKind="user" />
        </div>
        <div style={{ fontWeight: 600, fontSize: "1.125rem" }}>{me?.first_name}</div>
        {me?.username && (
          <a className="tg-link" href={`https://t.me/${me.username}`} target="_blank" rel="noreferrer">
            @{me.username}
          </a>
        )}
        <div
          style={{
            display: "flex",
            gap: "0.25rem",
            flexWrap: "wrap",
            justifyContent: "center",
            marginTop: "0.5rem",
          }}
        >
          {me &&
            Object.entries(me)
              .filter(([k, v]) => k.startsWith("can_") || k.startsWith("supports_") || k.startsWith("has_"))
              .map(([k, v]) => (
                <span key={k} className={`chip ${v ? "ok" : ""}`}>
                  {v ? "✓" : "✗"} {k.replace(/^(can_|supports_|has_)/, "")}
                </span>
              ))}
        </div>
        <button className="btn sm ghost" style={{ marginTop: "0.625rem" }} onClick={() => run("getMe")}>
          Refresh getMe
        </button>
      </div>

      <AvatarManager onResult={setResult} />
      <Identity run={run} />
      <Commands run={run} />
      <MenuButton run={run} />
      <DefaultRights run={run} />
      <Stars run={run} />
      <Gifts run={run} />

      {result != null && (
        <div className="section" style={{ borderBottom: "none" }}>
          <div className="section-title">Last result</div>
          <Json value={result} />
        </div>
      )}
    </div>
  );
}

type Run = (method: string, params?: TgAny, okMsg?: string) => Promise<void>;

function AvatarManager({ onResult }: { onResult: (value: unknown) => void }) {
  const { state, call, upload, notify, refreshAvatar } = useStore();
  const [file, setFile] = useState<File | null>(null);
  const [mainFrame, setMainFrame] = useState("0");
  const [busy, setBusy] = useState<"set" | "remove" | "refresh" | null>(null);
  const kind = file ? profilePhotoKind(file) : null;

  const refresh = async () => {
    if (!state.me?.id) return;
    setBusy("refresh");
    try {
      await refreshAvatar(state.me.id, "user");
    } finally {
      setBusy(null);
    }
  };

  const setPhoto = async () => {
    if (!file || !kind || !state.me?.id) {
      return notify("Choose an image or an MPEG-4 video first", "err");
    }
    setBusy("set");
    try {
      const prepared = kind === "static" ? await jpegProfilePhoto(file) : file;
      const field = kind === "static" ? "profile_photo" : "profile_animation";
      const photo = kind === "static"
        ? { type: "static", photo: `attach://${field}` }
        : {
            type: "animated",
            animation: `attach://${field}`,
            main_frame_timestamp: Number(mainFrame) || undefined,
          };
      const response = await upload("setMyProfilePhoto", { photo }, { [field]: prepared });
      onResult(response.ok ? response.result : response);
      if (!response.ok) return;
      notify(kind === "static" ? "Bot profile photo updated" : "Animated bot profile photo updated");
      setFile(null);
      await refreshAvatar(state.me.id, "user");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not prepare this profile photo", "err");
    } finally {
      setBusy(null);
    }
  };

  const removePhoto = async () => {
    if (!state.me?.id || !window.confirm("Remove the bot's current profile photo?")) return;
    setBusy("remove");
    try {
      const response = await call("removeMyProfilePhoto");
      onResult(response.ok ? response.result : response);
      if (!response.ok) return;
      notify("Bot profile photo removed");
      setFile(null);
      await refreshAvatar(state.me.id, "user");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Collapsible title="Profile photo" defaultOpen>
      <Field
        label="New avatar"
        hint="Images are converted to JPG in this browser. MP4 creates an animated profile photo. Upload bytes are not saved by Humanoid."
      >
        <input
          className="input"
          type="file"
          accept="image/*,video/mp4,.mp4"
          onChange={(event) => setFile(event.currentTarget.files?.[0] || null)}
        />
      </Field>
      {file && <SelectedMediaGrid files={[file]} onChange={(next) => setFile(next[0] || null)} compact />}
      {file && !kind && (
        <div className="media-validation-error">Use an image or an MPEG-4 (.mp4) video.</div>
      )}
      {kind === "animated" && (
        <Field label="Main frame timestamp" hint="Seconds into the MP4 used for the static thumbnail.">
          <TextInput
            type="number"
            min="0"
            step="0.1"
            value={mainFrame}
            onChange={(event) => setMainFrame(event.target.value)}
          />
        </Field>
      )}
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button className="btn sm primary" disabled={!file || !kind || busy !== null} onClick={() => void setPhoto()}>
          {busy === "set" ? "Uploading…" : "Set profile photo"}
        </button>
        <button className="btn sm" disabled={busy !== null} onClick={() => void refresh()}>
          {busy === "refresh" ? "Refreshing…" : "Refresh photo"}
        </button>
        <button className="btn sm danger" disabled={busy !== null} onClick={() => void removePhoto()}>
          {busy === "remove" ? "Removing…" : "Remove current photo"}
        </button>
      </div>
    </Collapsible>
  );
}

async function jpegProfilePhoto(file: File): Promise<File> {
  if (file.type === "image/jpeg" || /\.jpe?g$/i.test(file.name)) return file;
  const bitmap = await createImageBitmap(file);
  try {
    const longest = Math.max(bitmap.width, bitmap.height);
    const scale = longest > 4096 ? 4096 / longest : 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot convert the selected image");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (value) => value ? resolve(value) : reject(new Error("Could not convert the selected image to JPG")),
        "image/jpeg",
        0.92
      );
    });
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

function Identity({ run }: { run: Run }) {
  const [lang, setLang] = useState("");
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  const [short, setShort] = useState("");

  return (
    <Collapsible title="Name & description" defaultOpen>
      <Field label="Language code" hint="Empty = the default for all users.">
        <TextInput value={lang} onChange={(e) => setLang(e.target.value)} placeholder="en, ru, …" />
      </Field>

      <Field label="Bot name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.625rem" }}>
        <button
          className="btn sm primary"
          onClick={() => run("setMyName", { name, language_code: lang || undefined }, "Name set")}
        >
          Set name
        </button>
        <button className="btn sm" onClick={() => run("getMyName", { language_code: lang || undefined })}>
          Get
        </button>
      </div>

      <Field label="Description" hint="Shown on the empty-chat screen (max 512 chars).">
        <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "0.625rem" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run("setMyDescription", { description: desc, language_code: lang || undefined }, "Description set")
          }
        >
          Set description
        </button>
        <button className="btn sm" onClick={() => run("getMyDescription", { language_code: lang || undefined })}>
          Get
        </button>
      </div>

      <Field label="Short description" hint="Shown on the profile page (max 120 chars).">
        <TextArea value={short} onChange={(e) => setShort(e.target.value)} rows={2} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "setMyShortDescription",
              { short_description: short, language_code: lang || undefined },
              "Short description set"
            )
          }
        >
          Set short
        </button>
        <button
          className="btn sm"
          onClick={() => run("getMyShortDescription", { language_code: lang || undefined })}
        >
          Get
        </button>
      </div>
    </Collapsible>
  );
}

function Commands({ run }: { run: Run }) {
  const { selectedChatId } = useStore();
  const [scope, setScope] = useState("default");
  const [lang, setLang] = useState("");
  const [text, setText] = useState("start - Start the bot\nhelp - Show help");

  const scopeObj = (): TgAny => {
    const s: TgAny = { type: scope };
    if (scope.startsWith("chat")) s.chat_id = Number(selectedChatId || 0);
    if (scope === "chat_member") s.user_id = 0;
    return s;
  };

  const commands = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [cmd, ...rest] = l.split(/\s*-\s*/);
      return { command: cmd.replace(/^\//, "").toLowerCase(), description: rest.join(" - ") };
    })
    .filter((c) => c.command && c.description);

  return (
    <Collapsible title="Commands">
      <Field label="Scope">
        <Select value={scope} onChange={(e) => setScope(e.target.value)} options={SCOPES} />
      </Field>
      <Field label="Language code">
        <TextInput value={lang} onChange={(e) => setLang(e.target.value)} placeholder="optional" />
      </Field>
      <Field label="Commands" hint="One per line: command - description">
        <TextArea value={text} onChange={(e) => setText(e.target.value)} rows={5} className="mono" />
      </Field>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)", marginBottom: "0.5rem" }}>
        {commands.length} valid command{commands.length === 1 ? "" : "s"}
      </div>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "setMyCommands",
              { commands, scope: scopeObj(), language_code: lang || undefined },
              "Commands set"
            )
          }
        >
          Set
        </button>
        <button
          className="btn sm"
          onClick={() => run("getMyCommands", { scope: scopeObj(), language_code: lang || undefined })}
        >
          Get
        </button>
        <button
          className="btn sm danger"
          onClick={() =>
            run("deleteMyCommands", { scope: scopeObj(), language_code: lang || undefined }, "Commands deleted")
          }
        >
          Delete
        </button>
      </div>
    </Collapsible>
  );
}

function MenuButton({ run }: { run: Run }) {
  const { selectedChatId } = useStore();
  const [type, setType] = useState("commands");
  const [text, setText] = useState("Open app");
  const [url, setUrl] = useState("https://");
  const [perChat, setPerChat] = useState(false);

  const menu_button: TgAny =
    type === "web_app" ? { type, text, web_app: { url } } : { type };

  return (
    <Collapsible title="Menu button">
      <Field label="Type">
        <Select
          value={type}
          onChange={(e) => setType(e.target.value)}
          options={[
            { value: "commands", label: "Commands menu" },
            { value: "web_app", label: "Web App button" },
            { value: "default", label: "Default" },
          ]}
        />
      </Field>
      {type === "web_app" && (
        <>
          <Field label="Button text">
            <TextInput value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="Web App URL">
            <TextInput value={url} onChange={(e) => setUrl(e.target.value)} />
          </Field>
        </>
      )}
      <Toggle checked={perChat} onChange={setPerChat} label="Apply to the selected chat only" />
      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "setChatMenuButton",
              { chat_id: perChat && selectedChatId ? Number(selectedChatId) : undefined, menu_button },
              "Menu button set"
            )
          }
        >
          Set
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run("getChatMenuButton", {
              chat_id: perChat && selectedChatId ? Number(selectedChatId) : undefined,
            })
          }
        >
          Get
        </button>
      </div>
    </Collapsible>
  );
}

const RIGHTS = [
  "is_anonymous",
  "can_manage_chat",
  "can_delete_messages",
  "can_manage_video_chats",
  "can_restrict_members",
  "can_promote_members",
  "can_change_info",
  "can_invite_users",
  "can_post_stories",
  "can_edit_stories",
  "can_delete_stories",
  "can_post_messages",
  "can_edit_messages",
  "can_pin_messages",
  "can_manage_topics",
];

function DefaultRights({ run }: { run: Run }) {
  const [rights, setRights] = useState<Record<string, boolean>>({});
  const [channels, setChannels] = useState(false);

  return (
    <Collapsible title="Default admin rights">
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0 }}>
        Pre-ticked when a user adds the bot as an administrator.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.5rem" }}>
        {RIGHTS.map((r) => (
          <Toggle
            key={r}
            checked={!!rights[r]}
            onChange={(v) => setRights({ ...rights, [r]: v })}
            label={r.replace(/^can_|^is_/, "")}
          />
        ))}
      </div>
      <Toggle checked={channels} onChange={setChannels} label="For channels" />
      <div style={{ display: "flex", gap: "0.375rem", marginTop: "0.5rem" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "setMyDefaultAdministratorRights",
              {
                rights: Object.fromEntries(RIGHTS.map((r) => [r, !!rights[r]])),
                for_channels: channels || undefined,
              },
              "Default rights set"
            )
          }
        >
          Set
        </button>
        <button
          className="btn sm"
          onClick={() => run("getMyDefaultAdministratorRights", { for_channels: channels || undefined })}
        >
          Get
        </button>
      </div>
    </Collapsible>
  );
}

function Stars({ run }: { run: Run }) {
  const [uid, setUid] = useState("");
  const [charge, setCharge] = useState("");

  return (
    <Collapsible title="Telegram Stars">
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.625rem" }}>
        <button className="btn sm" onClick={() => run("getMyStarBalance")}>
          Star balance
        </button>
        <button className="btn sm" onClick={() => run("getStarTransactions", { limit: 20 })}>
          Transactions
        </button>
      </div>
      <Field label="user_id">
        <TextInput value={uid} onChange={(e) => setUid(e.target.value)} />
      </Field>
      <Field label="telegram_payment_charge_id">
        <TextInput value={charge} onChange={(e) => setCharge(e.target.value)} />
      </Field>
      <button
        className="btn sm danger"
        onClick={() =>
          run(
            "refundStarPayment",
            { user_id: Number(uid), telegram_payment_charge_id: charge },
            "Refunded"
          )
        }
      >
        Refund star payment
      </button>
    </Collapsible>
  );
}

function Gifts({ run }: { run: Run }) {
  const [uid, setUid] = useState("");
  const [giftId, setGiftId] = useState("");
  const [text, setText] = useState("");

  return (
    <Collapsible title="Gifts">
      <button className="btn sm" onClick={() => run("getAvailableGifts")}>
        List available gifts
      </button>
      <Field label="user_id">
        <TextInput value={uid} onChange={(e) => setUid(e.target.value)} />
      </Field>
      <Field label="gift_id">
        <TextInput value={giftId} onChange={(e) => setGiftId(e.target.value)} />
      </Field>
      <Field label="Message with the gift">
        <TextInput value={text} onChange={(e) => setText(e.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={() =>
          run(
            "sendGift",
            { user_id: Number(uid), gift_id: giftId, text: text || undefined },
            "Gift sent"
          )
        }
      >
        Send gift
      </button>
    </Collapsible>
  );
}
