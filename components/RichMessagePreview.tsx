"use client";

import React, { useMemo, useState } from "react";
import RichMessageContent from "./RichMessageContent";
import { parseRichBlocks, type RichMediaKind, type RichMode } from "@/lib/rich";

export interface PreviewMedia {
  id: string;
  kind: RichMediaKind;
  previewUrl: string;
}

export default function RichMessagePreview({
  mode,
  content,
  rtl,
  media,
}: {
  mode: RichMode;
  content: string;
  rtl: boolean;
  media: PreviewMedia[];
}) {
  const mediaById = useMemo(() => new Map(media.map((item) => [item.id, item.previewUrl])), [media]);

  if (!content.trim()) return <PreviewEmpty text="Start writing to see the Telegram-style preview." />;
  if (mode === "blocks") {
    try {
      return <RichMessageContent rich={{ blocks: parseRichBlocks(content), is_rtl: rtl }} />;
    } catch (error) {
      return <PreviewEmpty error text={error instanceof Error ? error.message : "Invalid block JSON"} />;
    }
  }
  if (mode === "markdown") {
    return <MarkdownPreview source={content} rtl={rtl} mediaById={mediaById} />;
  }
  return <HtmlPreview source={content} rtl={rtl} mediaById={mediaById} />;
}

function PreviewEmpty({ text, error = false }: { text: string; error?: boolean }) {
  return <div className={error ? "rich-preview-error" : "rich-preview-empty"}>{text}</div>;
}

function HtmlPreview({
  source,
  rtl,
  mediaById,
}: {
  source: string;
  rtl: boolean;
  mediaById: Map<string, string>;
}) {
  const document = useMemo(
    () => typeof DOMParser === "undefined" ? null : new DOMParser().parseFromString(source, "text/html"),
    [source]
  );
  if (!document) return <PreviewEmpty text="Preparing preview…" />;
  return (
    <div className="rich-message" dir={rtl ? "rtl" : undefined}>
      {Array.from(document.body.childNodes).map((node, index) => renderHtmlNode(node, `${index}`, mediaById))}
    </div>
  );
}

function HtmlFragment({ source, mediaById }: { source: string; mediaById: Map<string, string> }) {
  const document = useMemo(
    () => typeof DOMParser === "undefined" ? null : new DOMParser().parseFromString(source, "text/html"),
    [source]
  );
  if (!document) return null;
  return <>{Array.from(document.body.childNodes).map((node, index) => renderHtmlNode(node, `${index}`, mediaById))}</>;
}

