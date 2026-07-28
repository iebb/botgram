"use client";

const STORAGE_KEY = "humanoid.bot-token.v1";
const ACCOUNTS_KEY = "humanoid.bot-accounts.v1";
const COOKIE_NAME = "humanoid_bot_token";

let memoryToken = "";

export interface BotAccountSummary {
  botId: string;
  name: string;
  username?: string;
  lastUsedAt: number;
}

interface StoredBotAccount extends BotAccountSummary {
  token: string;
}

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

export function rememberBotAccount(
  token: string,
  bot: { id: number; first_name?: string; last_name?: string; username?: string }
): void {
  const normalized = token.trim();
  if (!validBotToken(normalized) || String(bot.id) !== normalized.split(":", 1)[0]) {
    throw new Error("Telegram returned an identity that does not match this bot token");
  }
  const current = readBotAccounts().filter((account) => account.botId !== String(bot.id));
  const name = [bot.first_name, bot.last_name].filter(Boolean).join(" ") || bot.username || `Bot ${bot.id}`;
  writeBotAccounts([
    {
      botId: String(bot.id),
      token: normalized,
      name,
      username: bot.username || undefined,
      lastUsedAt: Date.now(),
    },
    ...current,
  ]);
}

export function savedBotAccounts(): BotAccountSummary[] {
  return readBotAccounts().map((account) => ({
    botId: account.botId,
    name: account.name,
    username: account.username,
    lastUsedAt: account.lastUsedAt,
  }));
}

export function savedBotToken(botId: string): string {
  return readBotAccounts().find((account) => account.botId === botId)?.token || "";
}

export function forgetSavedBotAccount(botId: string): void {
  writeBotAccounts(readBotAccounts().filter((account) => account.botId !== botId));
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

function readBotAccounts(): StoredBotAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(ACCOUNTS_KEY) || "[]");
    if (!Array.isArray(parsed)) return [];
    const accounts = parsed.filter((value): value is StoredBotAccount => {
      if (!value || typeof value !== "object") return false;
      const account = value as Partial<StoredBotAccount>;
      return typeof account.botId === "string"
        && typeof account.token === "string"
        && validBotToken(account.token)
        && account.token.split(":", 1)[0] === account.botId
        && typeof account.name === "string"
        && typeof account.lastUsedAt === "number";
    });
    return Array.from(new Map(accounts.map((account) => [account.botId, account])).values())
      .sort((left, right) => right.lastUsedAt - left.lastUsedAt);
  } catch {
    return [];
  }
}

function writeBotAccounts(accounts: StoredBotAccount[]): void {
  window.localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
}
