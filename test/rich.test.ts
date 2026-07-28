import { describe, expect, it } from "vitest";
import {
  DEFAULT_RICH_SOURCES,
  RICH_HTML_TAGS,
  RICH_TEMPLATES,
  buildInputRichMessage,
  buildThinkingRichDraft,
  containsThinkingBlock,
  richMediaMarkup,
  validateRichMessage,
} from "../lib/rich";

describe("Rich Message Studio payloads", () => {
  it("builds exactly one rich representation with referenced uploads", () => {
    const media = [{ id: "hero", field: "hero_file", kind: "photo" as const }];
    const content = '<h2>Launch</h2><img src="tg://photo?id=hero"/>';
    const validation = validateRichMessage("html", content, false, false, media);
    expect(validation.errors).toEqual([]);
    expect(validation.message).toEqual({
      html: content,
      media: [{ id: "hero", media: { type: "photo", media: "attach://hero_file" } }],
    });
    expect(validation.message).not.toHaveProperty("markdown");
    expect(validation.message).not.toHaveProperty("blocks");
  });

  it("rejects malformed block JSON and unresolved media references", () => {
    expect(validateRichMessage("blocks", "{}", false, false, []).errors[0]).toContain("JSON array");
    expect(validateRichMessage("markdown", "![](tg://photo?id=missing)", false, false, []).errors[0]).toContain("missing");
  });

  it("keeps all editor modes and templates structurally usable", () => {
    expect(buildInputRichMessage("html", DEFAULT_RICH_SOURCES.html, false, false, [])).toHaveProperty("html");
    expect(buildInputRichMessage("markdown", DEFAULT_RICH_SOURCES.markdown, false, false, [])).toHaveProperty("markdown");
    expect(buildInputRichMessage("blocks", DEFAULT_RICH_SOURCES.blocks, true, true, [])).toMatchObject({
      is_rtl: true,
      skip_entity_detection: true,
    });
    expect(RICH_TEMPLATES.map((template) => template.id)).toEqual([
      "announcement",
      "status",
      "interactive",
      "ai-draft",
    ]);
    for (const template of RICH_TEMPLATES) {
      expect(validateRichMessage("html", template.sources.html, false, false, []).errors).toEqual([]);
      expect(validateRichMessage("markdown", template.sources.markdown, false, false, []).errors).toEqual([]);
      expect(validateRichMessage("blocks", template.sources.blocks, false, false, []).errors).toEqual([]);
    }
    expect(containsThinkingBlock("html", "<tg-thinking>Working…</tg-thinking>")).toBe(true);
    expect(containsThinkingBlock("blocks", '[{"type":"thinking","text":"Working"}]')).toBe(true);
  });

  it("tracks every Bot API 10.2 Rich HTML element and all heading levels", () => {
    expect(new Set(RICH_HTML_TAGS).size).toBe(RICH_HTML_TAGS.length);
    expect(RICH_HTML_TAGS).toEqual(expect.arrayContaining([
      "h1", "h2", "h3", "h4", "h5", "h6",
      "a", "tg-reference", "tg-emoji", "tg-time", "tg-math",
      "figure", "figcaption", "tg-map", "tg-collage", "tg-slideshow",
      "table", "details", "tg-math-block", "tg-thinking",
    ]));
  });

  it("adds exactly one trailing thinking block to each live-draft representation", () => {
    expect(buildThinkingRichDraft("html", "<p>Partial</p>", false, false).html).toBe(
      "<p>Partial</p>\n<tg-thinking>Thinking…</tg-thinking>"
    );
    expect(buildThinkingRichDraft("markdown", "**Partial**", false, false).markdown).toBe(
      "**Partial**\n<tg-thinking>Thinking…</tg-thinking>"
    );
    expect(buildThinkingRichDraft("blocks", '[{"type":"paragraph","text":"Partial"}]', false, false).blocks).toEqual([
      { type: "paragraph", text: "Partial" },
      { type: "thinking", text: "Thinking…" },
    ]);
    expect(
      buildThinkingRichDraft("html", "<p>Partial</p><tg-thinking>Working…</tg-thinking>", false, false).html
    ).toBe("<p>Partial</p><tg-thinking>Working…</tg-thinking>");
  });

  it("uses Telegram's three supported rich-media reference schemes", () => {
    expect(richMediaMarkup({ id: "still", field: "a", kind: "photo" })).toContain("tg://photo?id=still");
    expect(richMediaMarkup({ id: "gif", field: "b", kind: "animation" })).toContain("tg://video?id=gif");
    expect(richMediaMarkup({ id: "clip", field: "c", kind: "video" })).toContain("tg://video?id=clip");
    expect(richMediaMarkup({ id: "song", field: "d", kind: "audio" })).toContain("tg://audio?id=song");
    expect(richMediaMarkup({ id: "voice", field: "e", kind: "voice_note" })).toContain("tg://audio?id=voice");
  });
});
