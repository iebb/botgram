"use client";

import React from "react";

type P = { size?: number; className?: string; style?: React.CSSProperties };

const svg =
  (path: React.ReactNode, opts: { fill?: boolean; box?: string } = {}) =>
  ({ size = 22, className, style }: P) => (
    <svg
      width={size}
      height={size}
      viewBox={opts.box || "0 0 24 24"}
      className={className}
      style={style}
      fill={opts.fill ? "currentColor" : "none"}
      stroke={opts.fill ? "none" : "currentColor"}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {path}
    </svg>
  );

export const IconSend = svg(<path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z" />, {
  fill: true,
});
export const IconAttach = svg(
  <path d="M21.4 11.05 12.3 20.1a5.5 5.5 0 0 1-7.8-7.8l9.2-9.2a3.7 3.7 0 0 1 5.2 5.2l-9.2 9.2a1.8 1.8 0 0 1-2.6-2.6l8.5-8.5" />
);
export const IconSmile = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M8.5 14.2c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" />
    <circle cx="9" cy="10" r="1" fill="currentColor" stroke="none" />
    <circle cx="15" cy="10" r="1" fill="currentColor" stroke="none" />
  </>
);
export const IconSearch = svg(
  <>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.6-3.6" />
  </>
);
export const IconMenu = svg(<path d="M3 6h18M3 12h18M3 18h18" />);
export const IconClose = svg(<path d="M6 6l12 12M18 6L6 18" />);
export const IconCheck = svg(<path d="M4 12.5 9 17.5 20 6.5" />);
export const IconChecks = svg(
  <>
    <path d="M1.5 12.5 6 17l7.5-7.5" />
    <path d="M9.5 15 12 17.5 22.5 7" />
  </>
);
export const IconDots = svg(
  <>
    <circle cx="12" cy="5" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
    <circle cx="12" cy="19" r="1.6" fill="currentColor" stroke="none" />
  </>
);
export const IconReply = svg(<path d="M10 8V4L3 11l7 7v-4.1c5 0 8.4 1.6 10.8 5.1-1-5-4-10-10.8-11z" />);
export const IconEdit = svg(
  <>
    <path d="M4 20h4l10.5-10.5a2.8 2.8 0 0 0-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </>
);
export const IconTrash = svg(
  <>
    <path d="M4 6.5h16M9.5 6.5V4h5v2.5M6.5 6.5 7.5 20h9l1-13.5" />
  </>
);
export const IconPin = svg(
  <>
    <path d="M14.5 3 21 9.5l-3.4 1.2-3.3 5.8-4.8-4.8 5.8-3.3z" />
    <path d="M9.5 14.5 4 20" />
  </>
);
export const IconForward = svg(
  <path d="M14 8V4l7 7-7 7v-4.1c-5 0-8.4 1.6-10.8 5.1 1-5 4-10 10.8-11z" />
);
export const IconCopy = svg(
  <>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4H6a2 2 0 0 0-2 2v7.5A1.5 1.5 0 0 0 5.5 15" />
  </>
);
export const IconInfo = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v6M12 7.6v.6" />
  </>
);
export const IconSettings = svg(
  <>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" />
  </>
);
export const IconBot = svg(
  <>
    <rect x="4" y="8" width="16" height="12" rx="3" />
    <path d="M12 8V4.5M9 4h6" />
    <circle cx="9" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    <circle cx="15" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
    <path d="M9.5 17h5" />
  </>
);
export const IconPhoto = svg(
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2.5" />
    <circle cx="8.5" cy="10" r="1.8" />
    <path d="m3.5 17.5 5-5 4.5 4.5 3-2.5 4.5 4" />
  </>
);
export const IconVideo = svg(
  <>
    <rect x="3" y="6" width="12.5" height="12" rx="2.5" />
    <path d="m16 11 5-3v8l-5-3z" />
  </>
);
export const IconDoc = svg(
  <>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </>
);
export const IconMic = svg(
  <>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" />
  </>
);
export const IconLocation = svg(
  <>
    <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
    <circle cx="12" cy="10" r="2.6" />
  </>
);
export const IconPoll = svg(<path d="M5 20V10M12 20V4M19 20v-6" />);
export const IconDice = svg(
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
    <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </>
);
export const IconContact = svg(
  <>
    <circle cx="12" cy="8.5" r="3.8" />
    <path d="M4.5 20c.8-4 3.9-6 7.5-6s6.7 2 7.5 6" />
  </>
);
export const IconSticker = svg(
  <>
    <path d="M20.5 12A8.5 8.5 0 1 0 12 20.5c1.2 0 8.5-7.3 8.5-8.5z" />
    <path d="M12 20.5c0-4.7 3.8-8.5 8.5-8.5" />
  </>
);
export const IconKeyboard = svg(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6 9.5h.01M9.5 9.5h.01M13 9.5h.01M16.5 9.5h.01M6 13h.01M9.5 13h.01M13 13h.01M16.5 13h.01M8 16h8" />
  </>
);
export const IconCode = svg(<path d="m9 8-5 4 5 4M15 8l5 4-5 4" />);
export const IconTerminal = svg(
  <>
    <rect x="3" y="4" width="18" height="16" rx="2.5" />
    <path d="m7.5 10 2.5 2-2.5 2M13 15h4" />
  </>
);
export const IconBolt = svg(<path d="M13.5 2.5 5 13.5h5.6L9.8 21.5 19 10.2h-5.9z" />);
export const IconRefresh = svg(
  <>
    <path d="M20 12a8 8 0 1 1-2.5-5.8" />
    <path d="M20 3.5V9h-5.5" />
  </>
);
export const IconPlay = svg(<path d="M7 4.5 19 12 7 19.5z" />, { fill: true });
export const IconPause = svg(<path d="M8 4.5h3.2v15H8zM12.8 4.5H16v15h-3.2z" />, { fill: true });
export const IconDownload = svg(
  <>
    <path d="M12 3.5v11M7.5 10 12 14.5 16.5 10" />
    <path d="M4.5 17v2.5h15V17" />
  </>
);
export const IconPlus = svg(<path d="M12 5v14M5 12h14" />);
export const IconChevron = svg(<path d="m9 5 7 7-7 7" />);
export const IconLink = svg(
  <>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4L11.3 6.3" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3A4.5 4.5 0 0 0 11 19.4l1.7-1.7" />
  </>
);
export const IconStar = svg(
  <path d="m12 3.5 2.7 5.7 6.2.8-4.5 4.3 1.1 6.2-5.5-3-5.5 3 1.1-6.2L3.1 10l6.2-.8z" />
);
export const IconUsers = svg(
  <>
    <circle cx="9" cy="8" r="3.5" />
    <path d="M2.5 19.5c.7-3.6 3.3-5.5 6.5-5.5s5.8 1.9 6.5 5.5" />
    <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6M17.5 14.3c2.2.6 3.7 2.3 4.2 5.2" />
  </>
);
export const IconShield = svg(
  <>
    <path d="M12 3 20 6v6c0 4.4-3.2 7.6-8 9.5C7.2 19.6 4 16.4 4 12V6z" />
    <path d="m8.8 12 2.2 2.2 4.2-4.4" />
  </>
);
export const IconBell = svg(
  <>
    <path d="M18 9a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16S18 14 18 9z" />
    <path d="M13.7 19.5a2 2 0 0 1-3.4 0" />
  </>
);
export const IconMoon = svg(<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a7 7 0 0 0 10.7 10.7z" />);
export const IconSun = svg(
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" />
  </>
);
export const IconArrowLeft = svg(<path d="M19 12H5M11 6l-6 6 6 6" />);
export const IconArrowDown = svg(<path d="M12 5v14M6 13l6 6 6-6" />);
export const IconEye = svg(
  <>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </>
);
export const IconGift = svg(
  <>
    <rect x="4" y="9.5" width="16" height="10.5" rx="1.5" />
    <path d="M2.8 6.6h18.4v3H2.8zM12 6.6V20" />
    <path d="M12 6.6C9.4 3 5.6 5.2 8 6.6M12 6.6c2.6-3.6 6.4-1.4 4 0" />
  </>
);
export const IconMoney = svg(
  <>
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <circle cx="12" cy="12" r="2.8" />
    <path d="M6 9v6M18 9v6" />
  </>
);
export const IconWebhook = svg(
  <>
    <circle cx="6.5" cy="17.5" r="3" />
    <circle cx="17.5" cy="17.5" r="3" />
    <circle cx="12" cy="5.5" r="3" />
    <path d="M10.4 8 7.6 14.8M13.6 8l2.8 6.8M9.5 17.5h5" />
  </>
);
export const IconLayers = svg(
  <>
    <path d="m12 3 9 5-9 5-9-5z" />
    <path d="m3.5 12.5 8.5 4.7 8.5-4.7" />
  </>
);
export const IconClock = svg(
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 2" />
  </>
);
export const IconMute = svg(
  <>
    <path d="M11 5 6.5 9H3v6h3.5L11 19z" />
    <path d="m15.5 9.5 5 5M20.5 9.5l-5 5" />
  </>
);
export const IconFire = svg(
  <path d="M12 22c4 0 6.5-2.7 6.5-6.3 0-4.6-4.2-6.6-3-11.7-3 .8-4.6 3.4-4.6 6 0 1.4-.7 2.2-1.6 2.2s-1.4-.8-1.4-2c-1.5 1.4-2.4 3.4-2.4 5.5C5.5 19.3 8 22 12 22z" />
);