function renderHtmlNode(node: Node, key: string, mediaById: Map<string, string>): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const element = node as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const children = Array.from(element.childNodes).map((child, index) =>
    renderHtmlNode(child, `${key}.${index}`, mediaById)
  );
  const withKey = (value: React.ReactElement) => React.cloneElement(value, { key });

  switch (tag) {
    case "h1": return withKey(<h1>{children}</h1>);
    case "h2": return withKey(<h2>{children}</h2>);
    case "h3": return withKey(<h3>{children}</h3>);
    case "h4": return withKey(<h4>{children}</h4>);
    case "h5": return withKey(<h5>{children}</h5>);
    case "h6": return withKey(<h6>{children}</h6>);
    case "p": return withKey(<p>{children}</p>);
    case "b":
    case "strong": return withKey(<strong>{children}</strong>);
    case "i":
    case "em": return withKey(<em>{children}</em>);
    case "u":
    case "ins": return withKey(<u>{children}</u>);
    case "s":
    case "strike":
    case "del": return withKey(<s>{children}</s>);
    case "sub": return withKey(<sub>{children}</sub>);
    case "sup": return withKey(<sup>{children}</sup>);
    case "mark": return withKey(<mark>{children}</mark>);
    case "code": return withKey(<code className="tg-code">{children}</code>);
    case "pre": return withKey(<pre>{children}</pre>);
    case "footer": return withKey(<footer>{children}</footer>);
    case "br": return <br key={key} />;
    case "hr": return <hr key={key} />;
    case "ul": return withKey(<ul className="rich-list">{children}</ul>);
    case "ol": return withKey(<ol className="rich-list" start={numberAttr(element, "start")}>{children}</ol>);
    case "li": return withKey(<li>{children}</li>);
    case "blockquote": return withKey(<blockquote>{children}</blockquote>);
    case "aside": return withKey(<aside className="rich-pullquote">{children}</aside>);
    case "cite": return withKey(<cite>{children}</cite>);
    case "figure": return withKey(<figure>{children}</figure>);
    case "figcaption": return withKey(<figcaption>{children}</figcaption>);
    case "details": return withKey(<details open={element.hasAttribute("open")}>{children}</details>);
    case "summary": return withKey(<summary>{children}</summary>);
    case "table": return withKey(<div className="rich-table-wrap"><table className={`${element.hasAttribute("bordered") ? "bordered" : ""} ${element.hasAttribute("striped") ? "striped" : ""}`}><tbody>{children}</tbody></table></div>);
    case "caption": return withKey(<caption>{children}</caption>);
    case "tbody": return <React.Fragment key={key}>{children}</React.Fragment>;
    case "tr": return withKey(<tr>{children}</tr>);
    case "th": return withKey(<th colSpan={numberAttr(element, "colspan")} rowSpan={numberAttr(element, "rowspan")}>{children}</th>);
    case "td": return withKey(<td colSpan={numberAttr(element, "colspan")} rowSpan={numberAttr(element, "rowspan")}>{children}</td>);
    case "a": {
      const href = safeHref(element.getAttribute("href") || "");
      return href
        ? withKey(<a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{children}</a>)
        : <React.Fragment key={key}>{children}</React.Fragment>;
    }
    case "img": {
      const source = previewSource(element.getAttribute("src") || "", mediaById);
      const emoji = element.getAttribute("alt") || "";
      if (!source) return <span key={key}>{emoji || "[image]"}</span>;
      return <img key={key} className="rich-media" src={source} alt={emoji || "Rich media preview"} />;
    }
    case "video": {
      const source = previewSource(element.getAttribute("src") || "", mediaById);
      return source ? <video key={key} className="rich-media" src={source} controls muted playsInline /> : <span key={key}>[video]</span>;
    }
    case "audio": {
      const source = previewSource(element.getAttribute("src") || "", mediaById);
      return source ? <audio key={key} src={source} controls /> : <span key={key}>[audio]</span>;
    }
    case "input": {
      if ((element.getAttribute("type") || "").toLowerCase() !== "checkbox") return null;
      return <input key={key} type="checkbox" checked={element.hasAttribute("checked")} readOnly />;
    }
    case "tg-spoiler": return <PreviewSpoiler key={key}>{children}</PreviewSpoiler>;
    case "tg-thinking": return <div key={key} className="rich-thinking"><span className="dot on" /> {children}</div>;
    case "tg-math": return <code key={key} className="rich-inline-math">{children}</code>;
    case "tg-math-block": return <div key={key} className="rich-math">{children}</div>;
    case "tg-reference": return <span key={key} className="rich-reference">{children}</span>;
    case "tg-time": return <time key={key}>{children}</time>;
    case "tg-emoji": return <span key={key}>{children}</span>;
    case "tg-map": {
      const latitude = Number(element.getAttribute("lat"));
      const longitude = Number(element.getAttribute("long"));
      const zoom = Number(element.getAttribute("zoom")) || 13;
      return Number.isFinite(latitude) && Number.isFinite(longitude)
        ? <a key={key} className="rich-map" href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}`} target="_blank" rel="noreferrer">📍 {latitude.toFixed(5)}, {longitude.toFixed(5)} · zoom {zoom}</a>
        : <span key={key}>[map]</span>;
    }
    case "tg-collage": return <div key={key} className="rich-collage">{children}</div>;
    case "tg-slideshow": return <div key={key} className="rich-slideshow">{children}</div>;
    default: return <React.Fragment key={key}>{children}</React.Fragment>;
  }
}

function MarkdownPreview({
  source,
  rtl,
  mediaById,
}: {
  source: string;
  rtl: boolean;
  mediaById: Map<string, string>;
}) {
  const lines = source.split(/\r?\n/);
  const output: React.ReactNode[] = [];
  const footnotes = new Map<string, string>();
  for (const line of lines) {
    const definition = line.match(/^\[\^([^\]]+)\]:\s*(.+)$/);
    if (definition) footnotes.set(definition[1], definition[2]);
  }
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^\[\^[^\]]+\]:\s*/.test(line)) {
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      output.push(
        language.toLowerCase() === "math"
          ? <div className="rich-math" key={`math-${index}`}>{code.join("\n")}</div>
          : <pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>
      );
      continue;
    }
    if (/^\s*\$\$/.test(line)) {
      const expression: string[] = [];
      const trimmed = line.trim();
      if (trimmed.length > 4 && trimmed.endsWith("$$")) {
        expression.push(trimmed.slice(2, -2));
        index += 1;
      } else {
        expression.push(trimmed.slice(2));
        index += 1;
        while (index < lines.length && !lines[index].trim().endsWith("$$")) expression.push(lines[index++]);
        if (index < lines.length) expression.push(lines[index++].trim().replace(/\$\$$/, ""));
      }
      output.push(<div className="rich-math" key={`math-${index}`}>{expression.join("\n").trim()}</div>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(React.createElement(
        `h${level}`,
        { key: `h-${index}` },
        inlineMarkdown(heading[2], `h-${index}`, footnotes, mediaById)
      ));
      index += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      output.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quote: React.ReactNode[] = [];
      const quoteStart = index;
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        const text = lines[index].replace(/^\s*>\s?/, "");
        if (quote.length) quote.push(<br key={`q-br-${index}`} />);
        quote.push(...inlineMarkdown(text, `q-${index}`, footnotes, mediaById));
        index += 1;
      }
      output.push(<blockquote key={`q-${quoteStart}`}>{quote}</blockquote>);
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const raw = lines[index].replace(/^\s*[-*+]\s+/, "");
        const checked = raw.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(<li key={`li-${index}`} className={checked ? "rich-check-item" : undefined}>{checked && <input type="checkbox" checked={checked[1].toLowerCase() === "x"} readOnly />}<span>{inlineMarkdown(checked ? checked[2] : raw, `li-${index}`, footnotes, mediaById)}</span></li>);
        index += 1;
      }
      output.push(<ul className="rich-list" key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    if (/^\s*\d+[.)]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      const start = Number(line.match(/^\s*(\d+)/)?.[1]) || 1;
      while (index < lines.length && /^\s*\d+[.)]\s+/.test(lines[index])) {
        const raw = lines[index].replace(/^\s*\d+[.)]\s+/, "");
        items.push(<li key={`oli-${index}`}>{inlineMarkdown(raw, `oli-${index}`, footnotes, mediaById)}</li>);
        index += 1;
      }
      output.push(<ol className="rich-list" start={start} key={`ol-${index}`}>{items}</ol>);
      continue;
    }
    const media = line.trim().match(/^!\[([^\]]*)\]\((\S+?)(?:\s+["']([^"']*)["'])?\)$/);
    if (media) {
      output.push(renderMarkdownMedia(media[2], media[3] || media[1], `media-${index}`, mediaById));
      index += 1;
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[index + 1])) {
      const rows: string[][] = [tableCells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(tableCells(lines[index++]));
      output.push(<div className="rich-table-wrap" key={`table-${index}`}><table className="bordered striped"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{inlineMarkdown(cell, `th-${rowIndex}-${cellIndex}`, footnotes, mediaById)}</th> : <td key={cellIndex}>{inlineMarkdown(cell, `td-${rowIndex}-${cellIndex}`, footnotes, mediaById)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*</.test(line)) {
      const block = collectHtmlBlock(lines, index);
      output.push(<HtmlFragment key={`html-${index}`} source={block.source} mediaById={mediaById} />);
      index = block.nextIndex;
      continue;
    }
    output.push(<p key={`p-${index}`}>{inlineMarkdown(line, `p-${index}`, footnotes, mediaById)}</p>);
    index += 1;
  }
  if (footnotes.size) {
    output.push(
      <ol className="rich-footnotes" key="footnotes">
        {Array.from(footnotes).map(([id, definition]) => (
          <li key={id} id={`footnote-${id}`}>
            {inlineMarkdown(definition, `footnote-${id}`, footnotes, mediaById)}
          </li>
        ))}
      </ol>
    );
  }
  return <div className="rich-message" dir={rtl ? "rtl" : undefined}>{output}</div>;
}

function inlineMarkdown(
  value: string,
  key: string,
  footnotes = new Map<string, string>(),
  mediaById = new Map<string, string>()
): React.ReactNode[] {
  const pattern = /(!\[[^\]]*\]\(tg:\/\/(?:emoji|time)\?[^)]+\)|\[\^[^\]]+\]|\*\*.+?\*\*|__.+?__|~~.+?~~|\|\|.+?\|\||`[^`]+`|==.+?==|\[[^\]]+\]\([^\s)]+\)|<([a-z][a-z0-9-]*)\b[^>]*>.*?<\/\2>|(?<!\*)\*[^*]+\*(?!\*)|_[^_]+_|\$[^$\n]+\$)/gi;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={`${key}-${index}`}>{inlineMarkdown(token.slice(2, -2), `${key}-${index}-strong`, footnotes, mediaById)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<s key={`${key}-${index}`}>{inlineMarkdown(token.slice(2, -2), `${key}-${index}-strike`, footnotes, mediaById)}</s>);
    else if (token.startsWith("||")) nodes.push(<PreviewSpoiler key={`${key}-${index}`}>{inlineMarkdown(token.slice(2, -2), `${key}-${index}-spoiler`, footnotes, mediaById)}</PreviewSpoiler>);
    else if (token.startsWith("`")) nodes.push(<code className="tg-code" key={`${key}-${index}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("==")) nodes.push(<mark key={`${key}-${index}`}>{inlineMarkdown(token.slice(2, -2), `${key}-${index}-mark`, footnotes, mediaById)}</mark>);
    else if (token.startsWith("![")) {
      const embedded = token.match(/^!\[([^\]]*)\]\((tg:\/\/(?:emoji|time)\?[^)]+)\)$/);
      const alt = embedded?.[1] || "";
      nodes.push(embedded?.[2].startsWith("tg://time?")
        ? <time key={`${key}-${index}`} title={embedded[2]}>{alt || "Formatted time"}</time>
        : <span key={`${key}-${index}`} title={embedded?.[2]}>{alt || "◻︎"}</span>);
    }
    else if (token.startsWith("[^")) {
      const id = token.slice(2, -1);
      nodes.push(<sup className="rich-footnote-ref" key={`${key}-${index}`} title={footnotes.get(id)}><a href={`#footnote-${id}`}>[{id}]</a></sup>);
    }
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = safeHref(link?.[2] || "");
      nodes.push(href ? <a key={`${key}-${index}`} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a> : token);
    } else if (token.startsWith("<")) {
      nodes.push(<HtmlFragment key={`${key}-${index}`} source={token} mediaById={mediaById} />);
    } else if (token.startsWith("$")) {
      nodes.push(<code className="rich-inline-math" key={`${key}-${index}`}>{token.slice(1, -1)}</code>);
    } else nodes.push(<em key={`${key}-${index}`}>{inlineMarkdown(token.slice(1, -1), `${key}-${index}-em`, footnotes, mediaById)}</em>);
    cursor = start + token.length;
    index += 1;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
}

