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
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }
    if (/^```/.test(line)) {
      const language = line.slice(3).trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```/.test(lines[index])) code.push(lines[index++]);
      if (index < lines.length) index += 1;
      output.push(<pre key={`code-${index}`}><code data-language={language || undefined}>{code.join("\n")}</code></pre>);
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const level = heading[1].length;
      output.push(React.createElement(`h${level}`, { key: `h-${index}` }, inlineMarkdown(heading[2], `h-${index}`)));
      index += 1;
      continue;
    }
    if (/^\s*(---+|\*\*\*+)\s*$/.test(line)) {
      output.push(<hr key={`hr-${index}`} />);
      index += 1;
      continue;
    }
    if (/^\s*>/.test(line)) {
      output.push(<blockquote key={`q-${index}`}>{inlineMarkdown(line.replace(/^\s*>\s?/, ""), `q-${index}`)}</blockquote>);
      index += 1;
      continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      const items: React.ReactNode[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        const raw = lines[index].replace(/^\s*[-*+]\s+/, "");
        const checked = raw.match(/^\[([ xX])\]\s+(.*)$/);
        items.push(<li key={`li-${index}`} className={checked ? "rich-check-item" : undefined}>{checked && <input type="checkbox" checked={checked[1].toLowerCase() === "x"} readOnly />}<span>{inlineMarkdown(checked ? checked[2] : raw, `li-${index}`)}</span></li>);
        index += 1;
      }
      output.push(<ul className="rich-list" key={`ul-${index}`}>{items}</ul>);
      continue;
    }
    if (line.includes("|") && index + 1 < lines.length && /^\s*\|?\s*:?-+/.test(lines[index + 1])) {
      const rows: string[][] = [tableCells(line)];
      index += 2;
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) rows.push(tableCells(lines[index++]));
      output.push(<div className="rich-table-wrap" key={`table-${index}`}><table className="bordered striped"><tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => rowIndex === 0 ? <th key={cellIndex}>{inlineMarkdown(cell, `th-${rowIndex}-${cellIndex}`)}</th> : <td key={cellIndex}>{inlineMarkdown(cell, `td-${rowIndex}-${cellIndex}`)}</td>)}</tr>)}</tbody></table></div>);
      continue;
    }
    if (/^\s*</.test(line)) {
      output.push(<HtmlFragment key={`html-${index}`} source={line} mediaById={mediaById} />);
      index += 1;
      continue;
    }
    output.push(<p key={`p-${index}`}>{inlineMarkdown(line, `p-${index}`)}</p>);
    index += 1;
  }
  return <div className="rich-message" dir={rtl ? "rtl" : undefined}>{output}</div>;
}

function inlineMarkdown(value: string, key: string): React.ReactNode[] {
  const pattern = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|\|\|[^|]+\|\||`[^`]+`|\[[^\]]+\]\([^\s)]+\)|==[^=]+==|_[^_]+_)/g;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let index = 0;
  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) nodes.push(value.slice(cursor, start));
    const token = match[0];
    if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={`${key}-${index}`}>{token.slice(2, -2)}</strong>);
    else if (token.startsWith("~~")) nodes.push(<s key={`${key}-${index}`}>{token.slice(2, -2)}</s>);
    else if (token.startsWith("||")) nodes.push(<PreviewSpoiler key={`${key}-${index}`}>{token.slice(2, -2)}</PreviewSpoiler>);
    else if (token.startsWith("`")) nodes.push(<code className="tg-code" key={`${key}-${index}`}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("==")) nodes.push(<mark key={`${key}-${index}`}>{token.slice(2, -2)}</mark>);
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = safeHref(link?.[2] || "");
      nodes.push(href ? <a key={`${key}-${index}`} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a> : token);
    } else nodes.push(<em key={`${key}-${index}`}>{token.slice(1, -1)}</em>);
    cursor = start + token.length;
    index += 1;
  }
  if (cursor < value.length) nodes.push(value.slice(cursor));
  return nodes;
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
