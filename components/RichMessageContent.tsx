"use client";

import React, { useState } from "react";
import type { TgAny } from "@/lib/types";
import { bestPhoto, fileSrc } from "@/lib/format";

export default function RichMessageContent({ rich }: { rich: TgAny }) {
  const blocks = Array.isArray(rich?.blocks) ? rich.blocks : [];
  return (
    <div className="rich-message" dir={rich?.is_rtl ? "rtl" : undefined}>
      {blocks.map((block: unknown, index: number) => (
        <RichBlockView key={index} block={asObject(block)} />
      ))}
    </div>
  );
}

function RichBlockView({ block }: { block: TgAny }) {
  const type = String(block.type || "");
  const nested = Array.isArray(block.blocks) ? block.blocks : [];
  const caption = block.caption ? <RichCaption value={block.caption} /> : null;
  switch (type) {
    case "paragraph":
      return <p><RichTextView value={block.text} /></p>;
    case "heading": {
      const level = Math.min(6, Math.max(1, Number(block.size) || 2));
      return React.createElement(`h${level}`, {}, <RichTextView value={block.text} />);
    }
    case "pre":
      return <pre><code data-language={block.language || undefined}><RichTextView value={block.text} /></code></pre>;
    case "footer":
      return <footer><RichTextView value={block.text} /></footer>;
    case "divider":
      return <hr />;
    case "mathematical_expression":
      return <div className="rich-math">{String(block.expression || "")}</div>;
    case "anchor":
      return <span id={String(block.name || "")} />;
    case "list":
      return (
        <ul className="rich-list">
          {(Array.isArray(block.items) ? block.items : []).map((raw: unknown, index: number) => {
            const item = asObject(raw);
            return (
              <li key={index} className={item.has_checkbox ? "rich-check-item" : undefined}>
                {item.has_checkbox && <input type="checkbox" checked={Boolean(item.is_checked)} readOnly />}
                <div>{(Array.isArray(item.blocks) ? item.blocks : []).map((child: unknown, childIndex: number) => <RichBlockView key={childIndex} block={asObject(child)} />)}</div>
              </li>
            );
          })}
        </ul>
      );
    case "blockquote":
      return <blockquote>{nested.map((child: unknown, index: number) => <RichBlockView key={index} block={asObject(child)} />)}{block.credit && <cite><RichTextView value={block.credit} /></cite>}</blockquote>;
    case "pullquote":
      return <aside className="rich-pullquote"><RichTextView value={block.text} />{block.credit && <cite><RichTextView value={block.credit} /></cite>}</aside>;
    case "collage":
      return <figure><div className="rich-collage">{nested.map((child: unknown, index: number) => <RichBlockView key={index} block={asObject(child)} />)}</div>{caption}</figure>;
    case "slideshow":
      return <figure><div className="rich-slideshow">{nested.map((child: unknown, index: number) => <RichBlockView key={index} block={asObject(child)} />)}</div>{caption}</figure>;
    case "table":
      return <RichTable block={block} />;
    case "details":
      return <details open={Boolean(block.is_open)}><summary><RichTextView value={block.summary} /></summary>{nested.map((child: unknown, index: number) => <RichBlockView key={index} block={asObject(child)} />)}</details>;
    case "map": {
      const location = asObject(block.location);
      const latitude = Number(location.latitude);
      const longitude = Number(location.longitude);
      return <figure><a className="rich-map" href={`https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}`} target="_blank" rel="noreferrer">📍 {latitude.toFixed(5)}, {longitude.toFixed(5)} · zoom {Number(block.zoom) || 13}</a>{caption}</figure>;
    }
    case "photo": {
      const photo = bestPhoto(block.photo);
      return <figure>{photo && <img className={block.has_spoiler ? "rich-media spoiler-media" : "rich-media"} src={fileSrc(photo.file_id)} alt="Rich message photo" loading="lazy" />}{caption}</figure>;
    }
    case "video":
    case "animation": {
      const media = asObject(block[type]);
      return <figure><video className="rich-media" src={fileSrc(String(media.file_id || ""))} poster={asObject(media.thumbnail).file_id ? fileSrc(String(asObject(media.thumbnail).file_id)) : undefined} controls={type === "video"} autoPlay={type === "animation"} muted={type === "animation"} loop={type === "animation"} playsInline />{caption}</figure>;
    }
    case "audio":
    case "voice_note": {
      const media = asObject(block[type]);
      return <figure><audio src={fileSrc(String(media.file_id || ""))} controls />{caption}</figure>;
    }
    case "thinking":
      return <div className="rich-thinking"><span className="dot on" /> <RichTextView value={block.text} /></div>;
    default:
      return block.text ? <p><RichTextView value={block.text} /></p> : null;
  }
}

