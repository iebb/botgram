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
import { IconClose } from "./Icons";

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
        <input
          className="sticker-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search stickers and sets"
          aria-label="Search stickers and sets"
          autoFocus
        />
        <button className="icon-btn" onClick={onClose} aria-label="Close sticker selector">
          <IconClose size={18} />
        </button>
      </div>

      <div className="sticker-set-tabs" role="tablist" aria-label="Received sticker sets">
        <button
          className={`sticker-set-tab${active === FREQUENT ? " active" : ""}`}
          onClick={() => {
            setSearch("");
            setActive(FREQUENT);
          }}
          role="tab"
          aria-selected={active === FREQUENT}
        >
          <span>🕘</span>
          <span>Frequent</span>
        </button>
        {sets.map((set) => {
          const first = set.order.map((key) => set.stickers[key]).find(Boolean);
          return (
            <button
              key={set.name}
              className={`sticker-set-tab${active === set.name ? " active" : ""}`}
              onClick={() => {
                setSearch("");
                setActive(set.name);
              }}
              role="tab"
              aria-selected={active === set.name}
              title={`${set.title} · used ${set.useCount} times`}
            >
              <span>{first?.sticker.emoji || "◻️"}</span>
              <span>{set.title}</span>
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
            {activeSet.hydratedAt ? "Refresh" : "Load full set"}
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
            {search.trim()
              ? "No matching stickers"
              : "Stickers and their complete sets appear here after this browser receives or sends one."}
          </div>
        )}
      </div>

      <div className="sticker-selector-foot">
        Set metadata and frequency stay in this browser. Sticker files load from Telegram on demand.
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
