"use client";

import React, { useEffect } from "react";
import { useStore } from "./Store";
import StickerMedia from "./StickerMedia";

export default function CustomEmoji({
  id,
  fallback = "🙂",
  className = "",
  title,
}: {
  id: string;
  fallback?: string;
  className?: string;
  title?: string;
}) {
  const { customEmojiStickers, ensureCustomEmojis } = useStore();
  const sticker = customEmojiStickers[id];

  useEffect(() => {
    if (id) ensureCustomEmojis([id]);
  }, [ensureCustomEmojis, id]);

  if (!sticker) {
    return (
      <span
        className={`custom-emoji-fallback ${className}`.trim()}
        title={title || `Custom emoji ${id}`}
        role="img"
        aria-label={fallback}
      >
        {fallback}
      </span>
    );
  }

  return (
    <StickerMedia
      sticker={sticker}
      className={`custom-emoji ${className}`.trim()}
      label={sticker.emoji || fallback}
    />
  );
}
