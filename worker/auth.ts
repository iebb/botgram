const encoder = new TextEncoder();
const SESSION_COOKIE = "humanoid_session";
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64Url(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = "";
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret: string, value: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return crypto.subtle.sign("HMAC", key, encoder.encode(value));
}

async function fixedHash(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", encoder.encode(value));
}

export async function constantTimeEqual(left: string, right: string): Promise<boolean> {
  const [leftHash, rightHash] = await Promise.all([fixedHash(left), fixedHash(right)]);
  const leftBytes = new Uint8Array(leftHash);
  const rightBytes = new Uint8Array(rightHash);
  let difference = 0;
  for (let index = 0; index < leftBytes.length; index += 1) {
    difference |= leftBytes[index] ^ rightBytes[index];
  }
  return difference === 0;
}

export async function verifyBotToken(provided: string, expected: string): Promise<boolean> {
  if (provided.length < 20 || provided.length > 256) return false;
  return constantTimeEqual(provided.trim(), expected.trim());
}

export async function makeSessionCookie(botToken: string): Promise<string> {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${botToken.split(":", 1)[0]}.${expiresAt}`;
  const signature = base64Url(await hmac(botToken, `session:${payload}`));
  return `${SESSION_COOKIE}=${payload}.${signature}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL_SECONDS}`;
}

export function clearSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

function cookieValue(request: Request, name: string): string | null {
  const cookie = request.headers.get("cookie") || "";
  for (const part of cookie.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

export async function hasValidSession(request: Request, botToken: string): Promise<boolean> {
  const value = cookieValue(request, SESSION_COOKIE);
  if (!value) return false;

  const pieces = value.split(".");
  if (pieces.length !== 3) return false;
  const [botId, expiresText, signature] = pieces;
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(Date.now() / 1000)) return false;
  if (botId !== botToken.split(":", 1)[0]) return false;

  const expected = base64Url(await hmac(botToken, `session:${botId}.${expiresText}`));
  return constantTimeEqual(signature, expected);
}

export async function webhookSecret(botToken: string): Promise<string> {
  return base64Url(await fixedHash(`humanoid:webhook:${botToken}`));
}
