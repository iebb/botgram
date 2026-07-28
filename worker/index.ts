import { BotHub } from "./bot-hub";
import {
  clearSessionCookie,
  constantTimeEqual,
  hasValidSession,
  makeSessionCookie,
  verifyBotToken,
  webhookSecret,
} from "./auth";
import {
  callTelegramJson,
  callTelegramMultipart,
  cleanParams,
  isRecord,
  telegramFileUrl,
  type TelegramParams,
  type TelegramResponse,
} from "./telegram";
import { ALL_UPDATE_TYPES } from "../lib/updateTypes";
import type { AppSnapshot, TgAny, TgUser } from "../lib/types";

export { BotHub };

const MAX_JSON_BYTES = 1_000_000;
const SECURITY_HEADERS: Record<string, string> = {
  "cache-control": "no-store",
  "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/telegram/webhook") {
        return await handleTelegramWebhook(request, env);
      }

      if (url.pathname === "/api/auth/session" && request.method === "GET") {
        return json({ authenticated: await hasValidSession(request, env.BOT_TOKEN) });
      }
      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return await handleLogin(request, env);
      }
      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        return json(
          { ok: true },
          200,
          { "set-cookie": clearSessionCookie() }
        );
      }

      if (url.pathname.startsWith("/api/")) {
        if (!(await hasValidSession(request, env.BOT_TOKEN))) {
          return telegramError(401, "Authentication required");
        }
        if (!isSameOriginMutation(request)) {
          return telegramError(403, "Cross-origin request rejected");
        }

        if (url.pathname === "/api/ws") return getHub(env).fetch(request);
        if (url.pathname === "/api/state" && request.method === "GET") {
          return await handleState(env);
        }
        if (url.pathname === "/api/read" && request.method === "POST") {
          return await handleRead(request);
        }
        if (url.pathname === "/api/tg" && request.method === "POST") {
          return await handleTelegramCall(request, env);
        }
        if (url.pathname === "/api/file" && request.method === "GET") {
          return await handleTelegramFile(request, env);
        }
        if (url.pathname === "/api/avatar" && request.method === "GET") {
          return await handleAvatar(request, env);
        }
        if (url.pathname === "/api/polling" && request.method === "POST") {
          return await handleLegacyPolling(request, env);
        }
        if (url.pathname === "/api/webhook/install" && request.method === "POST") {
          return json(await installWebhook(env, url.origin));
        }
        return telegramError(404, "API route not found");
      }

      return env.ASSETS.fetch(request);
    } catch {
      return telegramError(500, "Internal error");
    }
  },
} satisfies ExportedHandler<Env>;

function getHub(env: Env) {
  const botId = env.BOT_TOKEN.split(":", 1)[0] || "primary";
  return env.BOT_HUB.getByName(`bot:${botId}`, { locationHint: "apac-ne" });
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!isSameOriginMutation(request)) return telegramError(403, "Cross-origin request rejected");
  const body = await readJsonObject(request);
  const token = typeof body.token === "string" ? body.token : "";
  if (!(await verifyBotToken(token, env.BOT_TOKEN))) {
    return telegramError(401, "That bot token does not match this deployment");
  }

  const call = await callTelegramJson<TgUser>(env, "getMe");
  if (!call.response.ok || !call.response.result) {
    return telegramError(502, call.response.description || "Telegram rejected the configured token");
  }

  return json(
    { ok: true, bot: call.response.result },
    200,
    { "set-cookie": await makeSessionCookie(env.BOT_TOKEN) }
  );
}