function RichTextView({ value }: { value: unknown }): React.ReactNode {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map((item, index) => <React.Fragment key={index}><RichTextView value={item} /></React.Fragment>);
  const text = asObject(value);
  const child = <RichTextView value={text.text ?? text.alternative_text ?? ""} />;
  switch (text.type) {
    case "bold": return <strong>{child}</strong>;
    case "italic": return <em>{child}</em>;
    case "underline": return <u>{child}</u>;
    case "strikethrough": return <s>{child}</s>;
    case "spoiler": return <RichSpoiler>{child}</RichSpoiler>;
    case "subscript": return <sub>{child}</sub>;
    case "superscript": return <sup>{child}</sup>;
    case "marked": return <mark>{child}</mark>;
    case "code": return <code className="tg-code">{child}</code>;
    case "custom_emoji": return <span title={`custom emoji ${String(text.custom_emoji_id || "")}`}>{String(text.alternative_text || "◻︎")}</span>;
    case "mathematical_expression": return <code className="rich-inline-math">{String(text.expression || "")}</code>;
    case "url":
    case "email_address":
    case "phone_number":
    case "anchor_link":
    case "reference_link": {
      const href = safeHref(String(text.url || text.email_address || text.phone_number || text.anchor_name || ""), String(text.type));
      return href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{child}</a> : child;
    }
    default: return child;
  }
}

function RichSpoiler({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <span className={`rich-spoiler${open ? " open" : ""}`} onClick={() => setOpen(true)}>{children}</span>;
}

function RichCaption({ value }: { value: unknown }) {
  const caption = asObject(value);
  return <figcaption><RichTextView value={caption.text ?? value} />{caption.credit && <cite><RichTextView value={caption.credit} /></cite>}</figcaption>;
}

function RichTable({ block }: { block: TgAny }) {
  const rows = Array.isArray(block.cells) ? block.cells : [];
  return (
    <div className="rich-table-wrap">
      {block.caption && <div className="rich-table-caption"><RichTextView value={block.caption} /></div>}
      <table className={`${block.is_bordered ? "bordered" : ""} ${block.is_striped ? "striped" : ""}`}>
        <tbody>{rows.map((rawRow: unknown, rowIndex: number) => <tr key={rowIndex}>{(Array.isArray(rawRow) ? rawRow : []).map((rawCell: unknown, cellIndex: number) => {
          const cell = asObject(rawCell);
          const Tag = cell.is_header ? "th" : "td";
          return <Tag key={cellIndex} colSpan={numberOrUndefined(cell.colspan)} rowSpan={numberOrUndefined(cell.rowspan)} style={{ textAlign: alignment(cell.align), verticalAlign: vertical(cell.valign) }}><RichTextView value={cell.text} /></Tag>;
        })}</tr>)}</tbody>
      </table>
    </div>
  );
}

function asObject(value: unknown): TgAny {
  return value && typeof value === "object" && !Array.isArray(value) ? value as TgAny : {};
}

function safeHref(raw: string, type: string): string | null {
  if (type === "anchor_link" || type === "reference_link") return raw.startsWith("#") ? raw : `#${raw}`;
  if (type === "email_address") return `mailto:${raw}`;
  if (type === "phone_number") return `tel:${raw}`;
  return /^(https?:|tg:|mailto:|tel:)/i.test(raw) ? raw : null;
}

function numberOrUndefined(value: unknown): number | undefined {
  const number = Number(value);
  return Number.isSafeInteger(number) && number > 0 ? number : undefined;
}

function alignment(value: unknown): "left" | "center" | "right" | undefined {
  return value === "left" || value === "center" || value === "right" ? value : undefined;
}

function vertical(value: unknown): "top" | "middle" | "bottom" | undefined {
  return value === "top" || value === "middle" || value === "bottom" ? value : undefined;
}
