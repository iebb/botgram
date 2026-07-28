import type { TgAny } from "./types";

export type RichMode = "html" | "markdown" | "blocks";
export type RichMediaKind = "photo" | "video" | "animation" | "audio" | "voice_note";

/** Every element accepted by Bot API 10.2 Rich HTML, including draft-only thinking. */
export const RICH_HTML_TAGS = [
  "a",
  "b",
  "strong",
  "i",
  "em",
  "u",
  "ins",
  "s",
  "strike",
  "del",
  "code",
  "mark",
  "sub",
  "sup",
  "tg-spoiler",
  "tg-reference",
  "tg-emoji",
  "tg-time",
  "tg-math",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "pre",
  "footer",
  "hr",
  "ul",
  "ol",
  "li",
  "input",
  "blockquote",
  "aside",
  "cite",
  "img",
  "video",
  "audio",
  "figure",
  "figcaption",
  "tg-map",
  "tg-collage",
  "tg-slideshow",
  "table",
  "caption",
  "tr",
  "th",
  "td",
  "details",
  "summary",
  "tg-math-block",
  "tg-thinking",
  "br",
] as const;

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

export interface RichCustomEmojiReference {
  id: string;
  alternative: string;
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
  sources: RichSources;
}> = [
  {
    id: "announcement",
    label: "Announcement",
    description: "Heading, callout, checklist, and details",
    sources: {
      html: `<h1>Product update</h1>
<p>We just shipped <b>something worth sharing</b>.</p>
<aside>Fast, focused, and available now.<cite>Your team</cite></aside>
<h3>What changed</h3>
<ul>
  <li><input type="checkbox" checked> First improvement</li>
  <li><input type="checkbox" checked> Second improvement</li>
</ul>
<details><summary>Release notes</summary><p>Add the full details here.</p></details>`,
      markdown: `# Product update

We just shipped **something worth sharing**.

<aside>Fast, focused, and available now.<cite>Your team</cite></aside>

### What changed
- [x] First improvement
- [x] Second improvement

<details><summary>Release notes</summary>Add the full details here.</details>`,
      blocks: JSON.stringify([
        { type: "heading", size: 1, text: "Product update" },
        { type: "paragraph", text: ["We just shipped ", { type: "bold", text: "something worth sharing" }, "."] },
        { type: "pullquote", text: "Fast, focused, and available now.", credit: "Your team" },
        { type: "heading", size: 3, text: "What changed" },
        {
          type: "list",
          items: [
            { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: "First improvement" }] },
            { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: "Second improvement" }] },
          ],
        },
        { type: "details", summary: "Release notes", blocks: [{ type: "paragraph", text: "Add the full details here." }] },
      ], null, 2),
    },
  },
  {
    id: "status",
    label: "Status report",
    description: "Structured metrics and progress",
    sources: {
      html: `<h2>Weekly status</h2>
<p><b>Overall:</b> On track ✅</p>
<table bordered striped><tr><th>Workstream</th><th>State</th><th>Owner</th></tr><tr><td>Product</td><td><b>Green</b></td><td>Team A</td></tr><tr><td>Operations</td><td><b>Green</b></td><td>Team B</td></tr></table>
<h3>Highlights</h3>
<ul><li><input type="checkbox" checked> Completed milestone</li><li><input type="checkbox"> Next milestone</li></ul>
<blockquote>Add risks, decisions, and next actions here.</blockquote>`,
      markdown: `## Weekly status

**Overall:** On track ✅

| Workstream | State | Owner |
|:--|:--:|--:|
| Product | **Green** | Team A |
| Operations | **Green** | Team B |

### Highlights
- [x] Completed milestone
- [ ] Next milestone

> Add risks, decisions, and next actions here.`,
      blocks: JSON.stringify([
        { type: "heading", size: 2, text: "Weekly status" },
        { type: "paragraph", text: [{ type: "bold", text: "Overall:" }, " On track ✅"] },
        {
          type: "table",
          is_bordered: true,
          is_striped: true,
          cells: [
            [{ text: "Workstream", is_header: true }, { text: "State", is_header: true }, { text: "Owner", is_header: true }],
            [{ text: "Product" }, { text: { type: "bold", text: "Green" } }, { text: "Team A" }],
            [{ text: "Operations" }, { text: { type: "bold", text: "Green" } }, { text: "Team B" }],
          ],
        },
        { type: "heading", size: 3, text: "Highlights" },
        {
          type: "list",
          items: [
            { has_checkbox: true, is_checked: true, blocks: [{ type: "paragraph", text: "Completed milestone" }] },
            { has_checkbox: true, blocks: [{ type: "paragraph", text: "Next milestone" }] },
          ],
        },
        { type: "blockquote", blocks: [{ type: "paragraph", text: "Add risks, decisions, and next actions here." }] },
      ], null, 2),
    },
  },
  {
    id: "interactive",
    label: "Interactive card",
    description: "Native blocks designed for a keyboard",
    sources: {
      html: `<h2>Choose an action</h2>
<p>Use the keyboard editor to add callbacks, links, Web Apps, or copy buttons.</p>
<hr>
<footer>The keyboard is sent with the rich message.</footer>`,
      markdown: `## Choose an action

Use the keyboard editor to add callbacks, links, Web Apps, or copy buttons.

---

<footer>The keyboard is sent with the rich message.</footer>`,
      blocks: JSON.stringify([
        { type: "heading", size: 2, text: "Choose an action" },
        { type: "paragraph", text: "Use the keyboard editor to add callbacks, links, Web Apps, or copy buttons." },
        { type: "divider" },
        { type: "footer", text: "The keyboard is sent with the rich message." },
      ], null, 2),
    },
  },
  {
    id: "ai-draft",
    label: "Streaming answer",
    description: "A temporary 30-second AI-style draft",
    sources: {
      html: `<h2>Working on your answer</h2>
<tg-thinking>Checking the latest information…</tg-thinking>
<p>The partial response can be replaced under the same <code>draft_id</code>.</p>`,
      markdown: `## Working on your answer

<tg-thinking>Checking the latest information…</tg-thinking>

The partial response can be replaced under the same \`draft_id\`.`,
      blocks: JSON.stringify([
        { type: "heading", size: 2, text: "Working on your answer" },
        { type: "thinking", text: "Checking the latest information…" },
        { type: "paragraph", text: ["The partial response can be replaced under the same ", { type: "code", text: "draft_id" }, "."] },
      ], null, 2),
    },
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

/** Builds an ephemeral rich draft with Telegram's native Thinking block last. */
export function buildThinkingRichDraft(
  mode: RichMode,
  content: string,
  rtl: boolean,
  skipDetection: boolean
): TgAny {
  if (containsThinkingBlock(mode, content)) {
    return buildInputRichMessage(mode, content, rtl, skipDetection, []);
  }

  if (mode === "blocks") {
    return buildInputRichMessage(
      mode,
      JSON.stringify([
        ...parseRichBlocks(content),
        { type: "thinking", text: "Thinking…" },
      ]),
      rtl,
      skipDetection,
      []
    );
  }

  const separator = content.trimEnd() ? "\n" : "";
  return buildInputRichMessage(
    mode,
    `${content.trimEnd()}${separator}<tg-thinking>Thinking…</tg-thinking>`,
    rtl,
    skipDetection,
    []
  );
}

/** Safely represents ordinary composer text inside a native rich HTML draft. */
export function buildPlainTextThinkingDraft(content: string): TgAny {
  const html = plainTextRichHtml(content);
  return buildThinkingRichDraft("html", html, false, false);
}

/** Builds the persistent counterpart used to finalize a streamed composer draft. */
export function buildPlainTextRichMessage(content: string): TgAny {
  return buildInputRichMessage("html", plainTextRichHtml(content), false, false, []);
}

function plainTextRichHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/\r?\n/g, "<br>");
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

  const customEmojis = extractRichCustomEmojis(mode, content);
  if (mode !== "blocks") {
    const customEmojiTags = [...content.matchAll(/<tg-emoji\b/gi)].length;
    const completeTags = [...content.matchAll(/<tg-emoji\b[^>]*>[\s\S]*?<\/tg-emoji\s*>/gi)].length;
    if (customEmojiTags !== completeTags) errors.push("Every tg-emoji element needs a closing tag and fallback emoji.");
  }
  for (const customEmoji of customEmojis) {
    if (!/^\d+$/.test(customEmoji.id)) {
      errors.push("Each custom emoji needs a numeric Telegram custom emoji id.");
    }
    if (!validEmojiAlternative(customEmoji.alternative)) {
      errors.push(`Custom emoji ${customEmoji.id || "(missing id)"} needs exactly one valid fallback emoji.`);
    }
  }
  if (customEmojis.length) {
    warnings.push(
      "Telegram permits custom emoji only for eligible bots/chats; owner Premium or Fragment username rules still apply."
    );
  }

  try {
    message = buildInputRichMessage(mode, content, rtl, skipDetection, media);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : "Invalid structured blocks");
  }

  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)], message };
}

