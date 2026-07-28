"use client";

import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "./Store";
import { Field, Select, TextInput, Toggle } from "./UI";
import KeyboardBuilder, { KeyboardPreview, buildReplyMarkup, emptyKb, type KbDraft } from "./KeyboardBuilder";
import RichMessagePreview from "./RichMessagePreview";
import RichWysiwygEditor, { type RichWysiwygHandle } from "./RichWysiwygEditor";
import { chatName, messagePreview } from "@/lib/format";
import {
  DEFAULT_RICH_SOURCES,
  RICH_BLOCK_SNIPPETS,
  RICH_TEMPLATES,
  buildInputRichMessage,
  buildThinkingRichDraft,
  containsThinkingBlock,
  extractRichCustomEmojis,
  parseRichBlocks,
  richMediaMarkup,
  validateRichMessage,
  type RichMediaDescriptor,
  type RichMediaKind,
  type RichMode,
  type RichSources,
} from "@/lib/rich";
import type { TgAny } from "@/lib/types";
import { loadRichDraft, saveRichDraft } from "@/lib/client/indexedDb";
import {
  IconCheck,
  IconClose,
  IconCode,
  IconCopy,
  IconDoc,
  IconKeyboard,
  IconPhoto,
  IconPlus,
  IconSend,
} from "./Icons";

interface RichUpload extends RichMediaDescriptor {
  file: File;
  previewUrl: string;
}

interface SendOptions {
  messageThreadId: string;
  directMessagesTopicId: string;
  businessConnectionId: string;
  messageEffectId: string;
  suggestedPostParameters: string;
  disableNotification: boolean;
  protectContent: boolean;
  allowPaidBroadcast: boolean;
  useReply: boolean;
}

interface SavedStudio {
  version: 1;
  mode: RichMode;
  view?: StudioView;
  sources: RichSources;
  rtl: boolean;
  skipDetection: boolean;
  draftId: number;
  keyboard: KbDraft;
  options: SendOptions;
}

type StudioView = "visual" | "source";

interface LiveDraftInput {
  eligible: boolean;
  target: string;
  messageThreadId?: number;
  draftId: number;
  mode: RichMode;
  content: string;
  rtl: boolean;
  skipDetection: boolean;
}

const DEFAULT_OPTIONS: SendOptions = {
  messageThreadId: "",
  directMessagesTopicId: "",
  businessConnectionId: "",
  messageEffectId: "",
  suggestedPostParameters: "",
  disableNotification: false,
  protectContent: false,
  allowPaidBroadcast: false,
  useReply: true,
};

const HTML_INSERTS = [
  ["H1", "<h1>Heading 1</h1>"],
  ["H2", "<h2>Heading 2</h2>"],
  ["H3", "<h3>Heading 3</h3>"],
  ["H4", "<h4>Heading 4</h4>"],
  ["H5", "<h5>Heading 5</h5>"],
  ["H6", "<h6>Heading 6</h6>"],
  ["Paragraph", "<p>Paragraph text</p>"],
  ["Callout", "<aside>Important callout<cite>Source</cite></aside>"],
  ["Checklist", '<ul>\n  <li><input type="checkbox" checked> Completed item</li>\n  <li><input type="checkbox"> Open item</li>\n</ul>'],
  ["Ordered list", '<ol start="1"><li>First item</li><li>Second item</li></ol>'],
  ["Quote", "<blockquote>Quoted text<cite>Source</cite></blockquote>"],
  ["Footer", "<footer>Footer text</footer>"],
  ["Divider", "<hr>"],
  ["Details", "<details><summary>More details</summary><p>Expandable content</p></details>"],
  ["Table", "<table bordered striped><caption>Metrics</caption><tr><th>Name</th><th>Value</th></tr><tr><td>Latency</td><td>Realtime</td></tr></table>"],
  ["Map", '<tg-map lat="35.681236" long="139.767125" zoom="14"/>'],
  ["Math", "<tg-math-block>E = mc^2</tg-math-block>"],
  ["Anchor", '<a name="section"></a>'],
  ["Reference", '<tg-reference name="note">Referenced text</tg-reference>'],
  ["Custom emoji", '<tg-emoji emoji-id="5368324170671202286">👍</tg-emoji>'],
  ["Collage", '<tg-collage><img src="https://telegram.org/example/photo.jpg"><video src="https://telegram.org/example/video.mp4"></video><figcaption>Collage caption</figcaption></tg-collage>'],
  ["Slideshow", '<tg-slideshow><img src="https://telegram.org/example/photo.jpg"><video src="https://telegram.org/example/video.mp4"></video><figcaption>Slideshow caption</figcaption></tg-slideshow>'],
  ["Thinking", "<tg-thinking>Thinking…</tg-thinking>"],
] as const;

