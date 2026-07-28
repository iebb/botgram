import type { TgAny } from "./types";

export type RichMode = "html" | "markdown" | "blocks";
export type RichMediaKind = "photo" | "video" | "animation" | "audio" | "voice_note";

export interface RichMediaDescriptor {
  id: string;
  field: string;
  kind: RichMediaKind;
}

export interface RichSources {
  html: string;
  markdown: string;
  blocks: string;
}

export interface RichValidation {
  errors: string[];
  warnings: string[];
  message?: TgAny;
}

export const DEFAULT_RICH_SOURCES: RichSources = {
  html: `<h2>Native rich message</h2>
<p>Hello <b>from Humanoid</b> — with <u>structured formatting</u>, <tg-spoiler>spoilers</tg-spoiler>, and <a href="https://telegram.org">safe links</a>.</p>
<hr/>
<ul>
  <li><input type="checkbox" checked> Shipped the real-time dashboard</li>
  <li><input type="checkbox"> Add your next task</li>
</ul>
<blockquote>Rich messages are rendered as native Telegram blocks.<cite>Bot API 10.2</cite></blockquote>
<details><summary>More details</summary><p>Expandable content lives here.</p></details>`,
  markdown: `## Native rich message

Hello **from Humanoid** — rich Markdown, tables, media, and more.

- [x] Shipped the real-time dashboard
- [ ] Add your next task

> Rich messages are rendered as native Telegram blocks.

| Capability | Status |
|:--|--:|
| Webhook | **Live** |
| WebSocket | **Live** |`,
  blocks: JSON.stringify(
    [
      { type: "heading", size: 2, text: "Native rich message" },
      {
        type: "paragraph",
        text: ["Hello ", { type: "bold", text: "from Humanoid" }, " — sent as structured blocks."],
      },
      { type: "divider" },
      {
        type: "list",
        items: [
          { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: "Shipped the dashboard" }] },
          { has_checkbox: true, blocks: [{ type: "paragraph", text: "Add your next task" }] },
        ],
      },
      {
        type: "details",
        summary: "More details",
        blocks: [{ type: "paragraph", text: "Expandable structured content." }],
      },
    ],
    null,
    2
  ),
};

export const RICH_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  mode: RichMode;
  content: string;
}> = [
  {
    id: "announcement",
    label: "Announcement",
    description: "Heading, callout, checklist, and details",
    mode: "html",
    content: `<h1>Product update</h1>
<p>We just shipped <b>something worth sharing</b>.</p>
<aside>Fast, focused, and available now.<cite>Your team</cite></aside>
<h3>What changed</h3>
<ul>
  <li><input type="checkbox" checked> First improvement</li>
  <li><input type="checkbox" checked> Second improvement</li>
</ul>
<details><summary>Release notes</summary><p>Add the full details here.</p></details>`,
  },
  {
    id: "status",
    label: "Status report",
    description: "Structured metrics and progress",
    mode: "markdown",
    content: `## Weekly status

**Overall:** On track ✅

| Workstream | State | Owner |
|:--|:--:|--:|
| Product | **Green** | Team A |
| Operations | **Green** | Team B |

### Highlights
- [x] Completed milestone
- [ ] Next milestone

> Add risks, decisions, and next actions here.`,
  },
  {
    id: "interactive",
    label: "Interactive card",
    description: "Native blocks designed for a keyboard",
    mode: "blocks",
    content: JSON.stringify(
      [
        { type: "heading", size: 2, text: "Choose an action" },
        { type: "paragraph", text: "Use the keyboard editor to add callbacks, links, Web Apps, or copy buttons." },
        { type: "divider" },
        { type: "footer", text: "The keyboard is sent with the rich message." },
      ],
      null,
      2
    ),
  },
  {
    id: "ai-draft",
    label: "Streaming answer",
    description: "A temporary 30-second AI-style draft",
    mode: "html",
    content: `<h2>Working on your answer</h2>
<tg-thinking>Checking the latest information…</tg-thinking>
<p>The partial response can be replaced under the same <code>draft_id</code>.</p>`,
  },
];

