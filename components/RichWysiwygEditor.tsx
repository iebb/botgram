"use client";

import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import type { PreviewMedia } from "./RichMessagePreview";
import { RICH_HTML_TAGS, validEmojiAlternative } from "@/lib/rich";
import { useStore } from "./Store";
import type { TgAny } from "@/lib/types";

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

interface FloatingMenu {
  blockId: string;
  x: number;
  y: number;
}

interface SlashMenu extends FloatingMenu {
  query: string;
}

interface BlockCommand {
  id: string;
  label: string;
  hint: string;
  icon: string;
  html: string;
}

const BLOCK_COMMANDS: BlockCommand[] = [
  { id: "text", label: "Text", hint: "Plain paragraph", icon: "T", html: "<p>Type something</p>" },
  { id: "heading-1", label: "Heading 1", hint: "Large section heading", icon: "H1", html: "<h1>Heading</h1>" },
  { id: "heading-2", label: "Heading 2", hint: "Medium section heading", icon: "H2", html: "<h2>Heading</h2>" },
  { id: "heading-3", label: "Heading 3", hint: "Small section heading", icon: "H3", html: "<h3>Heading</h3>" },
  { id: "heading-4", label: "Heading 4", hint: "Fourth-level heading", icon: "H4", html: "<h4>Heading</h4>" },
  { id: "heading-5", label: "Heading 5", hint: "Fifth-level heading", icon: "H5", html: "<h5>Heading</h5>" },
  { id: "heading-6", label: "Heading 6", hint: "Sixth-level heading", icon: "H6", html: "<h6>Heading</h6>" },
  { id: "bullets", label: "Bulleted list", hint: "Simple bullet list", icon: "•", html: "<ul><li>List item</li></ul>" },
  { id: "numbers", label: "Numbered list", hint: "Ordered steps", icon: "1.", html: "<ol><li>List item</li></ol>" },
  { id: "todo", label: "To-do list", hint: "Track an item", icon: "☑", html: '<ul><li><input type="checkbox"> To-do</li></ul>' },
  { id: "quote", label: "Quote", hint: "Capture a quotation", icon: "❝", html: "<blockquote>Quoted text</blockquote>" },
  { id: "callout", label: "Callout", hint: "Highlight something important", icon: "💡", html: "<aside>Important callout<cite>Source</cite></aside>" },
  { id: "code", label: "Code", hint: "Preformatted code block", icon: "‹›", html: "<pre><code>const ready = true;</code></pre>" },
  { id: "footer", label: "Footer", hint: "Muted footer text", icon: "Ft", html: "<footer>Footer text</footer>" },
  { id: "anchor", label: "Anchor", hint: "In-document link target", icon: "#", html: '<a name="section"></a>' },
  { id: "reference", label: "Reference", hint: "Footnote-style reference", icon: "⁝", html: '<tg-reference name="note">Referenced text</tg-reference>' },
  { id: "divider", label: "Divider", hint: "Separate sections", icon: "—", html: "<hr>" },
  { id: "details", label: "Toggle", hint: "Collapsible details", icon: "▸", html: "<details open><summary>More details</summary><p>Expandable content</p></details>" },
  { id: "table", label: "Table", hint: "Two-column table", icon: "▦", html: "<table bordered striped><tr><th>Name</th><th>Value</th></tr><tr><td>Latency</td><td>Realtime</td></tr></table>" },
  { id: "map", label: "Map", hint: "Telegram map block", icon: "⌖", html: '<tg-map lat="35.681236" long="139.767125" zoom="14"></tg-map>' },
  { id: "math", label: "Math", hint: "Display formula", icon: "∑", html: "<tg-math-block>E = mc^2</tg-math-block>" },
  { id: "thinking", label: "Thinking", hint: "Draft-only thinking block", icon: "◌", html: "<tg-thinking>Thinking…</tg-thinking>" },
];

