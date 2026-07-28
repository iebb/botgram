"use client";

import React, { useState } from "react";
import { useStore } from "../Store";
import { Collapsible, Field, Json, Select, TextArea, TextInput } from "../UI";
import type { TgAny } from "@/lib/types";
import StickerMedia from "../StickerMedia";

export default function StickersPanel() {
  const { call, notify, selectedChatId, rememberStickerSet } = useStore();
  const [name, setName] = useState("");
  const [set, setSet] = useState<TgAny | null>(null);
  const [result, setResult] = useState<unknown>(null);

  const run = async (method: string, params: TgAny = {}, okMsg?: string) => {
    const res = await call(method, params);
    setResult(res.ok ? res.result : res);
    if (res.ok && okMsg) notify(okMsg);
    return res;
  };

  const load = async () => {
    const res = await call("getStickerSet", { name });
    if (res.ok) {
      setSet(res.result);
      rememberStickerSet(res.result);
    }
  };

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <div className="section">
        <div className="section-title">Browse a sticker set</div>
        <Field label="Set name">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AnimatedEmojies"
          />
        </Field>
        <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
          <button className="btn sm primary" onClick={load}>
            Load set
          </button>
          <button className="btn sm" onClick={() => run("getForumTopicIconStickers")}>
            Topic icons
          </button>
        </div>

        {set && (
          <>
            <div style={{ margin: "0.625rem 0 0.375rem", fontSize: "0.8125rem" }}>
              <strong>{set.title}</strong>{" "}
              <span className="muted">
                · {set.sticker_type} · {set.stickers?.length} stickers
              </span>
            </div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(4.5rem, 1fr))",
                gap: "0.375rem",
              }}
            >
              {(set.stickers || []).map((s: TgAny) => (
                <button
                  key={s.file_unique_id}
                  title={`${s.emoji || ""} — click to send`}
                  style={{
                    aspectRatio: "1",
                    background: "var(--bg-secondary)",
                    borderRadius: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "0.25rem",
                  }}
                  onClick={async () => {
                    if (!selectedChatId) return notify("Select a chat first", "err");
                    const res = await call("sendSticker", {
                      chat_id: Number(selectedChatId),
                      sticker: s.file_id,
                    });
                    if (res.ok) notify("Sticker sent");
                  }}
                >
                  <StickerMedia sticker={s} />
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <CreateSet run={run} />
      <EditStickers run={run} />
      <CustomEmoji run={run} />

      {result != null && (
        <div className="section" style={{ borderBottom: "none" }}>
          <div className="section-title">Last result</div>
          <Json value={result} />
        </div>
      )}
    </div>
  );
}

type Run = (method: string, params?: TgAny, okMsg?: string) => Promise<any>;

function CreateSet({ run }: { run: Run }) {
  const { upload, notify, state } = useStore();
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [type, setType] = useState("regular");
  const [format, setFormat] = useState("static");
  const [emoji, setEmoji] = useState("😀");
  const [file, setFile] = useState<File | null>(null);
  const [uploadedId, setUploadedId] = useState("");

  const suffix = state.me?.username ? `_by_${state.me.username}` : "";

  return (
    <Collapsible title="Create a sticker set">
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0, lineHeight: 1.5 }}>
        Sets are owned by a user, not the bot — you need the user_id of someone who has messaged
        the bot. The set name must end in <code className="tg-code">{suffix || "_by_yourbot"}</code>.
      </p>

      <Field label="Owner user_id">
        <TextInput value={userId} onChange={(e) => setUserId(e.target.value)} />
      </Field>
      <Field label="Sticker file">
        <input type="file" accept=".webp,.png,.tgs,.webm" className="input" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
        <Field label="Format">
          <Select value={format} onChange={(e) => setFormat(e.target.value)} options={["static", "animated", "video"]} />
        </Field>
        <Field label="Sticker type">
          <Select value={type} onChange={(e) => setType(e.target.value)} options={["regular", "mask", "custom_emoji"]} />
        </Field>
      </div>
      <button
        className="btn sm"
        onClick={async () => {
          if (!file) return notify("Pick a file", "err");
          const res = await upload(
            "uploadStickerFile",
            { user_id: Number(userId), sticker_format: format },
            { sticker: file }
          );
          if (res.ok) {
            setUploadedId(res.result.file_id);
            notify("Uploaded — file_id captured");
          }
        }}
      >
        1. uploadStickerFile
      </button>
      {uploadedId && (
        <div className="chip ok" style={{ display: "block", margin: "0.375rem 0", whiteSpace: "normal" }}>
          {uploadedId}
        </div>
      )}

      <Field label="Set name">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={`myset${suffix}`}
        />
      </Field>
      <Field label="Set title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>
      <Field label="Emoji list (comma separated)">
        <TextInput value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      </Field>
      <button
        className="btn sm primary"
        onClick={() =>
          run(
            "createNewStickerSet",
            {
              user_id: Number(userId),
              name,
              title,
              sticker_type: type,
              stickers: [
                {
                  sticker: uploadedId,
                  format,
                  emoji_list: emoji.split(",").map((s) => s.trim()).filter(Boolean),
                },
              ],
            },
            "Sticker set created"
          )
        }
      >
        2. createNewStickerSet
      </button>
    </Collapsible>
  );
}