export const RICH_BLOCK_SNIPPETS: Array<{ label: string; block: TgAny }> = [
  { label: "Paragraph", block: { type: "paragraph", text: "Paragraph text" } },
  { label: "Heading", block: { type: "heading", size: 2, text: "Section heading" } },
  { label: "Divider", block: { type: "divider" } },
  { label: "Code", block: { type: "pre", language: "typescript", text: "const ready = true;" } },
  {
    label: "Checklist",
    block: {
      type: "list",
      items: [
        { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: "Completed item" }] },
        { has_checkbox: true, blocks: [{ type: "paragraph", text: "Open item" }] },
      ],
    },
  },
  {
    label: "Quote",
    block: {
      type: "blockquote",
      blocks: [{ type: "paragraph", text: "Quoted text" }],
      credit: "Source",
    },
  },
  {
    label: "Details",
    block: {
      type: "details",
      summary: "More details",
      blocks: [{ type: "paragraph", text: "Expandable content" }],
    },
  },
  {
    label: "Table",
    block: {
      type: "table",
      is_bordered: true,
      is_striped: true,
      caption: "Table caption",
      cells: [
        [{ text: "Name", is_header: true }, { text: "Value", is_header: true }],
        [{ text: "Latency" }, { text: "Realtime" }],
      ],
    },
  },
  {
    label: "Map",
    block: {
      type: "map",
      location: { latitude: 35.681236, longitude: 139.767125 },
      zoom: 14,
      width: 640,
      height: 360,
      caption: { text: "Tokyo" },
    },
  },
  { label: "Math", block: { type: "mathematical_expression", expression: "E = mc^2" } },
  { label: "Thinking", block: { type: "thinking", text: "Thinking…" } },
];

export function parseRichBlocks(value: string): TgAny[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed)) throw new Error("Structured blocks must be a JSON array");
  for (const [index, block] of parsed.entries()) {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error(`Block ${index + 1} must be an object`);
    }
    if (typeof (block as TgAny).type !== "string" || !(block as TgAny).type) {
      throw new Error(`Block ${index + 1} needs a type`);
    }
  }
  return parsed as TgAny[];
}

export function buildInputRichMessage(
  mode: RichMode,
  content: string,
  rtl: boolean,
  skipDetection: boolean,
  media: RichMediaDescriptor[]
): TgAny {
  const result: TgAny = {};
  if (mode === "blocks") result.blocks = parseRichBlocks(content);
  else result[mode] = content;
  if (media.length) {
    result.media = media.map((item) => ({
      id: item.id,
      media: { type: item.kind, media: `attach://${item.field}` },
    }));
  }
  if (rtl) result.is_rtl = true;
  if (skipDetection) result.skip_entity_detection = true;
  return result;
}

export function validateRichMessage(
  mode: RichMode,
  content: string,
  rtl: boolean,
  skipDetection: boolean,
  media: RichMediaDescriptor[]
): RichValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  let message: TgAny | undefined;

  if (!content.trim()) errors.push("Content is empty.");
  if (mode === "blocks" && media.length) {
    errors.push("The upload library is for HTML or Markdown. Put InputMedia objects directly in structured blocks.");
  }

  const seen = new Set<string>();
  for (const item of media) {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(item.id)) {
      errors.push(`Media id “${item.id}” must be 1-64 letters, digits, underscores, or hyphens.`);
    }
    if (seen.has(item.id)) errors.push(`Media id “${item.id}” is duplicated.`);
    seen.add(item.id);
  }

  if (mode !== "blocks") {
    const referenced = extractRichMediaIds(content);
    for (const id of referenced) {
      if (!seen.has(id)) errors.push(`Source references media “${id}”, but it is not in the upload library.`);
    }
    for (const item of media) {
      if (!referenced.has(item.id)) warnings.push(`Uploaded media “${item.id}” is not referenced in the source.`);
    }
  }
  if (containsThinkingBlock(mode, content)) {
    warnings.push("Thinking blocks are temporary and can only be sent with sendRichMessageDraft.");
  }

  try {
    message = buildInputRichMessage(mode, content, rtl, skipDetection, media);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid structured blocks");
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], message };
}

export function containsThinkingBlock(mode: RichMode, content: string): boolean {
  if (mode !== "blocks") return /<tg-thinking(?:\s|>)/i.test(content);
  try {
    const visit = (value: unknown): boolean => {
      if (Array.isArray(value)) return value.some(visit);
      if (!value || typeof value !== "object") return false;
      const object = value as TgAny;
      return object.type === "thinking" || Object.values(object).some(visit);
    };
    return visit(parseRichBlocks(content));
  } catch {
    return false;
  }
}

export function extractRichMediaIds(content: string): Set<string> {
  const result = new Set<string>();
  for (const match of content.matchAll(/tg:\/\/(?:photo|video|audio)\?id=([A-Za-z0-9_-]+)/g)) {
    result.add(match[1]);
  }
  return result;
}

export function richMediaMarkup(item: RichMediaDescriptor, caption = "Media"): string {
  const protocol = item.kind === "photo"
    ? "photo"
    : item.kind === "audio" || item.kind === "voice_note"
      ? "audio"
      : "video";
  const source = `tg://${protocol}?id=${item.id}`;
  const safeCaption = escapeHtml(caption);
  if (item.kind === "photo") return `<figure><img src="${source}"/><figcaption>${safeCaption}</figcaption></figure>`;
  if (item.kind === "audio" || item.kind === "voice_note") {
    return `<figure><audio src="${source}"></audio><figcaption>${safeCaption}</figcaption></figure>`;
  }
  return `<figure><video src="${source}"></video><figcaption>${safeCaption}</figcaption></figure>`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
