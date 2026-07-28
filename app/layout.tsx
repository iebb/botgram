import type { Metadata, Viewport } from "next";
import "@fontsource-variable/google-sans-flex/wght.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Humanoid — Telegram for bots",
  description: "A Telegram-style client that drives a bot account through the Bot API.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#212121",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
