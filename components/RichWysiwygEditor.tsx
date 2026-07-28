"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { PreviewMedia } from "./RichMessagePreview";

export interface RichWysiwygHandle {
  insertHtml: (html: string) => void;
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  rtl: boolean;
  media: PreviewMedia[];
}

const ALLOWED_TAGS = new Set([
  "a", "b", "strong", "i", "em", "u", "ins", "s", "strike", "del", "code", "mark",
  "sub", "sup", "tg-spoiler", "tg-reference", "tg-emoji", "tg-time", "tg-math", "h1", "h2",
  "h3", "h4", "h5", "h6", "p", "pre", "footer", "hr", "ul", "ol", "li", "blockquote",
  "aside", "img", "video", "audio", "figure", "figcaption", "cite", "tg-map", "tg-collage",
  "tg-slideshow", "table", "caption", "tr", "th", "td", "details", "summary",
  "tg-math-block", "tg-thinking", "br", "input",
]);

const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "form"]);

const RichWysiwygEditor = forwardRef<RichWysiwygHandle, Props>(function RichWysiwygEditor(
  { value, onChange, rtl, media },
  forwardedRef
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const lastEmitted = useRef("");
  const lastMediaSignature = useRef("");
  const mediaById = useMemo(() => new Map(media.map((item) => [item.id, item.previewUrl])), [media]);
  const mediaSignature = media.map((item) => `${item.id}:${item.previewUrl}`).join("|");

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) selectionRef.current = range.cloneRange();
  };

  const restoreSelection = () => {
    const range = selectionRef.current;
    const editor = editorRef.current;
    if (!range || !editor || !editor.contains(range.commonAncestorContainer)) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  };

  const sync = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const next = serializeEditor(editor);
    lastEmitted.current = next;
    onChange(next);
  };

  const insertHtml = (html: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    let range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
      range = document.createRange();
      range.selectNodeContents(editor);
      range.collapse(false);
    }
    const fragment = sanitizedFragment(html, document, mediaById, true);
    const lastNode = fragment.lastChild;
    range.deleteContents();
    range.insertNode(fragment);
    if (lastNode && selection) {
      range.setStartAfter(lastNode);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    rememberSelection();
    sync();
  };

  useImperativeHandle(forwardedRef, () => ({
    insertHtml,
    focus: () => editorRef.current?.focus(),
  }));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const mediaChanged = lastMediaSignature.current !== mediaSignature;
    if (value !== lastEmitted.current || mediaChanged) {
      editor.replaceChildren(sanitizedFragment(value, document, mediaById, true));
      selectionRef.current = null;
      const clean = serializeEditor(editor);
      lastEmitted.current = clean;
      lastMediaSignature.current = mediaSignature;
      if (clean !== value) onChange(clean);
    }
  }, [value, mediaById, mediaSignature]);

  const command = (name: string, argument?: string) => {
    editorRef.current?.focus();
    restoreSelection();
    document.execCommand(name, false, argument);
    rememberSelection();
    sync();
  };

  const wrapSelection = (tag: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    restoreSelection();
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const element = document.createElement(tag);
    if (range.collapsed) element.textContent = "text";
    else element.appendChild(range.extractContents());
    range.insertNode(element);
    range.selectNodeContents(element);
    selection.removeAllRanges();
    selection.addRange(range);
    rememberSelection();
    sync();
  };

  const linkSelection = () => {
    const href = window.prompt("Link URL", "https://");
    if (!href || !safeHref(href)) return;
    command("createLink", href);
  };

  const onPaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    if (html) {
      insertHtml(html);
      return;
    }
    const text = event.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    rememberSelection();
    sync();
  };

  const toolbar = [
    ["Undo", "↶", () => command("undo")],
    ["Redo", "↷", () => command("redo")],
    ["Bold", "B", () => command("bold")],
    ["Italic", "I", () => command("italic")],
    ["Underline", "U", () => command("underline")],
    ["Strike", "S", () => command("strikeThrough")],
    ["Code", "‹›", () => wrapSelection("code")],
    ["Highlight", "H", () => wrapSelection("mark")],
    ["Spoiler", "▨", () => wrapSelection("tg-spoiler")],
    ["Subscript", "x₂", () => wrapSelection("sub")],
    ["Superscript", "x²", () => wrapSelection("sup")],
    ["Link", "🔗", linkSelection],
    ["Bullet list", "• List", () => command("insertUnorderedList")],
    ["Numbered list", "1. List", () => command("insertOrderedList")],
  ] as const;

  return (
    <div className="rich-wysiwyg-shell">
      <div className="rich-wysiwyg-toolbar" aria-label="Rich formatting toolbar">
        {toolbar.map(([title, label, action], index) => (
          <button
            key={title}
            className={`rich-wysiwyg-tool${index === 2 || index === 12 ? " group-start" : ""}`}
            title={title}
            aria-label={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action}
          >
            {label}
          </button>
        ))}
        <span className="rich-wysiwyg-divider" />
        <select
          className="select rich-wysiwyg-format"
          defaultValue="p"
          onMouseDown={rememberSelection}
          onChange={(event) => command("formatBlock", event.target.value)}
          aria-label="Block style"
        >
          <option value="p">Paragraph</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="blockquote">Quote</option>
          <option value="pre">Code block</option>
        </select>
      </div>
      <div className="rich-wysiwyg-canvas">
        <div
          ref={editorRef}
          className="rich-wysiwyg rich-message"
          contentEditable
          suppressContentEditableWarning
          dir={rtl ? "rtl" : undefined}
          data-placeholder="Start composing a native Telegram rich message…"
          onFocus={() => {
            document.execCommand("defaultParagraphSeparator", false, "p");
            rememberSelection();
          }}
          onInput={() => {
            rememberSelection();
            sync();
          }}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onSelect={rememberSelection}
          onPaste={onPaste}
          onToggle={sync}
          onDrop={(event) => event.preventDefault()}
          onClick={(event) => {
            const target = event.target;
            if (target instanceof HTMLInputElement && target.type === "checkbox") {
              target.toggleAttribute("checked", target.checked);
              sync();
            }
          }}
          onBlur={sync}
        />
      </div>
    </div>
  );
});

