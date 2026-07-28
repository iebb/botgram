import WebSocket from "ws";
import { createHash } from "node:crypto";

const baseUrl = (process.env.HUMANOID_URL || "").replace(/\/$/, "");
const token = process.env.BOT_TOKEN || "";

if (!/^https:\/\//.test(baseUrl)) {
  throw new Error("Set HUMANOID_URL to the deployed https:// URL");
}
if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  throw new Error("BOT_TOKEN is missing or malformed");
}

async function jsonRequest(path, init = {}, authenticated = true) {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (authenticated) headers.set("authorization", `Bearer ${token}`);
  if (init.method && init.method !== "GET") headers.set("origin", baseUrl);

  const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
  const body = await response.json().catch(() => null);
  return { response, body };
}

function expectStatus(result, status, label) {
  if (result.response.status !== status) {
    throw new Error(`${label}: expected HTTP ${status}, got ${result.response.status}`);
  }
}

function connectEvents() {
  const url = new URL("/api/ws", baseUrl);
  url.protocol = "wss:";
  const socket = new WebSocket(url, {
    headers: { Authorization: `Bearer ${token}`, Origin: baseUrl },
  });
  const frames = [];
  const waiters = [];

  socket.on("message", (data) => {
    const frame = JSON.parse(String(data));
    const waiter = waiters.shift();
    if (waiter) waiter.resolve(frame);
    else frames.push(frame);
  });

  socket.on("error", (error) => {
    for (const waiter of waiters.splice(0)) waiter.reject(error);
  });

  const next = (timeoutMs = 5_000) => {
    if (frames.length) return Promise.resolve(frames.shift());
    return new Promise((resolve, reject) => {
      const waiter = {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      };
      const timer = setTimeout(() => {
        const index = waiters.indexOf(waiter);
        if (index >= 0) waiters.splice(index, 1);
        reject(new Error("Timed out waiting for a live WebSocket event"));
      }, timeoutMs);
      waiters.push(waiter);
    });
  };

  return { socket, next };
}

const unauthenticated = await jsonRequest("/api/state", {}, false);
expectStatus(unauthenticated, 401, "protected API");

const state = await jsonRequest("/api/state");
expectStatus(state, 200, "storage-free server state");
if (!state.body?.me?.username) throw new Error("State did not return the bot identity");
for (const key of ["chats", "queries", "rawUpdates", "log"]) {
  if (!Array.isArray(state.body?.[key]) || state.body[key].length !== 0) {
    throw new Error(`/api/state retained ${key}`);
  }
}
if (!state.body?.messages || Object.keys(state.body.messages).length !== 0) {
  throw new Error("/api/state retained messages");
}

const meCall = await jsonRequest(
  "/api/tg",
  { method: "POST", body: JSON.stringify({ method: "getMe", params: {} }) }
);
expectStatus(meCall, 200, "getMe proxy");
if (!meCall.body?.ok || meCall.body.result?.username !== state.body.me.username) {
  throw new Error("The Bot API proxy returned a different bot identity");
}

const events = connectEvents();
const initial = await events.next();
if (initial?.type !== "ready") throw new Error("WebSocket did not begin with a ready event");

const install = await jsonRequest(
  "/api/webhook/install",
  { method: "POST", body: "{}" }
);
expectStatus(install, 200, "webhook installation");
if (!install.body?.ok) throw new Error(install.body?.description || "Telegram rejected the webhook");

const webhookInfo = await jsonRequest(
  "/api/tg",
  { method: "POST", body: JSON.stringify({ method: "getWebhookInfo", params: {} }) }
);
expectStatus(webhookInfo, 200, "getWebhookInfo");
const hubKey = createHash("sha256").update(`humanoid:bot:${token}`).digest("base64url");
const webhookPattern = new RegExp(`^${escapeRegExp(baseUrl)}/telegram/webhook/${hubKey}/[A-Za-z0-9_-]{43}$`);
if (!webhookInfo.body?.ok || !webhookPattern.test(webhookInfo.body.result?.url || "")) {
  throw new Error("Telegram is not pointing at the deployed webhook");
}

const avatar = await jsonRequest(
  `/api/avatar?id=${encodeURIComponent(state.body.me.id)}&kind=user`
);
expectStatus(avatar, 200, "avatar resolution");
if (!avatar.body?.ok) throw new Error("The deployed avatar resolver failed");

events.socket.close(1000, "verification complete");

console.log(JSON.stringify({
  ok: true,
  url: baseUrl,
  bot: `@${state.body.me.username}`,
  groupPrivacyMode: state.body.me.can_read_all_group_messages === false,
  credentialStorage: "browser-local-only",
  serverStateEmpty: true,
  botApiProxy: true,
  websocketReady: true,
  webhook: webhookInfo.body.result.url,
  pendingUpdates: webhookInfo.body.result.pending_update_count,
  lastWebhookError: webhookInfo.body.result.last_error_message || null,
  avatarResolution: true,
  botAvatarAvailable: Boolean(avatar.body.file_id),
}, null, 2));

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