const MARKDOWN_INSERTS = [
  ["H1", "# Heading 1"],
  ["H2", "## Heading 2"],
  ["H3", "### Heading 3"],
  ["H4", "#### Heading 4"],
  ["H5", "##### Heading 5"],
  ["H6", "###### Heading 6"],
  ["Bold", "**bold text**"],
  ["Link", "[Telegram](https://telegram.org)"],
  ["Quote", "> Quoted text"],
  ["Checklist", "- [x] Completed item\n- [ ] Open item"],
  ["Ordered list", "1. First item\n2. Second item"],
  ["Table", "| Name | Value |\n|:--|--:|\n| Latency | Realtime |"],
  ["Code", "```typescript\nconst ready = true;\n```"],
  ["Math", "$$E = mc^2$$"],
  ["Footnote", "Text with a note[^note].\n\n[^note]: Footnote text."],
  ["Custom emoji", "![👍](tg://emoji?id=5368324170671202286)"],
  ["Media", '![Media caption](https://telegram.org/example/photo.jpg "Caption")'],
  ["Details", "<details><summary>More details</summary>Expandable content</details>"],
  ["Collage", "<tg-collage>\n\n![](https://telegram.org/example/photo.jpg)\n![](https://telegram.org/example/video.mp4)\n\n</tg-collage>"],
  ["Slideshow", "<tg-slideshow>\n\n![](https://telegram.org/example/photo.jpg)\n![](https://telegram.org/example/video.mp4)\n\n</tg-slideshow>"],
] as const;

