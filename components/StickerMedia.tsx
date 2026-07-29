"use client";

import React, { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { fileSrc } from "@/lib/format";
import { decodeTgs } from "@/lib/tgs";
import type { TgAny } from "@/lib/types";

const MAX_TGS_CACHE_ENTRIES = 72;
const tgsCache = new Map<string, Promise<TgAny>>();
const visibilityCallbacks = new WeakMap<Element, (visible: boolean) => void>();
let stickerVisibilityObserver: IntersectionObserver | null = null;

interface StickerMediaProps {
  sticker: TgAny;
  className?: string;
  eager?: boolean;
  label?: string;
}

function StickerMedia({
  sticker,
  className = "",
  eager = false,
  label,
}: StickerMediaProps) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(eager);
  const accessibleLabel = label || sticker.emoji || "Sticker";

  useEffect(() => {
    if (eager) {
      setVisible(true);
      return;
    }
    const node = host.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = sharedStickerObserver();
    visibilityCallbacks.set(node, setVisible);
    observer.observe(node);
    return () => {
      observer.unobserve(node);
      visibilityCallbacks.delete(node);
    };
  }, [eager]);

  return (
    <span
      ref={host}
      className={`sticker-media ${className}`.trim()}
      role="img"
      aria-label={accessibleLabel}
    >
      {visible ? (
        sticker.is_video ? (
          <VideoSticker sticker={sticker} />
        ) : sticker.is_animated ? (
          <TgsSticker sticker={sticker} />
        ) : (
          <StaticSticker sticker={sticker} />
        )
      ) : (
        <StickerFallback sticker={sticker} />
      )}
    </span>
  );
}

export default React.memo(StickerMedia);

function StaticSticker({ sticker }: { sticker: TgAny }) {
  const [failed, setFailed] = useState(false);
  if (failed || !sticker.file_id) return <StickerFallback sticker={sticker} />;
  return (
    // Telegram sticker files are authenticated, short-lived proxy URLs and are
    // intentionally not compatible with Next's build-time image optimizer.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fileSrc(sticker.file_id)}
      alt=""
      loading="lazy"
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

function VideoSticker({ sticker }: { sticker: TgAny }) {
  const [failed, setFailed] = useState(false);
  const reduceMotion = useReducedMotion();
  if (failed || !sticker.file_id) return <StickerFallback sticker={sticker} />;
  return (
    <video
      src={fileSrc(sticker.file_id)}
      poster={sticker.thumbnail?.file_id ? fileSrc(sticker.thumbnail.file_id) : undefined}
      autoPlay={!reduceMotion}
      loop={!reduceMotion}
      muted
      playsInline
      preload="metadata"
      disablePictureInPicture
      onError={() => setFailed(true)}
    />
  );
}

function TgsSticker({ sticker }: { sticker: TgAny }) {
  const container = useRef<HTMLSpanElement>(null);
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = container.current;
    const fileId = typeof sticker.file_id === "string" ? sticker.file_id : "";
    if (!node || !fileId) {
      setFailed(true);
      return;
    }

    let disposed = false;
    let animation: { destroy: () => void; goToAndStop: (value: number, isFrame: boolean) => void } | null = null;
    void Promise.all([loadTgs(fileId), import("lottie-web")])
      .then(([animationData, lottieModule]) => {
        if (disposed) return;
        const lottie = lottieModule.default;
        animation = lottie.loadAnimation({
          container: node,
          renderer: "canvas",
          loop: !reduceMotion,
          autoplay: !reduceMotion,
          animationData,
          rendererSettings: { clearCanvas: true },
        });
        if (reduceMotion) animation.goToAndStop(0, true);
        setLoaded(true);
      })
      .catch(() => {
        if (!disposed) setFailed(true);
      });

    return () => {
      disposed = true;
      animation?.destroy();
      node.replaceChildren();
    };
  }, [reduceMotion, sticker.file_id]);

  if (failed) return <StickerFallback sticker={sticker} />;
  return (
    <>
      {!loaded && <StickerFallback sticker={sticker} />}
      <span ref={container} className="sticker-lottie" aria-hidden="true" />
    </>
  );
}

function StickerFallback({ sticker }: { sticker: TgAny }) {
  const thumbnailId = typeof sticker.thumbnail?.file_id === "string"
    ? sticker.thumbnail.file_id
    : "";
  if (thumbnailId) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={fileSrc(thumbnailId)} alt="" loading="lazy" draggable={false} />
    );
  }
  return <span className="sticker-emoji-fallback">{sticker.emoji || "🙂"}</span>;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReducedMotion, reducedMotionSnapshot, () => false);
}

function loadTgs(fileId: string): Promise<TgAny> {
  const cached = tgsCache.get(fileId);
  if (cached) return cached;

  const loading = fetch(fileSrc(fileId), { cache: "no-store" })
    .then(async (response) => {
      if (!response.ok) throw new Error("Sticker download failed");
      const bytes = new Uint8Array(await response.arrayBuffer());
      return decodeTgs(bytes);
    })
    .catch((error) => {
      tgsCache.delete(fileId);
      throw error;
    });

  if (tgsCache.size >= MAX_TGS_CACHE_ENTRIES) {
    const oldest = tgsCache.keys().next().value as string | undefined;
    if (oldest) tgsCache.delete(oldest);
  }
  tgsCache.set(fileId, loading);
  return loading;
}

function sharedStickerObserver(): IntersectionObserver {
  if (stickerVisibilityObserver) return stickerVisibilityObserver;
  stickerVisibilityObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        visibilityCallbacks.get(entry.target)?.(entry.isIntersecting);
      }
    },
    { rootMargin: "180px" }
  );
  return stickerVisibilityObserver;
}

const reducedMotionListeners = new Set<() => void>();
let reducedMotionQuery: MediaQueryList | null = null;

function reducedMotionSnapshot(): boolean {
  reducedMotionQuery ||= window.matchMedia("(prefers-reduced-motion: reduce)");
  return reducedMotionQuery.matches;
}

function subscribeReducedMotion(listener: () => void): () => void {
  reducedMotionQuery ||= window.matchMedia("(prefers-reduced-motion: reduce)");
  reducedMotionListeners.add(listener);
  if (reducedMotionListeners.size === 1) {
    reducedMotionQuery.addEventListener("change", emitReducedMotionChange);
  }
  return () => {
    reducedMotionListeners.delete(listener);
    if (!reducedMotionListeners.size) {
      reducedMotionQuery?.removeEventListener("change", emitReducedMotionChange);
    }
  };
}

function emitReducedMotionChange(): void {
  for (const listener of reducedMotionListeners) listener();
}
