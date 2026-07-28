"use client";

const STORAGE_KEY = "humanoid.bot-token.v1";
const COOKIE_NAME = "humanoid_bot_token";

let memoryToken = "";

export function validBotToken(token: string): boolean {
  return /^\d{5,20}:[A-Za-z0-9_-]{20,}$/.test(token.trim());
}

export function currentBotToken(): string {
  if (memoryToken) return memoryToken;
  if (typeof window === "undefined") return "";
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)?.trim() || "";
    if (validBotToken(stored)) memoryToken = stored;
  } catch {
    return "";
  }
  return memoryToken;
}

/** Restores the localStorage credential and refreshes its session transport cookie. */
export function restoreBotToken(): string {
  const token = currentBotToken();
  if (token) syncTransportCookie(token);
  else clearTransportCookie();
  return token;
}

export function saveBotToken(token: string): void {
  const normalized = token.trim();
  if (!validBotToken(normalized)) throw new Error("Enter a valid Telegram bot token");
  window.localStorage.setItem(STORAGE_KEY, normalized);
  memoryToken = normalized;
  syncTransportCookie(normalized);
}

export function removeBotToken(): void {
  memoryToken = "";
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Clearing the session transport still signs this browser out.
  }
  clearTransportCookie();
}

export async function botFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
  tokenOverride?: string
): Promise<Response> {
  const token = (tokenOverride || currentBotToken()).trim();
  const headers = new Headers(init.headers);
  if (token) headers.set("authorization", `Bearer ${token}`);
  return fetch(input, { ...init, headers, credentials: "same-origin" });
}

function syncTransportCookie(token: string): void {
  // Native img/video/audio requests and browser WebSockets can't set an
  // Authorization header. This session-only, same-origin cookie mirrors the
  // localStorage token for transport; the Worker never persists it.
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/api; SameSite=Strict${secureCookieSuffix()}`;
}

function clearTransportCookie(): void {
  document.cookie = `${COOKIE_NAME}=; Path=/api; SameSite=Strict; Max-Age=0${secureCookieSuffix()}`;
}

function secureCookieSuffix(): string {
  return typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
}