const ALLOWED_TAGS = new Set<string>(RICH_HTML_TAGS);

const DROP_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "svg", "math", "form"]);

const RichWysiwygEditor = forwardRef<RichWysiwygHandle, Props>(function RichWysiwygEditor(
  { value, onChange, rtl, media },
  forwardedRef
) {
  const { call, notify } = useStore();
  const editorRef = useRef<HTMLDivElement>(null);
  const selectionRef = useRef<Range | null>(null);
  const lastEmitted = useRef("");
  const lastMediaSignature = useRef("");
  const draggedBlock = useRef<string | null>(null);
  const dragTarget = useRef<HTMLElement | null>(null);
  const [blockMenu, setBlockMenu] = useState<FloatingMenu | null>(null);
  const [slashMenu, setSlashMenu] = useState<SlashMenu | null>(null);
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
    const fragment = sanitizedFragment(html, document, mediaById, true);
    const nodes = Array.from(fragment.childNodes);
    if (!nodes.length) return;
    const selected = selectedBlock(editor, selectionRef.current);
    let anchor = selected;
    for (const node of nodes) {
      const block = makeBlock(node, document);
      if (anchor?.parentElement === editor) insertAfter(anchor, block);
      else editor.appendChild(block);
      anchor = block;
    }
    const body = anchor?.querySelector<HTMLElement>(".rich-block-content");
    if (body) focusBody(body, false);
    rememberSelection();
    sync();
  };

  useImperativeHandle(forwardedRef, () => ({
    insertHtml,
    focus: () => {
      const body = editorRef.current?.querySelector<HTMLElement>(".rich-block-content");
      if (body) focusBody(body, false);
    },
  }));

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const mediaChanged = lastMediaSignature.current !== mediaSignature;
    if (value !== lastEmitted.current || mediaChanged) {
      replaceBlocks(editor, value, mediaById);
      selectionRef.current = null;
      const clean = serializeEditor(editor);
      lastEmitted.current = clean;
      lastMediaSignature.current = mediaSignature;
      if (clean !== value) onChange(clean);
    }
  }, [value, mediaById, mediaSignature, onChange]);

  useEffect(() => {
    const closeMenus = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".rich-floating-menu, [data-block-action]")) return;
      setBlockMenu(null);
      setSlashMenu(null);
    };
    window.addEventListener("pointerdown", closeMenus);
    return () => window.removeEventListener("pointerdown", closeMenus);
  }, []);

  const command = (name: string, argument?: string) => {
    restoreSelection();
    document.execCommand(name, false, argument);
    rememberSelection();
    sync();
  };

  const wrapSelection = (
    tag: string,
    attributes: Record<string, string> = {},
    fallbackText = "text",
    replaceContent = false
  ) => {
    restoreSelection();
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    if (replaceContent) {
      range.deleteContents();
      element.textContent = fallbackText;
    } else if (range.collapsed) element.textContent = fallbackText;
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

  const referenceSelection = () => {
    const name = window.prompt("Reference name", "note-1")?.trim() || "";
    if (!validIdentifier(name)) return;
    wrapSelection("tg-reference", { name }, "Referenced text");
  };

  const customEmojiSelection = async () => {
    const emojiId = window.prompt("Telegram custom emoji id", "5368324170671202286")?.trim() || "";
    if (!/^\d+$/.test(emojiId)) {
      notify("Enter a numeric Telegram custom emoji id", "err");
      return;
    }
    const response = await call<TgAny[]>("getCustomEmojiStickers", {
      custom_emoji_ids: [emojiId],
    });
    const sticker = response.result?.find((item) => String(item.custom_emoji_id || "") === emojiId);
    if (!response.ok || !sticker) {
      if (response.ok) notify("Telegram could not resolve that custom emoji", "err");
      return;
    }
    const recommended = typeof sticker.emoji === "string" && sticker.emoji ? sticker.emoji : "👍";
    const alternative = window.prompt(
      "Fallback emoji (Telegram recommends the sticker emoji)",
      recommended
    )?.trim() || "";
    if (!validEmojiAlternative(alternative)) {
      notify("The custom emoji fallback must be exactly one valid emoji", "err");
      return;
    }
    wrapSelection("tg-emoji", { "emoji-id": emojiId }, alternative, true);
  };

  const timeSelection = () => {
    const unix = window.prompt("Unix timestamp", String(Math.floor(Date.now() / 1000)))?.trim() || "";
    if (!integer(unix)) return;
    const format = window.prompt("Telegram date-time format", "wDT")?.trim() || "wDT";
    wrapSelection("tg-time", { unix, format }, "Formatted time");
  };

  const applyBlockCommand = (commandItem: BlockCommand, blockId: string) => {
    const editor = editorRef.current;
    const block = editor?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    const body = block?.querySelector<HTMLElement>(".rich-block-content");
    if (!body) return;
    body.replaceChildren(sanitizedFragment(commandItem.html, document, mediaById, true));
    setSlashMenu(null);
    setBlockMenu(null);
    focusBody(body, false);
    rememberSelection();
    sync();
  };

  const mutateBlock = (operation: "duplicate" | "delete" | "up" | "down", blockId: string) => {
    const editor = editorRef.current;
    const block = editor?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    if (!editor || !block) return;
    if (operation === "duplicate") {
      const body = block.querySelector<HTMLElement>(".rich-block-content");
      if (body) {
        const duplicate = makeBlockFromHtml(serializeBlockBody(body), document, mediaById);
        insertAfter(block, duplicate);
        const nextBody = duplicate.querySelector<HTMLElement>(".rich-block-content");
        if (nextBody) focusBody(nextBody, false);
      }
    } else if (operation === "delete") {
      const sibling = block.previousElementSibling || block.nextElementSibling;
      if (editor.children.length === 1) {
        const body = block.querySelector<HTMLElement>(".rich-block-content");
        body?.replaceChildren(emptyParagraph(document));
        if (body) focusBody(body, true);
      } else {
        block.remove();
        const body = sibling?.querySelector<HTMLElement>(".rich-block-content");
        if (body) focusBody(body, false);
      }
    } else if (operation === "up" && block.previousElementSibling) {
      block.parentNode?.insertBefore(block, block.previousElementSibling);
    } else if (operation === "down" && block.nextElementSibling) {
      insertAfter(block.nextElementSibling, block);
    }
    setBlockMenu(null);
    sync();
  };

  const transformBlock = (
    tag: "p" | "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "blockquote" | "pre",
    blockId: string
  ) => {
    const block = editorRef.current?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(blockId)}"]`);
    const body = block?.querySelector<HTMLElement>(".rich-block-content");
    if (!body) return;
    const element = document.createElement(tag);
    const source = body.children.length === 1 ? body.firstElementChild : null;
    const canPreserveInline = source && ["P", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE"].includes(source.tagName);
    if (canPreserveInline && source) {
      while (source.firstChild) element.appendChild(source.firstChild);
    } else {
      element.textContent = body.textContent || (tag === "p" ? "Type something" : "Heading");
    }
    if (tag === "pre") {
      const code = document.createElement("code");
      while (element.firstChild) code.appendChild(element.firstChild);
      element.appendChild(code);
    }
    body.replaceChildren(element);
    setBlockMenu(null);
    focusBody(body, false);
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
    ["Inline math", "ƒ", () => wrapSelection("tg-math", {}, "x^2 + y^2")],
    ["Reference", "Ref", referenceSelection],
    ["Custom emoji", "🙂", () => void customEmojiSelection()],
    ["Date and time", "Time", timeSelection],
    ["Link", "🔗", linkSelection],
  ] as const;

  const visibleCommands = slashMenu
    ? BLOCK_COMMANDS.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(slashMenu.query.toLowerCase()))
    : [];

  return (
    <div className="rich-wysiwyg-shell">
      <div className="rich-wysiwyg-toolbar" aria-label="Rich formatting toolbar">
        {toolbar.map(([title, label, action], index) => (
          <button
            key={title}
            className={`rich-wysiwyg-tool${index === 2 ? " group-start" : ""}`}
            title={title}
            aria-label={title}
            onMouseDown={(event) => event.preventDefault()}
            onClick={action}
          >
            {label}
          </button>
        ))}
        <span className="rich-wysiwyg-divider" />
        <span className="rich-block-tip">Drag ⋮⋮ · type / for blocks</span>
      </div>
      <div className="rich-wysiwyg-canvas">
        <div
          ref={editorRef}
          className="rich-wysiwyg rich-message rich-block-editor"
          dir={rtl ? "rtl" : undefined}
          onFocus={() => document.execCommand("defaultParagraphSeparator", false, "p")}
          onInput={(event) => {
            rememberSelection();
            sync();
            const body = closestBody(event.target);
            const block = body?.closest<HTMLElement>(".rich-notion-block");
            if (!body || !block) return;
            const text = body.textContent || "";
            if (text.startsWith("/") && !text.includes("\n") && text.length <= 48) {
              const rect = body.getBoundingClientRect();
              setSlashMenu({
                blockId: block.dataset.blockId || "",
                query: text.slice(1).trim(),
                x: Math.min(rect.left, window.innerWidth - 330),
                y: Math.min(rect.bottom + 6, window.innerHeight - 430),
              });
            } else {
              setSlashMenu(null);
            }
          }}
          onKeyDown={(event) => {
            const body = closestBody(event.target);
            const block = body?.closest<HTMLElement>(".rich-notion-block");
            if (!body || !block) return;
            if (event.key === "Escape" && (slashMenu || blockMenu)) {
              event.preventDefault();
              event.stopPropagation();
              setSlashMenu(null);
              setBlockMenu(null);
              return;
            }
            if (event.key === "Enter" && slashMenu && visibleCommands[0]) {
              event.preventDefault();
              applyBlockCommand(visibleCommands[0], slashMenu.blockId);
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const next = splitBlockAtSelection(body, block, selectionRef.current, document);
              insertAfter(block, next);
              const nextBody = next.querySelector<HTMLElement>(".rich-block-content");
              if (nextBody) focusBody(nextBody, true);
              rememberSelection();
              sync();
              return;
            }
            if (event.key === "Backspace" && isBodyEmpty(body)) {
              const previous = block.previousElementSibling;
              if (previous) {
                event.preventDefault();
                block.remove();
                const previousBody = previous.querySelector<HTMLElement>(".rich-block-content");
                if (previousBody) focusBody(previousBody, false);
                rememberSelection();
                sync();
              }
            }
          }}
          onKeyUp={rememberSelection}
          onMouseUp={rememberSelection}
          onSelect={rememberSelection}
          onPaste={(event) => {
            const body = closestBody(event.target);
            if (!body) return;
            event.preventDefault();
            restoreSelection();
            const html = event.clipboardData.getData("text/html");
            const text = event.clipboardData.getData("text/plain");
            const fragment = html
              ? sanitizedFragment(html, document, mediaById, true)
              : document.createTextNode(text);
            const selection = window.getSelection();
            const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
            if (range && body.contains(range.commonAncestorContainer)) {
              range.deleteContents();
              range.insertNode(fragment);
              range.collapse(false);
            }
            rememberSelection();
            sync();
          }}
          onClick={(event) => {
            const target = event.target;
            if (!(target instanceof Element)) return;
            const action = target.closest<HTMLElement>("[data-block-action]");
            const block = target.closest<HTMLElement>(".rich-notion-block");
            if (action && block) {
              event.preventDefault();
              const rect = action.getBoundingClientRect();
              if (action.dataset.blockAction === "menu") {
                setBlockMenu({
                  blockId: block.dataset.blockId || "",
                  x: Math.min(rect.left, window.innerWidth - 230),
                  y: Math.min(rect.bottom + 4, window.innerHeight - 370),
                });
                setSlashMenu(null);
              } else {
                const next = makeBlock(emptyParagraph(document), document);
                insertAfter(block, next);
                const nextBody = next.querySelector<HTMLElement>(".rich-block-content");
                if (nextBody) {
                  focusBody(nextBody, true);
                  const nextRect = nextBody.getBoundingClientRect();
                  setSlashMenu({
                    blockId: next.dataset.blockId || "",
                    query: "",
                    x: Math.min(nextRect.left, window.innerWidth - 330),
                    y: Math.min(nextRect.bottom + 6, window.innerHeight - 430),
                  });
                }
                sync();
              }
              return;
            }
            if (target instanceof HTMLInputElement && target.type === "checkbox") {
              target.toggleAttribute("checked", target.checked);
              sync();
            }
            if (target.closest("a")) event.preventDefault();
          }}
          onContextMenu={(event) => {
            const block = event.target instanceof Element
              ? event.target.closest<HTMLElement>(".rich-notion-block")
              : null;
            if (!block) return;
            event.preventDefault();
            setBlockMenu({
              blockId: block.dataset.blockId || "",
              x: Math.min(event.clientX, window.innerWidth - 230),
              y: Math.min(event.clientY, window.innerHeight - 370),
            });
            setSlashMenu(null);
          }}
          onDragStart={(event) => {
            const handle = event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-block-action="menu"]')
              : null;
            const block = handle?.closest<HTMLElement>(".rich-notion-block");
            if (!handle || !block) {
              event.preventDefault();
              return;
            }
            draggedBlock.current = block.dataset.blockId || null;
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggedBlock.current || "");
            block.classList.add("is-dragging");
          }}
          onDragOver={(event) => {
            const block = event.target instanceof Element
              ? event.target.closest<HTMLElement>(".rich-notion-block")
              : null;
            if (!block || block.dataset.blockId === draggedBlock.current) return;
            event.preventDefault();
            dragTarget.current?.classList.remove("drag-before", "drag-after");
            dragTarget.current = block;
            const before = event.clientY < block.getBoundingClientRect().top + block.offsetHeight / 2;
            block.classList.add(before ? "drag-before" : "drag-after");
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            const editor = editorRef.current;
            const sourceId = draggedBlock.current || event.dataTransfer.getData("text/plain");
            const source = sourceId
              ? editor?.querySelector<HTMLElement>(`[data-block-id="${CSS.escape(sourceId)}"]`)
              : null;
            const target = dragTarget.current;
            if (source && target && source !== target) {
              if (target.classList.contains("drag-before")) target.parentNode?.insertBefore(source, target);
              else insertAfter(target, source);
              sync();
            }
            clearDragState(editorRef.current, dragTarget, draggedBlock);
          }}
          onDragEnd={() => clearDragState(editorRef.current, dragTarget, draggedBlock)}
          onToggle={sync}
          onBlur={sync}
        />
      </div>

      {slashMenu && (
        <div
          className="rich-floating-menu rich-slash-menu"
          style={{ left: slashMenu.x, top: slashMenu.y }}
          role="listbox"
          aria-label="Insert a block"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="rich-menu-label">Basic blocks</div>
          {visibleCommands.length ? visibleCommands.map((item) => (
            <button key={item.id} role="option" onClick={() => applyBlockCommand(item, slashMenu.blockId)}>
              <span className="rich-command-icon">{item.icon}</span>
              <span><strong>{item.label}</strong><small>{item.hint}</small></span>
            </button>
          )) : <div className="rich-menu-empty">No matching blocks</div>}
        </div>
      )}

      {blockMenu && (
        <div
          className="rich-floating-menu rich-block-menu"
          style={{ left: blockMenu.x, top: blockMenu.y }}
          role="menu"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="rich-menu-label">Turn into</div>
          <div className="rich-turn-grid">
            <button onClick={() => transformBlock("p", blockMenu.blockId)}>Text</button>
            <button onClick={() => transformBlock("h1", blockMenu.blockId)}>H1</button>
            <button onClick={() => transformBlock("h2", blockMenu.blockId)}>H2</button>
            <button onClick={() => transformBlock("h3", blockMenu.blockId)}>H3</button>
            <button onClick={() => transformBlock("h4", blockMenu.blockId)}>H4</button>
            <button onClick={() => transformBlock("h5", blockMenu.blockId)}>H5</button>
            <button onClick={() => transformBlock("h6", blockMenu.blockId)}>H6</button>
            <button onClick={() => transformBlock("blockquote", blockMenu.blockId)}>Quote</button>
            <button onClick={() => transformBlock("pre", blockMenu.blockId)}>Code</button>
          </div>
          <div className="rich-menu-separator" />
          <button onClick={() => mutateBlock("duplicate", blockMenu.blockId)}><span>⧉</span> Duplicate</button>
          <button onClick={() => mutateBlock("up", blockMenu.blockId)}><span>↑</span> Move up</button>
          <button onClick={() => mutateBlock("down", blockMenu.blockId)}><span>↓</span> Move down</button>
          <button className="danger" onClick={() => mutateBlock("delete", blockMenu.blockId)}><span>⌫</span> Delete</button>
        </div>
      )}
    </div>
  );
});

