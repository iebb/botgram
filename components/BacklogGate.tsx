"use client";

import React, { useEffect, useRef, useState } from "react";
import { useStore } from "./Store";

export default function BacklogGate() {
  const { backlog, continueBacklog, dropBacklog } = useStore();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const backdropRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    setConfirmDrop(false);
  }, [backlog?.initial]);

  useEffect(() => {
    if (backlog?.status !== "waiting") return;
    const backdrop = backdropRef.current;
    const dialog = dialogRef.current;
    const parent = backdrop?.parentElement;
    if (!backdrop || !dialog || !parent) return;

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const hiddenSiblings = Array.from(parent.children)
      .filter((element): element is HTMLElement =>
        element instanceof HTMLElement
        && element !== backdrop
        && !element.classList.contains("toast-stack")
      )
      .map((element) => ({
        element,
        inert: element.inert,
        ariaHidden: element.getAttribute("aria-hidden"),
      }));
    for (const { element } of hiddenSiblings) {
      element.inert = true;
      element.setAttribute("aria-hidden", "true");
    }

    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const focusable = () => Array.from(
      dialog.querySelectorAll<HTMLElement>(focusableSelector)
    );
    (focusable().at(-1) || dialog).focus();

    const trapFocus = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const controls = focusable();
      if (!controls.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", trapFocus);
    return () => {
      window.removeEventListener("keydown", trapFocus);
      for (const { element, inert, ariaHidden } of hiddenSiblings) {
        element.inert = inert;
        if (ariaHidden == null) element.removeAttribute("aria-hidden");
        else element.setAttribute("aria-hidden", ariaHidden);
      }
      previousFocus?.focus();
    };
  }, [backlog?.initial, backlog?.status, confirmDrop]);

  if (!backlog) return null;

  if (backlog.status === "catching-up") {
    const completed = Math.max(0, backlog.initial - backlog.remaining);
    const progress = backlog.initial ? Math.min(100, (completed / backlog.initial) * 100) : 100;
    return (
      <div className="backlog-progress" role="status" aria-live="polite">
        <div>
          <strong>Catching up</strong>
          <span>{backlog.remaining.toLocaleString()} update{backlog.remaining === 1 ? "" : "s"} remaining</span>
        </div>
        <div className="backlog-progress-track" aria-hidden="true">
          <span style={{ width: `${progress}%` }} />
        </div>
      </div>
    );
  }

  if (backlog.status === "dropping") {
    return (
      <div className="backlog-progress" role="status" aria-live="polite">
        <div>
          <strong>Starting fresh</strong>
          <span>Removing the queued Telegram updates…</span>
        </div>
      </div>
    );
  }

  return (
    <div ref={backdropRef} className="backlog-backdrop">
      <section
        ref={dialogRef}
        className="backlog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backlog-title"
        aria-describedby="backlog-description"
        tabIndex={-1}
      >
        <div className="backlog-count" aria-hidden="true">
          {backlog.remaining.toLocaleString()}
        </div>
        <h2 id="backlog-title">Updates are waiting</h2>
        <p id="backlog-description">
          Telegram queued {backlog.remaining.toLocaleString()} update
          {backlog.remaining === 1 ? "" : "s"} while this dashboard was closed.
          Catching up keeps them and saves the resulting chats only in this browser.
        </p>

        {confirmDrop ? (
          <div className="backlog-warning">
            <strong>This cannot be undone.</strong>
            <span>Telegram will permanently discard every queued update.</span>
          </div>
        ) : null}

        <div className="backlog-actions">
          {confirmDrop ? (
            <>
              <button type="button" className="btn" onClick={() => setConfirmDrop(false)}>
                Cancel
              </button>
              <button type="button" className="btn danger" onClick={dropBacklog}>
                Discard updates
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => setConfirmDrop(true)}>
                Start fresh
              </button>
              <button type="button" className="btn primary" onClick={continueBacklog} autoFocus>
                Catch up
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