function renderMarkdownMedia(
  rawSource: string,
  caption: string,
  key: string,
  mediaById: Map<string, string>
): React.ReactNode {
  if (/^tg:\/(?:emoji|time)\?/i.test(rawSource)) {
    return <p key={key}>{caption || (rawSource.startsWith("tg://time?") ? "Formatted time" : "◻︎")}</p>;
  }
  const source = previewSource(rawSource, mediaById);
  if (!source) return <div className="rich-preview-error" key={key}>Media source is unavailable</div>;
  const path = rawSource.toLowerCase().split(/[?#]/, 1)[0];
  const video = rawSource.startsWith("tg://video?") || /\.(?:mp4|webm|mov|m4v|gif)$/.test(path);
  const audio = rawSource.startsWith("tg://audio?") || /\.(?:mp3|m4a|aac|wav|ogg|oga|opus|flac)$/.test(path);
  return (
    <figure key={key}>
      {video ? (
        <video className="rich-media" src={source} controls muted playsInline />
      ) : audio ? (
        <audio src={source} controls />
      ) : (
        // Dynamic Rich Message sources cannot use Next's static image optimizer.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="rich-media" src={source} alt={caption || "Rich media preview"} />
      )}
      {caption && <figcaption>{caption}</figcaption>}
    </figure>
  );
}

function collectHtmlBlock(lines: string[], start: number): { source: string; nextIndex: number } {
  const first = lines[start];
  const tag = first.trim().match(/^<(details|tg-collage|tg-slideshow|table|figure|blockquote|aside|ul|ol)\b/i)?.[1];
  if (!tag || new RegExp(`</${tag}>`, "i").test(first)) return { source: first, nextIndex: start + 1 };
  const collected = [first];
  let index = start + 1;
  while (index < lines.length) {
    collected.push(lines[index]);
    index += 1;
    if (new RegExp(`</${tag}>`, "i").test(collected.at(-1) || "")) break;
  }
  return { source: collected.join("\n"), nextIndex: index };
}

function PreviewSpoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <span className={`rich-spoiler${open ? " open" : ""}`} onClick={() => setOpen(true)}>{children}</span>;
}

function previewSource(raw: string, mediaById: Map<string, string>): string | null {
  const embedded = raw.match(/^tg:\/\/(?:photo|video|audio)\?id=([A-Za-z0-9_-]+)$/);
  if (embedded) return mediaById.get(embedded[1]) || null;
  return /^https?:\/\//i.test(raw) ? raw : null;
}

function safeHref(raw: string): string | null {
  if (raw.startsWith("#")) return raw;
  return /^(https?:|tg:|mailto:|tel:)/i.test(raw) ? raw : null;
}

function numberAttr(element: HTMLElement, name: string): number | undefined {
  const value = Number(element.getAttribute(name));
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function tableCells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
}