export default RichWysiwygEditor;

function replaceBlocks(editor: HTMLElement, source: string, mediaById: Map<string, string>): void {
  const fragment = sanitizedFragment(source, document, mediaById, true);
  const nodes = Array.from(fragment.childNodes).filter((node) => node.nodeType !== Node.TEXT_NODE || Boolean(node.textContent?.trim()));
  editor.replaceChildren(...(nodes.length ? nodes.map((node) => makeBlock(node, document)) : [makeBlock(emptyParagraph(document), document)]));
}

function makeBlock(node: Node, targetDocument: Document): HTMLElement {
  const wrapper = targetDocument.createElement("div");
  wrapper.className = "rich-notion-block";
  wrapper.dataset.blockId = crypto.randomUUID();

  const gutter = targetDocument.createElement("div");
  gutter.className = "rich-block-gutter";
  gutter.setAttribute("contenteditable", "false");

  const add = targetDocument.createElement("button");
  add.type = "button";
  add.className = "rich-block-add";
  add.dataset.blockAction = "add";
  add.setAttribute("aria-label", "Insert block below");
  add.textContent = "+";

  const handle = targetDocument.createElement("button");
  handle.type = "button";
  handle.className = "rich-block-handle";
  handle.dataset.blockAction = "menu";
  handle.setAttribute("aria-label", "Drag or open block menu");
  handle.draggable = true;
  handle.textContent = "⋮⋮";

  const body = targetDocument.createElement("div");
  body.className = "rich-block-content";
  body.setAttribute("contenteditable", "true");
  body.setAttribute("data-placeholder", "Type / for commands");
  if (node.nodeType === Node.TEXT_NODE) {
    const paragraph = targetDocument.createElement("p");
    paragraph.appendChild(node);
    body.appendChild(paragraph);
  } else {
    body.appendChild(node);
  }
  gutter.appendChild(add);
  gutter.appendChild(handle);
  wrapper.appendChild(gutter);
  wrapper.appendChild(body);
  return wrapper;
}

