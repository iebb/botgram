export interface TelegramResponse<T = unknown> {
  ok: boolean;
  result?: T;
  description?: string;
  error_code?: number;
  parameters?: Record<string, unknown>;
}

export type TelegramParams = Record<string, unknown>;

const SENSITIVE_KEY = /(?:^|_)(?:token|secret|password|credential|provider_token)(?:$|_)/i;
const BOT_TOKEN_VALUE = /\b\d{5,}:[A-Za-z0-9_-]{20,}\b/g;

export function cleanParams(params: TelegramParams): TelegramParams {
  const result: TelegramParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    if (typeof value === "string" && value.trim() === "") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    result[key] = value;
  }
  return result;
}

export function telegramApiUrl(env: Env, botToken: string, method: string): string {
  const root = env.TELEGRAM_API_ROOT.replace(/\/$/, "");
  return `${root}/bot${botToken}/${method}`;
}

export function telegramFileUrl(env: Env, botToken: string, path: string): string {
  const root = env.TELEGRAM_API_ROOT.replace(/\/$/, "");
  return `${root}/file/bot${botToken}/${path}`;
}

async function readTelegramResponse<T>(response: Response): Promise<TelegramResponse<T>> {
  try {
    const value: unknown = await response.json();
    if (isRecord(value) && typeof value.ok === "boolean") {
      const normalized: TelegramResponse<T> = { ok: value.ok };
      if ("result" in value) normalized.result = value.result as T;
      if (typeof value.description === "string") normalized.description = value.description;
      if (typeof value.error_code === "number") normalized.error_code = value.error_code;
      if (isRecord(value.parameters)) normalized.parameters = value.parameters;
      return normalized;
    }
  } catch {
    // The normalized error below is safer than returning upstream HTML.
  }
  return {
    ok: false,
    error_code: response.status,
    description: `Telegram returned a non-JSON response (HTTP ${response.status})`,
  };
}

export async function callTelegramJson<T = unknown>(
  env: Env,
  botToken: string,
  method: string,
  params: TelegramParams = {}
): Promise<{ response: TelegramResponse<T>; elapsedMs: number }> {
  const startedAt = Date.now();
  try {
    const upstream = await fetch(telegramApiUrl(env, botToken, method), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cleanParams(params)),
    });
    return {
      response: await readTelegramResponse<T>(upstream),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      response: {
        ok: false,
        description: error instanceof Error ? error.message : "Telegram request failed",
      },
      elapsedMs: Date.now() - startedAt,
    };
  }
}

/** Forward a Telegram-ready multipart body without buffering uploaded media in Worker memory. */
export async function callTelegramMultipart<T = unknown>(
  env: Env,
  botToken: string,
  method: string,
  request: Request
): Promise<{ response: TelegramResponse<T>; elapsedMs: number }> {
  const startedAt = Date.now();
  const contentType = request.headers.get("content-type");
  if (!contentType?.toLowerCase().startsWith("multipart/form-data")) {
    return {
      response: { ok: false, error_code: 400, description: "Expected multipart/form-data" },
      elapsedMs: 0,
    };
  }

  try {
    const upstream = await fetch(telegramApiUrl(env, botToken, method), {
      method: "POST",
      headers: { "content-type": contentType },
      body: request.body,
    });
    return {
      response: await readTelegramResponse<T>(upstream),
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      response: {
        ok: false,
        description: error instanceof Error ? error.message : "Telegram upload failed",
      },
      elapsedMs: Date.now() - startedAt,
    };
  }
}

export function redactForLog(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[truncated]";
  if (typeof value === "string") {
    const redacted = value.replace(BOT_TOKEN_VALUE, "[redacted bot token]");
    return redacted.length > 800 ? `${redacted.slice(0, 800)}…` : redacted;
  }
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactForLog(item, depth + 1));
  if (!isRecord(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    output[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redactForLog(nested, depth + 1);
  }
  return output;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