export function extractRichCustomEmojis(
  mode: RichMode,
  content: string
): RichCustomEmojiReference[] {
  const references: RichCustomEmojiReference[] = [];
  if (mode === "blocks") {
    try {
      const visit = (value: unknown) => {
        if (Array.isArray(value)) {
          value.forEach(visit);
          return;
        }
        if (!value || typeof value !== "object") return;
        const object = value as TgAny;
        if (object.type === "custom_emoji") {
          references.push({
            id: String(object.custom_emoji_id || ""),
            alternative: String(object.alternative_text || ""),
          });
        }
        Object.values(object).forEach(visit);
      };
      visit(parseRichBlocks(content));
    } catch {
      return [];
    }
    return uniqueCustomEmojiReferences(references);
  }

  for (const match of content.matchAll(/<tg-emoji\b([^>]*)>([\s\S]*?)<\/tg-emoji\s*>/gi)) {
    references.push({
      id: htmlAttribute(match[1], "emoji-id"),
      alternative: decodeRichHtml(match[2].replace(/<[^>]*>/g, "")),
    });
  }
  for (const match of content.matchAll(/<img\b([^>]*)>/gi)) {
    const source = decodeRichHtml(htmlAttribute(match[1], "src"));
    const id = richCustomEmojiId(source);
    if (id !== undefined) {
      references.push({ id, alternative: decodeRichHtml(htmlAttribute(match[1], "alt")) });
    }
  }
  for (const match of content.matchAll(/!\[([^\]]*)\]\((tg:\/\/emoji\?[^)]*)\)/gi)) {
    references.push({ id: richCustomEmojiId(match[2]) ?? "", alternative: match[1] });
  }
  return uniqueCustomEmojiReferences(references);
}