function makeBlockFromHtml(source: string, targetDocument: Document, mediaById: Map<string, string>): HTMLElement {
  const fragment = sanitizedFragment(source, targetDocument, mediaById, true);
  const wrapper = makeBlock(fragment.firstChild || emptyParagraph(targetDocument), targetDocument);
  const body = wrapper.querySelector<HTMLElement>(".rich-block-content");
  if (body) while (fragment.firstChild) body.appendChild(fragment.firstChild);
  return wrapper;
}

function splitBlockAtSelection(
  body: HTMLElement,
  block: HTMLElement,
  remembered: Range | null,
  targetDocument: Document
): HTMLElement {
  const range = remembered && body.contains(remembered.commonAncestorContainer) ? remembered : null;
  const next = makeBlock(emptyParagraph(targetDocument), targetDocument);
  const nextBody = next.querySelector<HTMLElement>(".rich-block-content");
  if (!range || !nextBody) return next;
  try {
    const tailRange = targetDocument.createRange();
    tailRange.setStart(range.startContainer, range.startOffset);
    tailRange.setEnd(body, body.childNodes.length);
    const tail = tailRange.extractContents();
    if (tail.childNodes.length && tail.textContent?.length) nextBody.replaceChildren(tail);
    if (isBodyEmpty(body)) body.replaceChildren(emptyParagraph(targetDocument));
  } catch {
    // A stale selection simply produces a fresh paragraph.
  }
  block.classList.remove("drag-before", "drag-after");
  return next;
}

