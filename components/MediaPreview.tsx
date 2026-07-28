"use client";

import React, { useEffect, useState } from "react";
import { formatFileSize } from "@/lib/media";
import { IconClose, IconDoc, IconMic } from "./Icons";

function useObjectUrl(file: File): string {
  const [url, setUrl] = useState("");

  useEffect(() => {
    const next = URL.createObjectURL(file);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  return url;
}

function FileVisual({ file }: { file: File }) {
  const url = useObjectUrl(file);
  if (!url) return <div className="selected-media-placeholder" />;

  if (file.type.startsWith("image/")) {
    return (
      // Blob URLs are browser-local previews and cannot use Next's image optimizer.
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt={`Preview of ${file.name}`} />
    );
  }
  if (file.type.startsWith("video/")) {
    return <video src={url} controls muted playsInline preload="metadata" />;
  }
  if (file.type.startsWith("audio/")) {
    return (
      <div className="selected-media-audio">
        <IconMic size={30} />
        <audio src={url} controls preload="metadata" />
      </div>
    );
  }
  return (
    <div className="selected-media-document">
      <IconDoc size={34} />
      <span>{file.name.split(".").pop()?.toUpperCase() || "FILE"}</span>
    </div>
  );
}

export function SelectedMediaGrid({
  files,
  onChange,
  compact = false,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  compact?: boolean;
}) {
  const [dragging, setDragging] = useState<number | null>(null);

  const move = (from: number, to: number) => {
    if (from === to) return;
    const next = [...files];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };

  if (files.length === 0) return null;

  return (
    <div className={`selected-media-grid${compact ? " compact" : ""}`}>
      {files.map((file, index) => (
        <div
          key={`${file.name}:${file.size}:${file.lastModified}:${index}`}
          className={`selected-media-card${dragging === index ? " dragging" : ""}`}
          draggable={files.length > 1}
          onDragStart={(event) => {
            setDragging(index);
            event.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(event) => {
            if (dragging == null) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (dragging != null) move(dragging, index);
            setDragging(null);
          }}
          onDragEnd={() => setDragging(null)}
        >
          <div className="selected-media-visual">
            <FileVisual file={file} />
            {files.length > 1 && <span className="selected-media-order">{index + 1}</span>}
            <button
              type="button"
              className="selected-media-remove"
              onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}
              aria-label={`Remove ${file.name}`}
              title="Remove"
            >
              <IconClose size={15} />
            </button>
          </div>
          <div className="selected-media-meta" title={file.name}>
            <span>{file.name}</span>
            <small>{formatFileSize(file.size)}</small>
          </div>
        </div>
      ))}
    </div>
  );
}
