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
import { IconClock, IconClose, IconRefresh, IconSearch, IconSticker } from "./Icons";

interface StickerSelectorProps {
  busy?: boolean;
  onClose: () => void;
  onSelect: (sticker: TgAny) => Promise<void> | void;
}

const FREQUENT = "__frequent__";

export default function StickerSelector({ busy, onClose, onSelect }: StickerSelectorProps) {
  const { stickerLibrary, refreshStickerSet } = useStore();
  const [active, setActive] = useState(FREQUENT);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [sendingKey, setSendingKey] = useState("");
  const sets = useMemo(() => sortedStickerSets(stickerLibrary), [stickerLibrary]);
  const allEntries = useMemo(() => sortedStickerEntries(stickerLibrary), [stickerLibrary]);

  useEffect(() => {
    if (active !== FREQUENT && !stickerLibrary.sets[active]) setActive(FREQUENT);
  }, [active, stickerLibrary.sets]);

  const activeSet = active === FREQUENT ? null : stickerLibrary.sets[active];
  const entries = useMemo(() => {
    const source = activeSet ? entriesForStickerSet(activeSet) : allEntries;
    const query = deferredSearch.trim().toLocaleLowerCase();
    if (!query) return source;
    return allEntries.filter((entry) => stickerSearchText(entry, stickerLibrary.sets).includes(query));
  }, [activeSet, allEntries, deferredSearch, stickerLibrary.sets]);

  const title = search.trim()
    ? "Search results"
    : activeSet?.title || (allEntries.some((entry) => entry.useCount > 0) ? "Frequently used" : "All received");

  return (
    <div className="sticker-selector" role="dialog" aria-label="Sticker selector">
      <div className="sticker-selector-head">
        <div className="sticker-selector-title-row">
          <div className="sticker-selector-title">
            <span className="sticker-selector-title-icon"><IconSticker size={19} /></span>
            <div>
              <strong>Stickers</strong>
              <span>{allEntries.length} received · sorted by use</span>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close sticker selector">
            <IconClose size={18} />
          </button>
        </div>
        <label className="sticker-search-wrap">
          <IconSearch size={16} />
          <input
            className="sticker-search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search emoji or sticker set"
            aria-label="Search stickers and sets"
          />
          {search && (
            <button type="button" onClick={() => setSearch("")} aria-label="Clear sticker search">
              <IconClose size={14} />
            </button>
          )}
        </label>
      </div>

      <div className="sticker-set-tabs" role="tablist" aria-label="Received sticker sets">
        <button
          className={`sticker-set-tab sticker-set-tab-icon${active === FREQUENT ? " active" : ""}`}
          onClick={() => {
            setSearch("");
            setActive(FREQUENT);
          }}
          role="tab"
          aria-selected={active === FREQUENT}
          aria-label="Frequently used stickers"
          title="Frequently used"
        >
          <IconClock size={19} />
        </button>
        {sets.map((set) => {
          const first = set.order.map((key) => set.stickers[key]).find(Boolean);
          return (
            <button
              key={set.name}
              className={`sticker-set-tab sticker-set-tab-icon${active === set.name ? " active" : ""}`}
              onClick={() => {
                setSearch("");
                setActive(set.name);
              }}
              role="tab"
              aria-selected={active === set.name}
              aria-label={set.title}
              title={`${set.title} · used ${set.useCount} times`}
            >
              {first ? (
                <StickerMedia sticker={first.sticker} className="sticker-tab-media" />
              ) : (
                <span className="sticker-tab-fallback">◻️</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="sticker-selector-section-head">
        <div>
          <strong>{title}</strong>
          <span className="muted"> · {entries.length}</span>
        </div>
        {activeSet && (
          <button
            className="btn sm ghost"
            onClick={() => refreshStickerSet(activeSet.name)}
            title="Refresh this set from Telegram"
          >
            <IconRefresh size={13} /> {activeSet.hydratedAt ? "Refresh" : "Load set"}
          </button>
        )}
      </div>

      <div
        className="sticker-grid"
        aria-live="polite"
        aria-busy={search !== deferredSearch}
        style={{ opacity: search === deferredSearch ? 1 : 0.72 }}
      >
        {entries.map((entry) => {
          const key = stickerKey(entry.sticker);
          const sending = sendingKey === key;
          return (
            <button
              key={key}
              className="sticker-choice"
              disabled={busy || Boolean(sendingKey)}
              aria-label={`${entry.sticker.emoji || "Sticker"}, used ${entry.useCount} times`}
              title={`${entry.sticker.emoji || "Sticker"} · used ${entry.useCount} times`}
              onClick={async () => {
                setSendingKey(key);
                try {
                  await onSelect(entry.sticker);
                } finally {
                  setSendingKey("");
                }
              }}
            >
              <StickerMedia sticker={entry.sticker} />
              {entry.useCount > 0 && <span className="sticker-frequency">{entry.useCount}</span>}
              {sending && <span className="sticker-sending">Sending…</span>}
            </button>
          );
        })}
        {!entries.length && (
          <div className="sticker-selector-empty">
            <span className="sticker-selector-empty-icon"><IconSticker size={25} /></span>
            <strong>{search.trim() ? "No stickers found" : "No stickers yet"}</strong>
            <span>{search.trim()
              ? "Try an emoji or another sticker-set name."
              : "Received and sent sticker sets will appear here automatically."}</span>
          </div>
        )}
      </div>

      <div className="sticker-selector-foot">
        <span>Animated previews</span><span>Browser-only history</span><span>Frequency ranked</span>
      </div>
    </div>
  );
}

function stickerSearchText(
  entry: StickerLibraryEntry,
  sets: ReturnType<typeof useStore>["stickerLibrary"]["sets"]
): string {
  const sticker = entry.sticker;
  const setName = typeof sticker.set_name === "string" ? sticker.set_name : "";
  const set = setName ? sets[setName] : undefined;
  return [sticker.emoji, setName, set?.title, sticker.type]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLocaleLowerCase();
}