async function handleState(env: Env): Promise<Response> {
  const [identity, webhook] = await Promise.all([
    callTelegramJson<TgUser>(env, "getMe"),
    callTelegramJson<TgAny>(env, "getWebhookInfo"),
  ]);
  const webhookInfo = webhook.response.ok && isRecord(webhook.response.result)
    ? webhook.response.result
    : null;
  const webhookUrl = typeof webhookInfo?.url === "string" ? webhookInfo.url : "";
  const webhookError = typeof webhookInfo?.last_error_message === "string"
    ? webhookInfo.last_error_message
    : webhook.response.ok
      ? null
      : webhook.response.description || "Unable to inspect the Telegram webhook";
  const snapshot: AppSnapshot = {
    me: identity.response.ok && identity.response.result ? identity.response.result : null,
    chats: [],
    messages: {},
    queries: [],
    rawUpdates: [],
    polling: {
      running: Boolean(webhookUrl) && !webhookError,
      offset: null,
      lastError: identity.response.ok
        ? webhookError
        : identity.response.description || "Unable to load bot identity",
      lastPollAt: null,
      updatesSeen: 0,
    },
    log: [],
  };
  return json(snapshot);
}

async function handleRead(request: Request): Promise<Response> {
  const body = await readJsonObject(request);
  const chatId = typeof body.chatId === "string" ? body.chatId : String(body.chatId ?? "");
  if (!/^-?\d+$/.test(chatId)) return telegramError(400, "Invalid chat id");
  return json({ ok: true });
}

async function handleTelegramCall(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const contentType = request.headers.get("content-type") || "";
  let method = "";
  let params: TelegramParams = {};
  let meta: Record<string, unknown> = {};
  let call: { response: TelegramResponse; elapsedMs: number };

  if (contentType.toLowerCase().startsWith("multipart/form-data")) {
    method = url.searchParams.get("method") || "";
    if (!isTelegramMethod(method)) return telegramError(400, "Invalid Bot API method name");
    meta = parseObject(url.searchParams.get("meta"));
    call = await callTelegramMultipart(env, method, request);
    params = { multipart_upload: true };
  } else {
    const body = await readJsonObject(request);
    method = typeof body.method === "string" ? body.method : "";
    if (!isTelegramMethod(method)) return telegramError(400, "Invalid Bot API method name");
    params = isRecord(body.params) ? cleanParams(body.params) : {};
    meta = isRecord(body.meta) ? body.meta : {};
    call = await callTelegramJson(env, method, params);
  }

  const hub = getHub(env);
  await hub.recordTelegramCallJson(method, encodeJson(params), encodeJson(call.response), call.elapsedMs);
  if (call.response.ok) {
    await hub.absorbTelegramResultJson(
      method,
      encodeJson(params),
      encodeJson(call.response.result),
      encodeJson(meta)
    );
  }
  return json(call.response);
}