export default RichWysiwygEditor;

function sanitizedFragment(
  source: string,
  targetDocument: Document,
  mediaById: Map<string, string>,
  visual: boolean
): DocumentFragment {
  const parsed = new DOMParser().parseFromString(normalizeSelfClosingTags(source), "text/html");
  const fragment = targetDocument.createDocumentFragment();
  for (const child of Array.from(parsed.body.childNodes)) {
    appendSanitized(child, fragment, targetDocument, mediaById, visual);
  }
  return fragment;
}

function appendSanitized(
  source: Node,
  parent: Node,
  targetDocument: Document,
  mediaById: Map<string, string>,
  visual: boolean
): void {
  if (source.nodeType === Node.TEXT_NODE) {
    parent.appendChild(targetDocument.createTextNode(source.textContent || ""));
    return;
  }
  if (source.nodeType !== Node.ELEMENT_NODE) return;
  const sourceElement = source as HTMLElement;
  let tag = sourceElement.tagName.toLowerCase();
  if (tag === "div") tag = "p";
  if (DROP_CONTENT.has(tag)) return;
  if (!ALLOWED_TAGS.has(tag)) {
    for (const child of Array.from(source.childNodes)) appendSanitized(child, parent, targetDocument, mediaById, visual);
    return;
  }
  if (tag === "input" && sourceElement.getAttribute("type")?.toLowerCase() !== "checkbox") return;

  const output = targetDocument.createElement(tag);
  copyAllowedAttributes(sourceElement, output, tag, mediaById, visual);
  for (const child of Array.from(source.childNodes)) appendSanitized(child, output, targetDocument, mediaById, visual);
  parent.appendChild(output);
}

