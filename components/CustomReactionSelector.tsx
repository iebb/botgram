"use client";

import React, { useDeferredValue, useEffect, useMemo, useState } from "react";
import {
  entriesForStickerSet,
  sortedStickerEntries,
  sortedStickerSets,
  stickerKey,
  type StickerLibraryEntry,
} from "@/lib/stickers";
import type { TgAny } from "@/lib/types";
import { useStore } from "./Store";
import StickerMedia from "./StickerMedia";

const FREQUENT = "__frequent_custom__";

export default function CustomReactionSelector({
  selectedId,
  onSelect,
}: {
  selectedId: string;
  onSelect: (sticker: TgAny) => void;
}) {
  const { stickerLibrary, refreshStickerSet } = useStore();
  const [active, setActive] = useState(FREQUENT);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const sets = useMemo(
    () => sortedStickerSets(stickerLibrary).filter((set) =>
      set.stickerType === "custom_emoji"
      || set.order.some((key) => isCustomEmoji(set.stickers[key]))
    ),
    [stickerLibrary]
  );
  const allEntries = useMemo(
    () => sortedStickerEntries(stickerLibrary).filter(isCustomEmoji),
    [stickerLibrary]
  );

  useEffect(() => {
    if (active !== FREQUENT && !sets.some((set) => set.name === active)) setActive(FREQUENT);
  }, [active, sets]);

  const activeSet = active === FREQUENT
    ? null
    : sets.find((set) => set.name === active) || null;
  const entries = useMemo(() => {
    const source = activeSet ? entriesForStickerSet(activeSet).filter(isCustomEmoji) : allEntries;
    const query = deferredSearch.trim().toLocaleLowerCase();
    if (!query) return source;
    return allEntries.filter((entry) => customEmojiSearchText(entry, stickerLibrary.sets).includes(query));
  }, [activeSet, allEntries, deferredSearch, stickerLibrary.sets]);

  return (
    <div className="custom-reaction-selector">
      <input
        className="sticker-search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search received custom emoji"
        aria-label="Search received custom emoji"
      />

      <div className="sticker-set-tabs" role="tablist" aria-label="Received custom emoji sets">
        <button
          type="button"
          className={`sticker-set-tab${active === FREQUENT ? " active" : ""}`}
          onClick={() => {
            setSearch("");
            setActive(FREQUENT);
          }}
          role="tab"
          aria-selected={active === FREQUENT}
        >
          <span>🕘</span><span>Frequent</span>
        </button>
        {sets.map((set) => {
          const first = set.order.map((key) => set.stickers[key]).find(isCustomEmoji);
          return (
            <button
              type="button"
              key={set.name}
              className={`sticker-set-tab${active === set.name ? " active" : ""}`}
              onClick={() => {
                setSearch("");
                setActive(set.name);
              }}
              role="tab"
              aria-selected={active === set.name}
              title={`${set.title} · observed ${set.useCount} times`}
            >
              <span>{first?.sticker.emoji || "🙂"}</span><span>{set.title}</span>
            </button>
          );
        })}
      </div>

      <div className="sticker-selector-section-head">
        <div>
          <strong>{search.trim() ? "Search results" : activeSet?.title || "Frequently observed"}</strong>
          <span className="muted"> · {entries.length}</span>
        </div>
        {activeSet && (
          <button
            type="button"
            className="btn sm ghost"
            onClick={() => refreshStickerSet(activeSet.name)}
          >
            {activeSet.hydratedAt ? "Refresh" : "Load full set"}
          </button>
        )}
      </div>

      <div
        className="sticker-grid custom-reaction-grid"
        aria-live="polite"
        aria-busy={search !== deferredSearch}
      >
        {entries.map((entry) => {
          const id = String(entry.sticker.custom_emoji_id || "");
          const selected = id === selectedId;
          return (
            <button
              type="button"
              key={stickerKey(entry.sticker)}
              className={`sticker-choice${selected ? " selected" : ""}`}
              aria-pressed={selected}
              aria-label={`${entry.sticker.emoji || "Custom emoji"}, observed ${entry.useCount} times`}
              title={`${entry.sticker.emoji || "Custom emoji"} · observed ${entry.useCount} times`}
              onClick={() => onSelect(entry.sticker)}
            >
              <StickerMedia sticker={entry.sticker} />
              {entry.useCount > 0 && <span className="sticker-frequency">{entry.useCount}</span>}
            </button>
          );
        })}
        {!entries.length && (
          <div className="sticker-selector-empty">
            {search.trim()
              ? "No matching custom emoji"
              : "Custom emoji sets appear here after this browser receives one in a message or reaction."}
          </div>
        )}
      </div>

      <div className="sticker-selector-foot">
        Sets are ranked by browser-local frequency. Emoji files load from Telegram on demand.
      </div>
    </div>
  );
}

function isCustomEmoji(entry: StickerLibraryEntry | undefined): entry is StickerLibraryEntry {
  return Boolean(entry?.sticker?.custom_emoji_id || entry?.sticker?.type === "custom_emoji");
}

function customEmojiSearchText(
  entry: StickerLibraryEntry,
  sets: ReturnType<typeof useStore>["stickerLibrary"]["sets"]
): string {
  const sticker = entry.sticker;
  const setName = typeof sticker.set_name === "string" ? sticker.set_name : "";
  return [sticker.emoji, sticker.custom_emoji_id, setName, sets[setName]?.title]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}
