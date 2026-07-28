import WebSocket from "ws";

const baseUrl = (process.env.HUMANOID_URL || "").replace(/\/$/, "");
const token = process.env.BOT_TOKEN || "";

if (!/^https:\/\//.test(baseUrl)) {
  throw new Error("Set HUMANOID_URL to the deployed https:// URL");
}
if (!/^\d+:[A-Za-z0-9_-]{20,}$/.test(token)) {
  throw new Error("BOT_TOKEN is missing or malformed");
}

async function jsonRequest(path, init = {}, cookie = "") {
  const headers = new Headers(init.headers);
  headers.set("accept", "application/json");
  if (init.body) headers.set("content-type", "application/json");
  if (cookie) headers.set("cookie", cookie);
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

function connectEvents(cookie) {
  const url = new URL("/api/ws", baseUrl);
  url.protocol = "wss:";
  const socket = new WebSocket(url, { headers: { Cookie: cookie, Origin: baseUrl } });
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

const unauthenticated = await jsonRequest("/api/state");
expectStatus(unauthenticated, 401, "protected API");

const login = await jsonRequest("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ token }),
});
expectStatus(login, 200, "login");
if (!login.body?.ok || !login.body?.bot?.username) throw new Error("Login did not return the bot identity");

const setCookie = login.response.headers.get("set-cookie") || "";
const cookie = setCookie.split(";", 1)[0];
if (!cookie.startsWith("humanoid_session=")) throw new Error("Login did not issue the session cookie");
if (/max-age|expires=/i.test(setCookie)) throw new Error("Login cookie is not browser-session-only");

const session = await jsonRequest("/api/auth/session", {}, cookie);
expectStatus(session, 200, "session");
if (!session.body?.authenticated) throw new Error("The deployed session cookie did not verify");

const state = await jsonRequest("/api/state", {}, cookie);
expectStatus(state, 200, "storage-free server state");
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
  { method: "POST", body: JSON.stringify({ method: "getMe", params: {} }) },
  cookie
);
expectStatus(meCall, 200, "getMe proxy");
if (!meCall.body?.ok || meCall.body.result?.username !== login.body.bot.username) {
  throw new Error("The Bot API proxy returned a different bot identity");
}

const events = connectEvents(cookie);
const initial = await events.next();
if (initial?.type !== "ready") throw new Error("WebSocket did not begin with a ready event");

const install = await jsonRequest(
  "/api/webhook/install",
  { method: "POST", body: "{}" },
  cookie
);
expectStatus(install, 200, "webhook installation");
if (!install.body?.ok) throw new Error(install.body?.description || "Telegram rejected the webhook");

const webhookInfo = await jsonRequest(
  "/api/tg",
  { method: "POST", body: JSON.stringify({ method: "getWebhookInfo", params: {} }) },
  cookie
);
expectStatus(webhookInfo, 200, "getWebhookInfo");
const expectedWebhookUrl = `${baseUrl}/telegram/webhook`;
if (!webhookInfo.body?.ok || webhookInfo.body.result?.url !== expectedWebhookUrl) {
  throw new Error("Telegram is not pointing at the deployed webhook");
}

const avatar = await jsonRequest(
  `/api/avatar?id=${encodeURIComponent(login.body.bot.id)}&kind=user`,
  {},
  cookie
);
expectStatus(avatar, 200, "avatar resolution");
if (!avatar.body?.ok) throw new Error("The deployed avatar resolver failed");

events.socket.close(1000, "verification complete");

console.log(JSON.stringify({
  ok: true,
  url: baseUrl,
  bot: `@${login.body.bot.username}`,
  groupPrivacyMode: login.body.bot.can_read_all_group_messages === false,
  authenticated: true,
  serverStateEmpty: true,
  botApiProxy: true,
  websocketReady: true,
  webhook: webhookInfo.body.result.url,
  pendingUpdates: webhookInfo.body.result.pending_update_count,
  lastWebhookError: webhookInfo.body.result.last_error_message || null,
  avatarResolution: true,
  botAvatarAvailable: Boolean(avatar.body.file_id),
}, null, 2));
