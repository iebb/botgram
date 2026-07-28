"use client";

import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { StoredMessage } from "@/lib/types";
import { dayLabel } from "@/lib/format";
import { MessageItem, type MsgAction } from "./MessageItem";
import { IconArrowDown } from "./Icons";

const GROUP_WINDOW = 5 * 60; // seconds

export default function MessageList({
  messages,
  meId,
  chatType,
  onAction,
}: {
  messages: StoredMessage[];
  meId?: number;
  chatType?: string;
  onAction: (a: MsgAction, m: StoredMessage, e?: React.MouseEvent) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const lastCount = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const grew = messages.length > lastCount.current;
    lastCount.current = messages.length;
    if (atBottom || grew) el.scrollTop = el.scrollHeight;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 120);
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  const jumpTo = (messageId: number) => {
    const node = document.getElementById(`msg-${messageId}`);
    if (!node) return;
    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.animate(
      [{ background: "rgba(127,127,127,0.35)" }, { background: "transparent" }],
      { duration: 1200 }
    );
  };

  const rows: React.ReactNode[] = [];
  let lastDay = "";

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    const prev = messages[i - 1];
    const next = messages[i + 1];
    const out = !!meId && m.from?.id === meId;

    const day = dayLabel(m.date);
    if (day !== lastDay) {
      lastDay = day;
      rows.push(
        <div className="service-msg" key={`day-${m.message_id}`}>
          {day}
        </div>
      );
    }

    const senderKey = (message: StoredMessage) =>
      message.from ? `user:${message.from.id}` : message.sender_chat ? `chat:${message.sender_chat.id}` : "unknown";
    const samePrev =
      prev &&
      senderKey(prev) === senderKey(m) &&
      m.date - prev.date < GROUP_WINDOW &&
      dayLabel(prev.date) === day;
    const sameNext =
      next && senderKey(next) === senderKey(m) && next.date - m.date < GROUP_WINDOW;

    rows.push(
      <MessageItem
        key={m._key || `m:${m.message_id}`}
        m={m}
        out={out}
        showSender={!samePrev}
        showAvatar={!sameNext}
        tail={!sameNext}
        chatType={chatType}
        onAction={onAction}
        onJumpTo={jumpTo}
      />
    );
  }

  return (
    <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
      <div
        ref={ref}
        className="scroll-y"
        style={{
          position: "absolute",
          inset: 0,
          padding: "0.75rem 0 0.5rem",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ flex: 1 }} />
        <div style={{ maxWidth: "45.5rem", width: "100%", margin: "0 auto" }}>
          {rows.length ? rows : (
            <div className="service-msg">
              No retained history · new messages appear live while this page is open
            </div>
          )}
        </div>
      </div>

      {!atBottom && (
        <button
          className="icon-btn"
          onClick={() => {
            const el = ref.current;
            if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
          }}
          style={{
            position: "absolute",
            right: "1.25rem",
            bottom: "1rem",
            background: "var(--bg)",
            boxShadow: "0 1px 6px rgba(0,0,0,.3)",
            width: "3rem",
            height: "3rem",
          }}
          aria-label="Scroll to bottom"
        >
          <IconArrowDown />
        </button>
      )}
    </div>
  );
}
