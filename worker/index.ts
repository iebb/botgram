import { BotHub } from "./bot-hub";
import {
  botCredentialFromRequest,
  constantTimeEqual,
  randomWebhookSecret,
  webhookSecretDigest,
  type BotCredential,
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
class RequestBodyError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

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
      const webhookRoute = url.pathname.match(
        /^\/telegram\/webhook\/([A-Za-z0-9_-]{43})\/([A-Za-z0-9_-]{43})$/
      );
      if (webhookRoute) {
        return await handleTelegramWebhook(request, env, webhookRoute[1], webhookRoute[2]);
      }
      if (url.pathname.startsWith("/telegram/webhook")) {
        return new Response("Webhook route not found", { status: 404 });
      }

      if (url.pathname.startsWith("/api/")) {
        if (!isSameOriginMutation(request)) {
          return telegramError(403, "Cross-origin request rejected");
        }
        const credential = await botCredentialFromRequest(request);
        if (!credential) return telegramError(401, "Bot token required");

        if (url.pathname === "/api/ws") {
          return getHub(env, credential.hubKey).fetch(withoutCredentialHeaders(request));
        }
        if (url.pathname === "/api/state" && request.method === "GET") {
          return await handleState(env, credential);
        }
        if (url.pathname === "/api/read" && request.method === "POST") {
          return await handleRead(request);
        }
        if (url.pathname === "/api/tg" && request.method === "POST") {
          return await handleTelegramCall(request, env, credential);
        }
        if (url.pathname === "/api/file" && request.method === "GET") {
          return await handleTelegramFile(request, env, credential);
        }
        if (url.pathname === "/api/avatar" && request.method === "GET") {
          return await handleAvatar(request, env, credential);
        }
        if (url.pathname === "/api/polling" && request.method === "POST") {
          return await handleLegacyPolling(request, env, credential);
        }
        if (url.pathname === "/api/webhook/install" && request.method === "POST") {
          return json(await installWebhook(env, url.origin, credential));
        }
        return telegramError(404, "API route not found");
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      if (error instanceof RequestBodyError) return telegramError(error.status, error.message);
      return telegramError(500, "Internal error");
    }
  },
} satisfies ExportedHandler<Env>;

function getHub(env: Env, hubKey: string) {
  return env.BOT_HUB.getByName(`bot:${hubKey}`, { locationHint: "apac-ne" });
}

async function handleState(env: Env, credential: BotCredential): Promise<Response> {
  const [identity, webhook] = await Promise.all([
    callTelegramJson<TgUser>(env, credential.token, "getMe"),
    callTelegramJson<TgAny>(env, credential.token, "getWebhookInfo"),
  ]);
  if (!identity.response.ok || !identity.response.result) {
    return telegramError(
      identity.response.error_code === 401 ? 401 : 502,
      identity.response.description || "Telegram rejected this bot token"
    );
  }
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

async function handleTelegramCall(
  request: Request,
  env: Env,
  credential: BotCredential
): Promise<Response> {
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
    call = await callTelegramMultipart(env, credential.token, method, request);
    params = { multipart_upload: true };
  } else {
    const body = await readJsonObject(request);
    method = typeof body.method === "string" ? body.method : "";
    if (!isTelegramMethod(method)) return telegramError(400, "Invalid Bot API method name");
    params = isRecord(body.params) ? cleanParams(body.params) : {};
    meta = isRecord(body.meta) ? body.meta : {};
    call = await callTelegramJson(env, credential.token, method, params);
  }

  if (call.response.error_code !== 401) {
    const hub = getHub(env, credential.hubKey);
    await hub.recordTelegramCallJson(method, encodeJson(params), encodeJson(call.response), call.elapsedMs);
    if (call.response.ok) {
      await hub.absorbTelegramResultJson(
        method,
        encodeJson(params),
        encodeJson(call.response.result),
        encodeJson(meta)
      );
    }
  }
  return json(call.response);
}