function EditStickers({ run }: { run: Run }) {
  const [setName, setSetName] = useState("");
  const [fileId, setFileId] = useState("");
  const [userId, setUserId] = useState("");
  const [emoji, setEmoji] = useState("😀");
  const [keywords, setKeywords] = useState("");
  const [position, setPosition] = useState("0");
  const [title, setTitle] = useState("");

  return (
    <Collapsible title="Edit stickers">
      <Field label="Set name">
        <TextInput value={setName} onChange={(e) => setSetName(e.target.value)} />
      </Field>
      <Field label="Sticker file_id">
        <TextInput value={fileId} onChange={(e) => setFileId(e.target.value)} />
      </Field>
      <Field label="Owner user_id">
        <TextInput value={userId} onChange={(e) => setUserId(e.target.value)} />
      </Field>
      <Field label="Emoji list (comma separated)">
        <TextInput value={emoji} onChange={(e) => setEmoji(e.target.value)} />
      </Field>
      <Field label="Keywords (comma separated)">
        <TextInput value={keywords} onChange={(e) => setKeywords(e.target.value)} />
      </Field>
      <Field label="Position">
        <TextInput type="number" value={position} onChange={(e) => setPosition(e.target.value)} />
      </Field>
      <Field label="New set title">
        <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "addStickerToSet",
              {
                user_id: Number(userId),
                name: setName,
                sticker: {
                  sticker: fileId,
                  format: "static",
                  emoji_list: emoji.split(",").map((s) => s.trim()).filter(Boolean),
                },
              },
              "Sticker added"
            )
          }
        >
          Add to set
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "setStickerEmojiList",
              { sticker: fileId, emoji_list: emoji.split(",").map((s) => s.trim()).filter(Boolean) },
              "Emoji updated"
            )
          }
        >
          Set emoji
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "setStickerKeywords",
              { sticker: fileId, keywords: keywords.split(",").map((s) => s.trim()).filter(Boolean) },
              "Keywords updated"
            )
          }
        >
          Set keywords
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run("setStickerPositionInSet", { sticker: fileId, position: Number(position) }, "Moved")
          }
        >
          Set position
        </button>
        <button
          className="btn sm"
          onClick={() => run("setStickerSetTitle", { name: setName, title }, "Title set")}
        >
          Set set title
        </button>
        <button
          className="btn sm danger"
          onClick={() => run("deleteStickerFromSet", { sticker: fileId }, "Sticker deleted")}
        >
          Delete sticker
        </button>
        <button
          className="btn sm danger"
          onClick={() => run("deleteStickerSet", { name: setName }, "Set deleted")}
        >
          Delete set
        </button>
      </div>
    </Collapsible>
  );
}

function CustomEmoji({ run }: { run: Run }) {
  const [ids, setIds] = useState("");
  return (
    <Collapsible title="Custom emoji">
      <Field label="custom_emoji_ids (comma separated)">
        <TextArea value={ids} onChange={(e) => setIds(e.target.value)} rows={2} />
      </Field>
      <button
        className="btn sm"
        onClick={() =>
          run("getCustomEmojiStickers", {
            custom_emoji_ids: ids.split(",").map((s) => s.trim()).filter(Boolean),
          })
        }
      >
        getCustomEmojiStickers
      </button>
    </Collapsible>
  );
}