function selectedBlock(editor: HTMLElement, range: Range | null): HTMLElement | null {
  if (!range || !editor.contains(range.commonAncestorContainer)) return null;
  const element = range.commonAncestorContainer instanceof Element
    ? range.commonAncestorContainer
    : range.commonAncestorContainer.parentElement;
  return element?.closest<HTMLElement>(".rich-notion-block") || null;
}

function insertAfter(reference: globalThis.Node, node: globalThis.Node): void {
  reference.parentNode?.insertBefore(node, reference.nextSibling);
}

function closestBody(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(".rich-block-content") : null;
}

function focusBody(body: HTMLElement, atStart: boolean): void {
  body.focus();
  const range = document.createRange();
  range.selectNodeContents(body);
  range.collapse(atStart);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

function emptyParagraph(targetDocument: Document): HTMLElement {
  const paragraph = targetDocument.createElement("p");
  paragraph.appendChild(targetDocument.createElement("br"));
  return paragraph;
}

function isBodyEmpty(body: HTMLElement): boolean {
  return !(body.textContent || "").replace(/\u200b/g, "").trim() && !body.querySelector("img, video, audio, hr, table, tg-map");
}

function clearDragState(
  editor: HTMLElement | null,
  targetRef: React.MutableRefObject<HTMLElement | null>,
  draggedRef: React.MutableRefObject<string | null>
): void {
  editor?.querySelectorAll(".is-dragging, .drag-before, .drag-after").forEach((element) => {
    element.classList.remove("is-dragging", "drag-before", "drag-after");
  });
  targetRef.current = null;
  draggedRef.current = null;
}

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
    if ((source as HTMLInputElement).checked || source.hasAttribute("checked")) output.setAttribute("checked", "");
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
    copy("zoom", (value) => integer(value) && numberInRange(value, 0, 24));
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
  for (const block of Array.from(editor.querySelectorAll<HTMLElement>(":scope > .rich-notion-block"))) {
    const body = block.querySelector<HTMLElement>(":scope > .rich-block-content");
    if (!body) continue;
    for (const child of Array.from(body.childNodes)) appendSanitized(child, container, document, new Map(), false);
  }
  return container.innerHTML.trim();
}

function serializeBlockBody(body: HTMLElement): string {
  const container = document.createElement("div");
  for (const child of Array.from(body.childNodes)) appendSanitized(child, container, document, new Map(), false);
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

function normalizeSelfClosingTags(value: string): string {
  return value.replace(/<(video|audio|tg-map)(\s[^<>]*?)?\s*\/>/gi, (_match, tag: string, attributes = "") => (
    `<${tag}${attributes}></${tag}>`
  ));
}