export default function RichMessageEditor({ onClose }: { onClose: () => void }) {
  const { state, selectedChatId, replyTo, call, upload, notify } = useStore();
  const [mode, setMode] = useState<RichMode>("html");
  const [editorView, setEditorView] = useState<StudioView>("visual");
  const [sources, setSources] = useState<RichSources>(DEFAULT_RICH_SOURCES);
  const [uploads, setUploads] = useState<RichUpload[]>([]);
  const [rtl, setRtl] = useState(false);
  const [skipDetection, setSkipDetection] = useState(false);
  const [draftId, setDraftId] = useState(() => (Date.now() % 2_147_483_647) || 1);
  const [keyboard, setKeyboard] = useState<KbDraft>(emptyKb);
  const [options, setOptions] = useState<SendOptions>(DEFAULT_OPTIONS);
  const [busy, setBusy] = useState<"send" | "draft" | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [liveDraftEnabled, setLiveDraftEnabled] = useState(false);
  const [liveDraftSentAt, setLiveDraftSentAt] = useState<number | null>(null);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const wysiwygRef = useRef<RichWysiwygHandle>(null);
  const importRef = useRef<HTMLInputElement>(null);
  const uploadsRef = useRef<RichUpload[]>([]);
  const loadedDraftBot = useRef("");
  const latestDraft = useRef<SavedStudio | null>(null);
  const draftSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveDraftInput = useRef<LiveDraftInput | null>(null);
  const liveDraftInFlight = useRef(false);
  const liveDraftPending = useRef<Promise<void> | null>(null);
  const liveDraftRequested = useRef(false);
  const liveDraftLastSignature = useRef("");
  const liveDraftLastSuccessAt = useRef(0);
  uploadsRef.current = uploads;

  const draftBotId = state.me?.id == null ? "" : String(state.me.id);
  const target = selectedChatId || "";
  const content = sources[mode];
  const descriptors = uploads.map(({ id, field, kind }) => ({ id, field, kind }));
  const validation = useMemo(
    () => validateRichMessage(mode, content, rtl, skipDetection, descriptors),
    [mode, content, rtl, skipDetection, uploads]
  );
  const selectedTargetChat = state.chats.find((entry) => String(entry.chat.id) === target);
  const canStream = selectedTargetChat?.chat.type === "private" && uploads.length === 0;
  const streamUnavailableReason = !selectedTargetChat
    ? "Open a known chat before streaming a draft."
    : selectedTargetChat.chat.type !== "private"
      ? `Telegram rich drafts are private-chat only; the current chat is a ${selectedTargetChat.chat.type}.`
      : uploads.length > 0
        ? "New local uploads cannot be included in a streamed draft."
        : "";
  const draftOnly = containsThinkingBlock(mode, content);
  liveDraftInput.current = {
    eligible: canStream,
    target,
    messageThreadId: numberOrUndefined(options.messageThreadId),
    draftId,
    mode,
    content,
    rtl,
    skipDetection,
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => () => {
    for (const item of uploadsRef.current) URL.revokeObjectURL(item.previewUrl);
  }, []);

  const applySaved = useCallback((saved: SavedStudio) => {
    if (saved?.version !== 1 || !["html", "markdown", "blocks"].includes(saved.mode)) {
      throw new Error("Unsupported rich studio file");
    }
    if (!saved.sources || typeof saved.sources.html !== "string" || typeof saved.sources.markdown !== "string" || typeof saved.sources.blocks !== "string") {
      throw new Error("Rich studio sources are invalid");
    }
    // Reopening/importing always lands on the visual HTML representation; the
    // saved Markdown and block sources remain available in their source tabs.
    setMode("html");
    setEditorView("visual");
    setLiveDraftEnabled(false);
    setLiveDraftSentAt(null);
    setSources(saved.sources);
    setRtl(Boolean(saved.rtl));
    setSkipDetection(Boolean(saved.skipDetection));
    setDraftId(Number(saved.draftId) || 1);
    setKeyboard(saved.keyboard && Array.isArray(saved.keyboard.rows) ? saved.keyboard : emptyKb);
    setOptions({ ...DEFAULT_OPTIONS, ...(saved.options || {}) });
  }, []);

  useEffect(() => {
    if (!draftBotId || loadedDraftBot.current === draftBotId) return;
    let cancelled = false;
    loadedDraftBot.current = "";
    void loadRichDraft<SavedStudio>(draftBotId)
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          applySaved(saved);
          setSavedAt(Date.now());
        }
        loadedDraftBot.current = draftBotId;
      })
      .catch(() => {
        if (cancelled) return;
        loadedDraftBot.current = draftBotId;
        notify("Rich draft storage is unavailable; editing remains in memory", "err");
      });
    return () => {
      cancelled = true;
    };
  }, [applySaved, draftBotId, notify]);

  useEffect(() => {
    if (!liveDraftEnabled) return;
    let active = true;

    const publish = async () => {
      const current = liveDraftInput.current;
      if (!liveDraftRequested.current || !current?.eligible || !current.content.trim() || liveDraftInFlight.current) return;
      const signature = JSON.stringify(current);
      const now = Date.now();
      if (
        signature === liveDraftLastSignature.current &&
        now - liveDraftLastSuccessAt.current < 15_000
      ) return;

      liveDraftInFlight.current = true;
      try {
        const response = await call("sendRichMessageDraft", {
          chat_id: Number(current.target),
          message_thread_id: current.messageThreadId,
          draft_id: current.draftId,
          rich_message: buildThinkingRichDraft(
            current.mode,
            current.content,
            current.rtl,
            current.skipDetection
          ),
        });
        if (!active) return;
        if (!response.ok) {
          setLiveDraftEnabled(false);
          return;
        }
        liveDraftLastSignature.current = signature;
        liveDraftLastSuccessAt.current = Date.now();
        setLiveDraftSentAt(liveDraftLastSuccessAt.current);
      } catch (error) {
        if (!active) return;
        notify(error instanceof Error ? error.message : "Could not stream this rich draft", "err");
        setLiveDraftEnabled(false);
      } finally {
        liveDraftInFlight.current = false;
      }
    };

    const runPublish = () => {
      const pending = publish();
      liveDraftPending.current = pending;
      void pending.finally(() => {
        if (liveDraftPending.current === pending) liveDraftPending.current = null;
      });
    };
    liveDraftRequested.current = true;
    const first = window.setTimeout(runPublish, 600);
    const interval = window.setInterval(runPublish, 3_000);
    return () => {
      active = false;
      liveDraftRequested.current = false;
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [call, liveDraftEnabled, notify]);

  useEffect(() => {
    if (liveDraftEnabled && !canStream) {
      liveDraftRequested.current = false;
      setLiveDraftEnabled(false);
    }
  }, [canStream, liveDraftEnabled]);

  useEffect(() => {
    if (!draftBotId || loadedDraftBot.current !== draftBotId) return;
    latestDraft.current = {
      version: 1,
      mode,
      view: editorView,
      sources,
      rtl,
      skipDetection,
      draftId,
      keyboard,
      options,
    };
    if (draftSaveTimer.current) return;
    draftSaveTimer.current = setTimeout(() => {
      draftSaveTimer.current = null;
      const draft = latestDraft.current;
      if (!draft || loadedDraftBot.current !== draftBotId) return;
      void saveRichDraft(draftBotId, draft)
        .then(() => setSavedAt(Date.now()))
        .catch(() => notify("Could not save the rich draft in this browser", "err"));
    }, 400);
  }, [draftBotId, draftId, editorView, keyboard, mode, notify, options, rtl, skipDetection, sources]);

  useEffect(() => () => {
    if (draftSaveTimer.current) clearTimeout(draftSaveTimer.current);
    const draft = latestDraft.current;
    const botId = loadedDraftBot.current;
    if (draft && botId) void saveRichDraft(botId, draft).catch(() => undefined);
  }, []);

  const setContent = (value: string) => setSources((current) => ({ ...current, [mode]: value }));

  const toggleLiveDraft = (enabled: boolean) => {
    liveDraftRequested.current = enabled;
    liveDraftLastSignature.current = "";
    liveDraftLastSuccessAt.current = 0;
    setLiveDraftSentAt(null);
    setLiveDraftEnabled(enabled);
  };

  const selectEditorTab = (tab: "visual" | RichMode) => {
    if (tab === "visual") {
      setMode("html");
      setEditorView("visual");
      return;
    }
    setMode(tab);
    setEditorView("source");
  };

  const insertSource = (snippet: string) => {
    const editor = sourceRef.current;
    const start = editor?.selectionStart ?? content.length;
    const end = editor?.selectionEnd ?? start;
    const separatorBefore = start > 0 && !content.slice(0, start).endsWith("\n") ? "\n" : "";
    const separatorAfter = end < content.length && !content.slice(end).startsWith("\n") ? "\n" : "";
    const addition = `${separatorBefore}${snippet}${separatorAfter}`;
    setContent(content.slice(0, start) + addition + content.slice(end));
    requestAnimationFrame(() => {
      editor?.focus();
      editor?.setSelectionRange(start + addition.length, start + addition.length);
    });
  };

  const appendBlock = (block: TgAny) => {
    try {
      const blocks = parseRichBlocks(sources.blocks);
      setSources((current) => ({ ...current, blocks: JSON.stringify([...blocks, block], null, 2) }));
    } catch (error) {
      notify(error instanceof Error ? error.message : "Fix block JSON before adding a block", "err");
    }
  };

  const addUploads = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.target.files || []);
    if (!selected.length) return;
    if (mode === "blocks") {
      setMode("html");
      setEditorView("visual");
    }
    const start = uploads.length;
    const added = selected.map((file, index): RichUpload => {
      const position = start + index + 1;
      return {
        id: `media_${position}`,
        field: `rich_file_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        kind: inferKind(file),
        file,
        previewUrl: URL.createObjectURL(file),
      };
    });
    setUploads((current) => [...current, ...added]);
    const targetMode = mode === "blocks" ? "html" : mode;
    setSources((current) => ({
      ...current,
      [targetMode]: `${current[targetMode].trimEnd()}\n${added.map((item) => richMediaMarkup(item, item.file.name)).join("\n")}`,
    }));
    notify(`${selected.length} media ${selected.length === 1 ? "file" : "files"} added`);
    event.target.value = "";
  };

  const updateUpload = (field: string, patch: Partial<Pick<RichUpload, "id" | "kind">>) => {
    setUploads((current) => current.map((item) => {
      if (item.field !== field) return item;
      if (patch.id && patch.id !== item.id) {
        setSources((sourcesNow) => ({
          ...sourcesNow,
          html: sourcesNow.html.replaceAll(`id=${item.id}`, `id=${patch.id}`),
          markdown: sourcesNow.markdown.replaceAll(`id=${item.id}`, `id=${patch.id}`),
        }));
      }
      return { ...item, ...patch };
    }));
  };

  const removeUpload = (field: string) => {
    const item = uploads.find((candidate) => candidate.field === field);
    if (item) URL.revokeObjectURL(item.previewUrl);
    setUploads((current) => current.filter((candidate) => candidate.field !== field));
  };

  const buildParams = () => {
    const richMessage = buildInputRichMessage(mode, content, rtl, skipDetection, descriptors);
    const chatId: number | string = /^-?\d+$/.test(target.trim()) ? Number(target) : target.trim();
    const suggested = parseOptionalObject(options.suggestedPostParameters, "suggested_post_parameters");
    const reply = options.useReply && replyTo && selectedChatId === target
      ? {
          message_id: replyTo.ephemeral_message_id ? undefined : replyTo.message_id,
          ephemeral_message_id: replyTo.ephemeral_message_id || undefined,
          allow_sending_without_reply: replyTo.ephemeral_message_id ? undefined : true,
        }
      : undefined;
    return {
      chat_id: chatId,
      message_thread_id: numberOrUndefined(options.messageThreadId),
      direct_messages_topic_id: numberOrUndefined(options.directMessagesTopicId),
      business_connection_id: options.businessConnectionId || undefined,
      rich_message: richMessage,
      disable_notification: options.disableNotification || undefined,
      protect_content: options.protectContent || undefined,
      allow_paid_broadcast: options.allowPaidBroadcast || undefined,
      message_effect_id: options.messageEffectId || undefined,
      suggested_post_parameters: suggested,
      reply_parameters: reply,
      reply_markup: buildReplyMarkup(keyboard),
    };
  };

  const payloadPreview = useMemo(() => {
    try {
      return target.trim() && validation.message ? buildParams() : { rich_message: validation.message };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Invalid delivery JSON" };
    }
    // buildParams is derived entirely from the listed state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, validation.message, options, keyboard, replyTo, selectedChatId]);

  const send = async (asDraft: boolean) => {
    if (!target.trim()) return notify("Open the chat that should receive this rich message", "err");
    if (validation.errors.length) return notify(validation.errors[0], "err");
    if (!asDraft && draftOnly) return notify("Remove the thinking block before sending the permanent message", "err");
    if (asDraft && !canStream) {
      return notify("Streamed rich drafts require a known private chat and cannot upload new files", "err");
    }
    if (!asDraft) {
      liveDraftRequested.current = false;
      setLiveDraftEnabled(false);
    }
    setBusy(asDraft ? "draft" : "send");
    try {
      if (!asDraft && liveDraftPending.current) await liveDraftPending.current;
      const customEmojis = extractRichCustomEmojis(mode, content);
      if (customEmojis.length) {
        const customEmojiResult = await call<TgAny[]>("getCustomEmojiStickers", {
          custom_emoji_ids: [...new Set(customEmojis.map((emoji) => emoji.id))],
        });
        if (!customEmojiResult.ok) return;
        const resolvedIds = new Set(
          (customEmojiResult.result || []).map((sticker) => String(sticker.custom_emoji_id || ""))
        );
        const missing = customEmojis.find((emoji) => !resolvedIds.has(emoji.id));
        if (missing) {
          notify(`Telegram could not resolve custom emoji ${missing.id}`, "err");
          return;
        }
      }
      const params = buildParams();
      const response = asDraft
        ? await call("sendRichMessageDraft", {
            chat_id: Number(target),
            message_thread_id: params.message_thread_id,
            draft_id: draftId,
            rich_message: params.rich_message,
          })
        : uploads.length
          ? await upload("sendRichMessage", params, Object.fromEntries(uploads.map((item) => [item.field, item.file])))
          : await call("sendRichMessage", params);
      if (response.ok) {
        notify(asDraft ? "30-second rich draft streamed" : "Rich message sent");
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not build the rich message", "err");
    } finally {
      setBusy(null);
    }
  };

  const exportStudio = () => {
    const saved: SavedStudio = { version: 1, mode, view: editorView, sources, rtl, skipDetection, draftId, keyboard, options };
    const blob = new Blob([JSON.stringify(saved, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `humanoid-rich-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importStudio = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      applySaved(JSON.parse(await file.text()) as SavedStudio);
      for (const item of uploads) URL.revokeObjectURL(item.previewUrl);
      setUploads([]);
      notify("Rich studio file imported; choose local media files again if needed");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not import this studio file", "err");
    }
    event.target.value = "";
  };

  const resetStudio = () => {
    if (!window.confirm("Replace the browser-saved rich draft with a new message?")) return;
    for (const item of uploads) URL.revokeObjectURL(item.previewUrl);
    setUploads([]);
    setSources(DEFAULT_RICH_SOURCES);
    setMode("html");
    setEditorView("visual");
    setLiveDraftEnabled(false);
    setLiveDraftSentAt(null);
    setRtl(false);
    setSkipDetection(false);
    setKeyboard(emptyKb);
    setOptions(DEFAULT_OPTIONS);
    setDraftId((Date.now() % 2_147_483_647) || 1);
  };

  return (
    <div className="rich-studio-backdrop">
      <section className="rich-studio" role="dialog" aria-modal="true" aria-label="Rich message studio">
        <header className="rich-studio-header">
          <div className="rich-studio-brand">
            <div className="rich-studio-logo"><IconDoc size={20} /></div>
            <div>
              <div style={{ fontWeight: 700 }}>Rich Message Studio</div>
              <div className="muted" style={{ fontSize: "0.7rem" }}>Native Bot API 10.2 content, media, keyboards, and streaming drafts</div>
            </div>
          </div>
          <div className="rich-studio-save muted">
            <IconCheck size={14} /> {savedAt ? `Saved in this browser ${new Date(savedAt).toLocaleTimeString()}` : "IndexedDB autosave ready"} · upload files stay session-only
          </div>
          <div className="rich-studio-header-actions">
            <button className="btn sm ghost" onClick={resetStudio}>New</button>
            <button className="btn sm ghost" onClick={() => importRef.current?.click()}>Import</button>
            <button className="btn sm ghost" onClick={exportStudio}>Export</button>
            <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={importStudio} />
            <button className="icon-btn" onClick={onClose} aria-label="Close Rich Message Studio"><IconClose size={21} /></button>
          </div>
        </header>

        <div className="rich-studio-grid">
          <aside className="rich-studio-sidebar scroll-y">
            <div className="rich-studio-section">
              <div className="section-title">Current chat</div>
              {selectedTargetChat ? (
                <div className="rich-target-card">
                  <span className="dot on" />
                  <div className="truncate-1"><strong>{chatName(selectedTargetChat.chat)}</strong><br /><span className="muted">{selectedTargetChat.chat.type} · {selectedTargetChat.chat.id}</span></div>
                </div>
              ) : (
                <p className="muted rich-studio-help">Close Studio and open a known chat. Rich Message Studio never restores or imports a different destination.</p>
              )}
              {replyTo && target && (
                <Toggle checked={options.useReply} onChange={(value) => setOptions({ ...options, useReply: value })} label={`Reply to: ${messagePreview(replyTo)}`} />
              )}
            </div>

            <div className="rich-studio-section rich-thinking-card">
              <div className="section-title">Live thinking draft</div>
              <label className={`rich-live-draft-toggle${!canStream ? " disabled" : ""}`}>
                <input
                  type="checkbox"
                  checked={liveDraftEnabled}
                  disabled={!canStream}
                  onChange={(event) => toggleLiveDraft(event.target.checked)}
                />
                <span>Stream unfinished input with Thinking every 3 seconds</span>
              </label>
              <p className="muted rich-studio-help">
                {streamUnavailableReason || (liveDraftEnabled
                  ? liveDraftSentAt
                    ? `Updated ${new Date(liveDraftSentAt).toLocaleTimeString()}`
                    : "Waiting for content…"
                  : "Publishes a temporary 30-second preview under this draft id while you type.")}
              </p>
            </div>

            <div className="rich-studio-section">
              <div className="section-title">Templates</div>
              <div className="rich-template-list">
                {RICH_TEMPLATES.map((template) => (
                  <button
                    key={template.id}
                    type="button"
                    className="rich-template"
                    title="Replace every representation without changing the active editor tab"
                    onClick={() => setSources(template.sources)}
                  >
                    <strong>{template.label}</strong>
                    <span>{template.description}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="rich-studio-section">
              <div className="section-title">Media library</div>
              <label className="rich-dropzone">
                <IconPhoto size={24} />
                <strong>Add photos, video, audio, GIFs, or voice</strong>
                <span>Files stream through the Worker on send.</span>
                <input type="file" multiple onChange={addUploads} hidden />
              </label>
              {uploads.map((item) => (
                <div className="rich-media-row" key={item.field}>
                  {item.kind === "photo" ? <img src={item.previewUrl} alt="" /> : <div className="rich-media-kind">{item.kind === "audio" || item.kind === "voice_note" ? "♪" : "▶"}</div>}
                  <div style={{ minWidth: 0 }}>
                    <input className="input mono" value={item.id} onChange={(event) => updateUpload(item.field, { id: event.target.value })} aria-label="Media id" />
                    <div className="truncate-1 muted" style={{ fontSize: "0.65rem" }}>{item.file.name}</div>
                  </div>
                  <Select value={item.kind} onChange={(event) => updateUpload(item.field, { kind: event.target.value as RichMediaKind })} options={["photo", "video", "animation", "audio", "voice_note"]} />
                  <button className="icon-btn" onClick={() => removeUpload(item.field)} aria-label={`Remove ${item.file.name}`}><IconClose size={16} /></button>
                </div>
              ))}
              {uploads.length > 0 && <p className="muted rich-studio-help">Changing a media id updates its source reference. Removing a file leaves the reference visible so validation can catch it.</p>}
            </div>

            <details className="rich-studio-details">
              <summary><IconKeyboard size={17} /> Interactive keyboard</summary>
              <div className="rich-details-body"><KeyboardBuilder value={keyboard} onChange={setKeyboard} /></div>
            </details>

            <details className="rich-studio-details">
              <summary>Delivery options</summary>
              <div className="rich-details-body">
                <Toggle checked={options.disableNotification} onChange={(value) => setOptions({ ...options, disableNotification: value })} label="Send silently" />
                <Toggle checked={options.protectContent} onChange={(value) => setOptions({ ...options, protectContent: value })} label="Protect from forwarding/saving" />
                <Toggle checked={options.allowPaidBroadcast} onChange={(value) => setOptions({ ...options, allowPaidBroadcast: value })} label="Allow paid broadcast (0.1 Stars/message)" />
                <Field label="Forum thread"><TextInput value={options.messageThreadId} onChange={(event) => setOptions({ ...options, messageThreadId: event.target.value })} placeholder="message_thread_id" /></Field>
                <Field label="Direct-messages topic"><TextInput value={options.directMessagesTopicId} onChange={(event) => setOptions({ ...options, directMessagesTopicId: event.target.value })} placeholder="direct_messages_topic_id" /></Field>
                <Field label="Business connection"><TextInput value={options.businessConnectionId} onChange={(event) => setOptions({ ...options, businessConnectionId: event.target.value })} /></Field>
                <Field label="Message effect"><TextInput value={options.messageEffectId} onChange={(event) => setOptions({ ...options, messageEffectId: event.target.value })} /></Field>
                <Field label="suggested_post_parameters (JSON)"><textarea className="textarea mono" rows={4} value={options.suggestedPostParameters} onChange={(event) => setOptions({ ...options, suggestedPostParameters: event.target.value })} placeholder="optional" /></Field>
              </div>
            </details>
          </aside>

          <main className="rich-studio-editor">
            <div className="rich-mode-tabs" role="tablist">
              {(["visual", "html", "markdown", "blocks"] as const).map((item) => {
                const active = item === "visual" ? editorView === "visual" : editorView === "source" && mode === item;
                return (
                  <button key={item} role="tab" aria-selected={active} className={active ? "active" : ""} onClick={() => selectEditorTab(item)}>
                    {item === "visual" ? "Block Editor" : item === "html" ? "HTML source" : item === "markdown" ? "Rich Markdown" : "Native blocks"}
                  </button>
                );
              })}
            </div>

            <div className="rich-insert-bar">
              {mode === "blocks" ? RICH_BLOCK_SNIPPETS.map((item) => (
                <button key={item.label} className="btn sm" onClick={() => appendBlock(item.block)}><IconPlus size={13} /> {item.label}</button>
              )) : (mode === "html" ? HTML_INSERTS : MARKDOWN_INSERTS).map(([label, snippet]) => (
                <button key={label} className="btn sm" onClick={() => editorView === "visual" ? wysiwygRef.current?.insertHtml(snippet) : insertSource(snippet)}><IconPlus size={13} /> {label}</button>
              ))}
            </div>

            <div className="rich-source-head">
              <div>
                <strong>{editorView === "visual" ? "WYSIWYG block canvas" : mode === "blocks" ? "InputRichBlock[]" : mode}</strong>
                <span className="muted"> · {content.length.toLocaleString()} characters{editorView === "visual" ? " · drag blocks · type / for commands" : ""}</span>
              </div>
              <div style={{ display: "flex", gap: "0.35rem" }}>
                <Toggle checked={rtl} onChange={setRtl} label="RTL" />
                <Toggle checked={skipDetection} onChange={setSkipDetection} label="Skip entities" />
              </div>
            </div>
            {editorView === "visual" ? (
              <RichWysiwygEditor
                ref={wysiwygRef}
                value={sources.html}
                onChange={(html) => setSources((current) => ({ ...current, html }))}
                rtl={rtl}
                media={uploads}
              />
            ) : (
              <textarea
                ref={sourceRef}
                className="rich-studio-source mono"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                spellCheck={mode !== "blocks"}
                aria-label="Rich message source"
              />
            )}

            <div className="rich-validation" aria-live="polite">
              {validation.errors.length === 0 ? <span className="rich-valid"><IconCheck size={14} /> Telegram payload is structurally ready</span> : validation.errors.map((error) => <span className="rich-invalid" key={error}>● {error}</span>)}
              {validation.warnings.map((warning) => <span className="rich-warning" key={warning}>● {warning}</span>)}
            </div>
          </main>

          <aside className="rich-studio-preview scroll-y">
            <div className="rich-preview-head">
              <div><strong>Telegram preview</strong><div className="muted">Safe local approximation; Telegram is the final renderer.</div></div>
              <span className="chip accent">Live</span>
            </div>
            <div className="rich-preview-canvas">
              <div className="rich-preview-message">
                <div className="rich-preview-bubble">
                  <RichMessagePreview mode={mode} content={content} rtl={rtl} media={uploads} />
                  {liveDraftEnabled && <div className="rich-thinking-preview"><span />Thinking…</div>}
                </div>
                <KeyboardPreview value={keyboard} />
              </div>
            </div>

            <details className="rich-payload" open>
              <summary><IconCode size={16} /> Request payload</summary>
              <pre>{JSON.stringify(payloadPreview, null, 2)}</pre>
              <button className="btn sm ghost" onClick={() => {
                navigator.clipboard?.writeText(JSON.stringify(payloadPreview, null, 2));
                notify("Request payload copied");
              }}><IconCopy size={14} /> Copy JSON</button>
            </details>

            <div className="rich-draft-controls">
              <Field label="Streaming draft id" hint="Private chats only; each update lasts 30 seconds.">
                <TextInput type="number" value={String(draftId)} onChange={(event) => setDraftId(Number(event.target.value) || 1)} />
              </Field>
              {!canStream && <div className="rich-studio-help muted">{streamUnavailableReason}</div>}
            </div>
          </aside>
        </div>

        <footer className="rich-studio-footer">
          <div className="muted rich-studio-footnote">
            <span>
              {liveDraftEnabled
                ? liveDraftSentAt
                  ? `Live draft updated ${new Date(liveDraftSentAt).toLocaleTimeString()}`
                  : "Live draft waiting for input…"
                : "Current-chat delivery only. Exactly one representation is sent; Thinking blocks are draft-only."}
            </span>
          </div>
          <button className="btn" disabled={busy !== null || liveDraftEnabled || !canStream || validation.errors.length > 0} onClick={() => void send(true)}>
            {busy === "draft" ? "Streaming…" : "Stream 30s draft"}
          </button>
          <button className="btn primary rich-send" disabled={busy !== null || !target.trim() || validation.errors.length > 0 || draftOnly} onClick={() => void send(false)}>
            <IconSend size={18} /> {busy === "send" ? "Sending…" : "Send rich message"}
          </button>
        </footer>
      </section>
    </div>
  );
}

function inferKind(file: File): RichMediaKind {
  const name = file.name.toLowerCase();
  if (file.type === "image/gif" || name.endsWith(".gif")) return "animation";
  if (file.type.startsWith("image/")) return "photo";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.includes("ogg") || name.endsWith(".oga") || name.endsWith(".opus")) return "voice_note";
  return "audio";
}

function numberOrUndefined(value: string): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number !== 0 ? number : undefined;
}

function parseOptionalObject(value: string, label: string): TgAny | undefined {
  if (!value.trim()) return undefined;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error(`${label} must be a JSON object`);
  return parsed as TgAny;
}