function copyAllowedAttributes(
  source: HTMLElement,
  output: HTMLElement,
  tag: string,
  mediaById: Map<string, string>,
  visual: boolean
): void {
  const copy = (name: string, validate: (value: string) => boolean = Boolean) => {
    const value = source.getAttribute(name);
    if (value != null && validate(value)) output.setAttribute(name, value);
  };
  const boolean = (name: string) => {
    if (source.hasAttribute(name)) output.setAttribute(name, "");
  };

  if (tag === "a") {
    const href = safeHref(source.getAttribute("href") || "");
    if (href) output.setAttribute("href", href);
    copy("name", validIdentifier);
  }
  if (tag === "code") copy("class", (value) => /^language-[A-Za-z0-9_+-]+$/.test(value));
  if (tag === "ol") {
    copy("start", integer);
    copy("type", (value) => /^[aAiI1]$/.test(value));
    boolean("reversed");
  }
  if (tag === "li") {
    copy("value", integer);
    copy("type", (value) => /^[aAiI1]$/.test(value));
  }
  if (tag === "input") {
    output.setAttribute("type", "checkbox");
    if ((source as HTMLInputElement).checked || source.hasAttribute("checked")) booleanAttribute(output, "checked");
    if (visual) output.setAttribute("contenteditable", "false");
  }
  if (["img", "video", "audio"].includes(tag)) {
    const original = source.getAttribute("data-rich-source") || source.getAttribute("src") || "";
    if (safeMediaSource(original)) {
      if (visual) {
        const preview = resolveMediaPreview(original, mediaById);
        if (preview) output.setAttribute("src", preview);
        else if (original.startsWith("tg://emoji?")) output.setAttribute("data-rich-emoji", "true");
        else output.setAttribute("data-rich-missing", "true");
        output.setAttribute("data-rich-source", original);
        output.setAttribute("contenteditable", "false");
        if (tag === "video" || tag === "audio") output.setAttribute("controls", "");
      } else {
        output.setAttribute("src", original);
      }
    }
    if (tag === "img") copy("alt");
    boolean("tg-spoiler");
  }
  if (tag === "details") boolean("open");
  if (tag === "table") {
    boolean("bordered");
    boolean("striped");
  }
  if (tag === "td" || tag === "th") {
    copy("colspan", positiveInteger);
    copy("rowspan", positiveInteger);
    copy("align", (value) => ["left", "center", "right"].includes(value));
    copy("valign", (value) => ["top", "middle", "bottom"].includes(value));
  }
  if (tag === "tg-map") {
    copy("lat", (value) => numberInRange(value, -90, 90));
    copy("long", (value) => numberInRange(value, -180, 180));
    copy("zoom", (value) => integer(value) && numberInRange(value, 13, 20));
  }
  if (tag === "tg-reference") copy("name", validIdentifier);
  if (tag === "tg-emoji") copy("emoji-id", integer);
  if (tag === "tg-time") {
    copy("unix", integer);
    copy("format", (value) => value.length <= 32);
  }
}

function serializeEditor(editor: HTMLElement): string {
  const container = document.createElement("div");
  for (const child of Array.from(editor.childNodes)) appendSanitized(child, container, document, new Map(), false);
  return container.innerHTML.trim();
}

function resolveMediaPreview(source: string, mediaById: Map<string, string>): string | null {
  const match = source.match(/^tg:\/\/(?:photo|video|audio)\?id=([A-Za-z0-9_-]+)$/);
  if (match) return mediaById.get(match[1]) || null;
  return /^https?:\/\//i.test(source) ? source : null;
}

function safeHref(value: string): string | null {
  const trimmed = value.trim();
  if (/^#[A-Za-z0-9_-]{1,64}$/.test(trimmed)) return trimmed;
  try {
    const url = new URL(trimmed);
    return ["http:", "https:", "tg:", "mailto:", "tel:"].includes(url.protocol) ? trimmed : null;
  } catch {
    return null;
  }
}

function safeMediaSource(value: string): boolean {
  return /^(?:https?:\/\/[^\s]+|tg:\/\/(?:photo|video|audio|emoji)\?id=[A-Za-z0-9_-]{1,64})$/i.test(value);
}

function validIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function integer(value: string): boolean {
  return /^-?\d+$/.test(value);
}

function positiveInteger(value: string): boolean {
  return /^\d+$/.test(value) && Number(value) > 0;
}

function numberInRange(value: string, minimum: number, maximum: number): boolean {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number) && number >= minimum && number <= maximum;
}

function booleanAttribute(element: HTMLElement, name: string): void {
  element.setAttribute(name, "");
}

function normalizeSelfClosingTags(value: string): string {
  return value.replace(/<(video|audio|tg-map)(\s[^<>]*?)?\s*\/>/gi, (_match, tag: string, attributes = "") => (
    `<${tag}${attributes}></${tag}>`
  ));
}