async function handleTelegramWebhook(
  request: Request,
  env: Env,
  hubKey: string,
  expectedDigest: string
): Promise<Response> {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const provided = request.headers.get("x-telegram-bot-api-secret-token") || "";
  const providedDigest = provided ? await webhookSecretDigest(provided) : "";
  if (!(await constantTimeEqual(providedDigest, expectedDigest))) {
    return new Response("Unauthorized", { status: 401 });
  }

  const body = await readJsonObject(request);
  if (!Number.isSafeInteger(body.update_id)) return new Response("Bad update", { status: 400 });
  await getHub(env, hubKey).ingestUpdateJson(encodeJson(body));
  return new Response(null, { status: 204 });
}

async function installWebhook(
  env: Env,
  origin: string,
  credential: BotCredential
): Promise<TelegramResponse> {
  const secret = randomWebhookSecret();
  const secretDigest = await webhookSecretDigest(secret);
  const params: TelegramParams = {
    url: `${origin}/telegram/webhook/${credential.hubKey}/${secretDigest}`,
    secret_token: secret,
    allowed_updates: ALL_UPDATE_TYPES,
    drop_pending_updates: false,
    max_connections: 40,
  };
  const call = await callTelegramJson(env, credential.token, "setWebhook", params);
  const hub = getHub(env, credential.hubKey);
  await hub.recordTelegramCallJson("setWebhook", encodeJson(params), encodeJson(call.response), call.elapsedMs);
  await hub.setWebhookState(call.response.ok, call.response.ok ? null : call.response.description || "setWebhook failed");
  return call.response;
}

async function handleLegacyPolling(
  request: Request,
  env: Env,
  credential: BotCredential
): Promise<Response> {
  const body = await readJsonObject(request);
  const action = body.action;
  if (action === "clear") {
    await getHub(env, credential.hubKey).clearSession();
    return json({ ok: true });
  }
  if (action === "start") {
    return json(await installWebhook(env, new URL(request.url).origin, credential));
  }
  if (action === "skip") return json({ ok: true, description: "Webhooks have no local backlog" });
  if (action === "stop") {
    return telegramError(409, "The production webhook stays enabled; use the API Console to remove it intentionally");
  }
  return telegramError(400, "Unknown action");
}

async function handleTelegramFile(
  request: Request,
  env: Env,
  credential: BotCredential
): Promise<Response> {
  const fileId = new URL(request.url).searchParams.get("id") || "";
  if (!fileId || fileId.length > 2048) return new Response("Invalid file id", { status: 400 });
  const info = await callTelegramJson<{ file_path?: string }>(
    env,
    credential.token,
    "getFile",
    { file_id: fileId }
  );
  if (!info.response.ok || !info.response.result?.file_path) {
    return new Response(info.response.description || "File not found", { status: 404 });
  }

  const upstreamHeaders = new Headers();
  const range = request.headers.get("range");
  if (range) upstreamHeaders.set("range", range);
  const upstream = await fetch(telegramFileUrl(env, credential.token, info.response.result.file_path), {
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

async function handleAvatar(
  request: Request,
  env: Env,
  credential: BotCredential
): Promise<Response> {
  const url = new URL(request.url);
  const id = url.searchParams.get("id") || "";
  const kind = url.searchParams.get("kind");
  if (!/^-?\d{1,20}$/.test(id) || (kind !== "user" && kind !== "chat")) {
    return telegramError(400, "Invalid avatar lookup");
  }

  let fileId: string | null = null;
  let description: string | undefined;
  if (kind === "user") {
    const call = await callTelegramJson<TgAny>(env, credential.token, "getUserProfilePhotos", {
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
    const call = await callTelegramJson<TgAny>(env, credential.token, "getChat", { chat_id: Number(id) });
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
  if (Number.isFinite(declaredSize) && declaredSize > MAX_JSON_BYTES) {
    throw new RequestBodyError("JSON body is too large", 413);
  }

  const reader = request.body?.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  if (reader) {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      received += chunk.value.byteLength;
      if (received > MAX_JSON_BYTES) {
        await reader.cancel("JSON body is too large");
        throw new RequestBodyError("JSON body is too large", 413);
      }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  }

  let parsed: unknown;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new RequestBodyError("Malformed JSON body", 400);
  }
  if (!isRecord(parsed)) throw new RequestBodyError("Expected a JSON object", 400);
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

function withoutCredentialHeaders(request: Request): Request {
  const headers = new Headers(request.headers);
  headers.delete("authorization");
  headers.delete("cookie");
  return new Request(request, { headers });
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