export function validEmojiAlternative(value: string): boolean {
  if (!value || value !== value.trim()) return false;
  const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
  if ([...segmenter.segment(value)].length !== 1) return false;
  const regionalIndicators = [...value].filter((character) => /\p{Regional_Indicator}/u.test(character));
  if (regionalIndicators.length) return regionalIndicators.length === 2;
  return /\p{Extended_Pictographic}/u.test(value) || /[0-9#*]\uFE0F?\u20E3/u.test(value);
}

function uniqueCustomEmojiReferences(
  references: RichCustomEmojiReference[]
): RichCustomEmojiReference[] {
  return [...new Map(
    references.map((reference) => [`${reference.id}\u0000${reference.alternative}`, reference])
  ).values()];
}

/** Returns undefined for an ordinary URI and an empty string for malformed custom-emoji markup. */
function richCustomEmojiId(source: string): string | undefined {
  if (!/^tg:\/\/emoji\?/i.test(source)) return undefined;
  return source.match(/^tg:\/\/emoji\?id=([^&\s]+)$/i)?.[1] || "";
}

function htmlAttribute(attributes: string, name: string): string {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = attributes.match(new RegExp(
    `(?:^|\\s)${escapedName}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`,
    "i"
  ));
  return match?.[1] ?? match?.[2] ?? match?.[3] ?? "";
}

function decodeRichHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal: string) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&");
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
