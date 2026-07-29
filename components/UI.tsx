"use client";

import React, { useEffect, useId, useRef, useState } from "react";
import { avatarGradient, fileSrc, initials } from "@/lib/format";
import type { TgAny, TgChat, TgUser } from "@/lib/types";
import { useAvatarFileId } from "./Store";
import { IconClose } from "./Icons";

/* --------------------------------------------------------------- avatar */

export function Avatar({
  id,
  name,
  size = "md",
  photoUrl,
  entity,
  avatarKind,
  className = "",
}: {
  id: number | string;
  name: string;
  size?: "xs" | "sm" | "md" | "lg";
  photoUrl?: string;
  entity?: TgUser | TgChat | TgAny;
  avatarKind?: "user" | "chat";
  className?: string;
}) {
  const cls = size === "md" ? "avatar" : `avatar ${size}`;
  const [broken, setBroken] = useState(false);
  const fileId = useAvatarFileId(entity, avatarKind);
  const source = photoUrl || fileSrc(fileId);
  useEffect(() => setBroken(false), [source]);
  return (
    <div
      className={`${cls} ${className}`}
      style={{ background: avatarGradient(id) }}
      title={name}
    >
      {source && !broken ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={source}
          alt={name}
          onError={() => setBroken(true)}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      ) : (
        initials(name)
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- modal */

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  wide?: boolean;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const dialog = dialogRef.current;
    const focusableSelector = [
      "button:not([disabled])",
      "input:not([disabled])",
      "select:not([disabled])",
      "textarea:not([disabled])",
      "a[href]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");
    const focusable = () => Array.from(
      dialog?.querySelectorAll<HTMLElement>(focusableSelector) || []
    ).filter((element) => !element.hidden && element.getAttribute("aria-hidden") !== "true");
    (focusable()[0] || dialog)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !dialog) return;
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
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      previousFocus?.focus();
    };
  }, []);

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        style={wide ? { maxWidth: "52rem" } : undefined}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.875rem 1rem",
            borderBottom: "1px solid var(--panel-border)",
          }}
        >
          <div id={titleId} style={{ fontWeight: 600, flex: 1 }}>{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={20} />
          </button>
        </div>
        <div className="scroll-y" style={{ padding: "1rem", flex: 1 }}>
          {children}
        </div>
        {footer && (
          <div
            style={{
              display: "flex",
              gap: "0.5rem",
              justifyContent: "flex-end",
              padding: "0.75rem 1rem",
              borderTop: "1px solid var(--panel-border)",
            }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- fields */

export function Field({
  label,
  hint,
  children,
}: {
  label?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const generatedId = useId();
  const hintId = `${generatedId}-hint`;
  const control = React.isValidElement(children)
    ? React.cloneElement(
        children as React.ReactElement<{ id?: string; "aria-describedby"?: string }>,
        {
          id: (children.props as { id?: string }).id || generatedId,
          "aria-describedby": hint
            ? [
                (children.props as { "aria-describedby"?: string })["aria-describedby"],
                hintId,
              ].filter(Boolean).join(" ")
            : (children.props as { "aria-describedby"?: string })["aria-describedby"],
        }
      )
    : children;
  const controlId = React.isValidElement(control)
    ? (control.props as { id?: string }).id
    : undefined;

  return (
    <div className="field">
      {label && <label htmlFor={controlId}>{label}</label>}
      {control}
      {hint && (
        <div id={hintId} style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{hint}</div>
      )}
    </div>
  );
}

export function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`input ${props.className || ""}`} />;
}

export function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`textarea ${props.className || ""}`} />;
}

export function Select({
  options,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & {
  options: (string | { value: string; label: string })[];
}) {
  return (
    <select {...props} className={`select ${props.className || ""}`}>
      {options.map((o) => {
        const value = typeof o === "string" ? o : o.value;
        const label = typeof o === "string" ? o : o.label;
        return (
          <option key={value} value={value}>
            {label}
          </option>
        );
      })}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        fontSize: "0.8125rem",
        cursor: "pointer",
        padding: "0.1875rem 0",
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{ accentColor: "var(--accent)", width: "1rem", height: "1rem" }}
      />
      <span>{label}</span>
    </label>
  );
}

/* ------------------------------------------------------------- collapse */

export function Collapsible({
  title,
  children,
  defaultOpen = false,
  right,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid var(--panel-border)" }}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button
          onClick={() => setOpen(!open)}
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            padding: "0.625rem 1rem",
            fontSize: "0.8125rem",
            fontWeight: 600,
            textAlign: "left",
          }}
        >
          <span
            style={{
              transition: "transform 0.15s",
              transform: open ? "rotate(90deg)" : "none",
              color: "var(--text-tertiary)",
              display: "inline-block",
            }}
          >
            ▸
          </span>
          {title}
        </button>
        {right && <div style={{ paddingRight: "0.75rem" }}>{right}</div>}
      </div>
      {open && <div style={{ padding: "0 1rem 0.875rem" }}>{children}</div>}
    </div>
  );
}

/* ------------------------------------------------------------ json view */

export function Json({ value }: { value: unknown }) {
  return <div className="json-view">{JSON.stringify(value, null, 2)}</div>;
}

/* ---------------------------------------------------------- popup hooks */

export function useOutsideClick<T extends HTMLElement>(onOutside: () => void) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOutside();
    };
    // defer so the click that opened the popup doesn't immediately close it
    const t = setTimeout(() => document.addEventListener("mousedown", handler), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", handler);
    };
  }, [onOutside]);
  return ref;
}