async function handleTelegramWebhook(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const provided = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const expected = await webhookSecret(env.BOT_TOKEN);
  if (!(await constantTimeEqual(provided, expected))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await readJsonObject(request);
  if (!Number.isSafeInteger(body.update_id)) return new Response("Bad update", { status: 400 });
  await getHub(env).ingestUpdateJson(encodeJson(body));
  return new Response(null, { status: 204 });
}

async function installWebhook(env: Env, origin: string): Promise<TelegramResponse> {
  const params: TelegramParams = {
    url: `${origin}/telegram/webhook`,
    secret_token: await webhookSecret(env.BOT_TOKEN),
    allowed_updates: ALL_UPDATE_TYPES,
    drop_pending_updates: false,
    max_connections: 40,
  };
  const call = await callTelegramJson(env, "setWebhook", params);
  const hub = getHub(env);
  await hub.recordTelegramCallJson("setWebhook", encodeJson(params), encodeJson(call.response), call.elapsedMs);
  await hub.setWebhookState(call.response.ok, call.response.ok ? null : call.response.description || "setWebhook failed");
  return call.response;
}

async function handleLegacyPolling(request: Request, env: Env): Promise<Response> {
  const body = await readJsonObject(request);
  const action = body.action;
  if (action === "clear") {
    await getHub(env).clearSession();
    return json({ ok: true });
  }
  if (action === "start") return json(await installWebhook(env, new URL(request.url).origin));
  if (action === "skip") return json({ ok: true, description: "Webhooks have no local backlog" });
  if (action === "stop") {
    return telegramError(409, "The production webhook stays enabled; use the API Console to remove it intentionally");
  }
  return telegramError(400, "Unknown action");
}

async function handleTelegramFile(request: Request, env: Env): Promise<Response> {
  const fileId = new URL(request.url).searchParams.get("id") || "";
  if (!fileId || fileId.length > 2048) return new Response("Invalid file id", { status: 400 });
  const info = await callTelegramJson<{ file_path?: string }>(env, "getFile", { file_id: fileId });
  if (!info.response.ok || !info.response.result?.file_path) {
    return new Response(info.response.description || "File not found", { status: 404 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);
  const upstream = await fetch(telegramFileUrl(env, info.response.result.file_path), {
    headers: upstreamHeaders,
  });
  if (!upstream.ok || !upstream.body) return new Response("Telegram file download failed", { status: 502 });

  const headers = new Headers();
  for (const name of ["content-type", "content-length", "content-range", "accept-ranges", "etag"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("cache-control", "private, no-store");
  headers.set("x-content-type-options", "nosniff");
  const filename = info.response.result.file_path.split("/").pop()?.replace(/["\r\n]/g, "") || "telegram-file";
  headers.set("content-disposition", `inline; filename="${filename}"`);
  return new Response(upstream.body, { status: upstream.status, headers });
}

async function handleAvatar(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const kind = url.searchParams.get("kind");
  if (!/^-?\d{1,20}$/.test(id) || (kind !== "user" && kind !== "chat")) {
    return telegramError(400, "Invalid avatar lookup");
  }

  let fileId: string | null = null;
  let description: string | undefined;
  if (kind === "user") {
    const call = await callTelegramJson<TgAny>(env, "getUserProfilePhotos", {
      user_id: Number(id),
      offset: 0,
      limit: 1,
    });
    if (call.response.ok && isRecord(call.response.result)) {
      const firstPhoto = Array.isArray(call.response.result.photos)
        ? call.response.result.photos[0]
        : undefined;
      if (Array.isArray(firstPhoto)) {
        const sizes = firstPhoto.filter(isRecord).sort((left, right) =>
          Number(left.width || 0) * Number(left.height || 0) - Number(right.width || 0) * Number(right.height || 0)
        );
        const best = sizes.at(-1);
        if (typeof best?.file_id === "string") fileId = best.file_id;
      }
    } else {
      description = call.response.description;
    }
  } else {
    const call = await callTelegramJson<TgAny>(env, "getChat", { chat_id: Number(id) });
    if (call.response.ok && isRecord(call.response.result) && isRecord(call.response.result.photo)) {
      const photo = call.response.result.photo;
      if (typeof photo.small_file_id === "string") fileId = photo.small_file_id;
      else if (typeof photo.big_file_id === "string") fileId = photo.big_file_id;
    } else if (!call.response.ok) {
      description = call.response.description;
    }
  }

  return json({ ok: true, file_id: fileId, description });
}

async function readJsonObject(request: Request): Promise<Record<string, unknown>> {
  const declaredSize = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declaredSize) && declaredSize > MAX_JSON_BYTES) throw new Error("JSON body is too large");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new Error("JSON body is too large");
  const parsed: unknown = text ? JSON.parse(text) : {};
  if (!isRecord(parsed)) throw new Error("Expected a JSON object");
  return parsed;
}

function parseObject(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isTelegramMethod(method: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_]{0,127}$/.test(method);
}

function isSameOriginMutation(request: Request): boolean {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return true;
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function json(value: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return Response.json(value, {
    status,
    headers: { ...SECURITY_HEADERS, ...extraHeaders },
  });
}

function telegramError(status: number, description: string): Response {
  return json({ ok: false, error_code: status, description }, status);
}

function encodeJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}
