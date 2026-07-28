"use client";

import React, { useEffect, useRef, useState } from "react";
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
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal"
        style={wide ? { maxWidth: "52rem" } : undefined}
        onMouseDown={(e) => e.stopPropagation()}
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
          <div style={{ fontWeight: 600, flex: 1 }}>{title}</div>
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
  return (
    <div className="field">
      {label && <label>{label}</label>}
      {children}
      {hint && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-tertiary)" }}>{hint}</div>
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
