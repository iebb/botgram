const encoder = new TextEncoder();
const BOT_TOKEN_COOKIE = "humanoid_bot_token";
const BOT_TOKEN_PATTERN = /^(\d{5,20}):[A-Za-z0-9_-]{20,}$/;

export interface BotCredential {
  token: string;
  botId: string;
  hubKey: string;
}

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function fixedHash(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([fixedHash(left), fixedHash(right)]);
  // Next's DOM lib omits the Workers-only method even though the generated
  // runtime types and current Workers API expose it.
  const workersSubtle = crypto.subtle as SubtleCrypto & {
    timingSafeEqual(a: ArrayBuffer | ArrayBufferView, b: ArrayBuffer | ArrayBufferView): boolean;
  };
  return workersSubtle.timingSafeEqual(leftHash, rightHash);
}

/** One-way per-token key used to isolate transient Durable Object sessions. */
export async function botTokenKey(botToken: string): Promise<string> {
  return base64Url(await fixedHash(`humanoid:bot:${botToken}`));
}

export async function webhookSecretDigest(secret: string): Promise<string> {
  return base64Url(await fixedHash(`humanoid:webhook:${secret}`));
}

export function randomWebhookSecret(): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(32)));
}

export async function botCredentialFromRequest(request: Request): Promise<BotCredential | null> {
  const token = requestBotToken(request);
  const match = token.match(BOT_TOKEN_PATTERN);
  if (!match) return null;
  return { token, botId: match[1], hubKey: await botTokenKey(token) };
}

export function requestBotToken(request: Request): string {
  const authorization = request.headers.get("authorization") || "";
  const bearer = authorization.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (bearer) return bearer;

  const value = cookieValue(request, BOT_TOKEN_COOKIE);
  if (!value) return "";
  try {
    return decodeURIComponent(value).trim();
  } catch {
    return "";
  }
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}
