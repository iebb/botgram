import { env, reset, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppSnapshot, StreamEvent } from "../lib/types";
import { botTokenKey, webhookSecretDigest } from "../worker/auth";

const TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG";

const CHAT = {
  id: -100424242,
  type: "supergroup",
  title: "Worker test chat",
} as const;

async function hub() {
  return env.BOT_HUB.getByName(`bot:${await botTokenKey(TOKEN)}`);
}

function update(updateId: number, messageId = 42) {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date: Math.floor(Date.now() / 1000),
      chat: CHAT,
      from: { id: 707, is_bot: false, first_name: "Ada" },
      text: "near-real-time",
    },
  };
}

function nextFrame(socket: WebSocket): Promise<StreamEvent> {
  return collectFrames(socket, 1).then(([frame]) => frame);
}

function collectFrames(socket: WebSocket, count: number): Promise<StreamEvent[]> {
  return new Promise((resolve, reject) => {
    const frames: StreamEvent[] = [];
    const timeout = setTimeout(() => {
      socket.removeEventListener("message", onMessage);
      reject(new Error(`Timed out waiting for ${count} WebSocket frame(s); got ${frames.length}`));
    }, 2_000);
    const onMessage = (event: MessageEvent) => {
      frames.push(JSON.parse(String(event.data)) as StreamEvent);
      if (frames.length < count) return;
      clearTimeout(timeout);
      socket.removeEventListener("message", onMessage);
      resolve(frames);
    };
    socket.addEventListener("message", onMessage);
  });
}

function eventsIn(frame: StreamEvent): StreamEvent[] {
  return frame.type === "batch" ? frame.events : [frame];
}

async function openSocket(
  clientId = "test-client-0001",
  activate = true
): Promise<WebSocket> {
  const response = await SELF.fetch(`https://example.com/api/ws?client=${clientId}`, {
    headers: { authorization: `Bearer ${TOKEN}`, upgrade: "websocket" },
  });
  expect(response.status).toBe(101);
  const socket = response.webSocket;
  expect(socket).not.toBeNull();
  socket!.accept();
  expect((await nextFrame(socket!)).type).toBe("ready");
  if (activate) expect(await (await hub()).setClientActive(clientId, true)).toBe(true);
  return socket!;
}

describe("Humanoid Worker", () => {
  beforeEach(async () => {
    await reset();
  });

  it("protects dashboard APIs and rejects forged webhook deliveries", async () => {
    const state = await SELF.fetch("https://example.com/api/state");
    expect(state.status).toBe(401);
    await expect(state.json()).resolves.toMatchObject({ ok: false, error_code: 401 });

    const webhook = await SELF.fetch(
      `https://example.com/telegram/webhook/${await botTokenKey(TOKEN)}/${await webhookSecretDigest("right-secret")}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "wrong",
        },
        body: JSON.stringify(update(10)),
      }
    );
    expect(webhook.status).toBe(401);

    const retryable = await SELF.fetch(
      `https://example.com/telegram/webhook/${await botTokenKey(TOKEN)}/${await webhookSecretDigest("right-secret")}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "right-secret",
        },
        body: JSON.stringify(update(11)),
      }
    );
    expect(retryable.status).toBe(503);
    expect(retryable.headers.get("retry-after")).toBe("1");

    const socket = await openSocket();
    const accepted = await SELF.fetch(
      `https://example.com/telegram/webhook/${await botTokenKey(TOKEN)}/${await webhookSecretDigest("right-secret")}`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-telegram-bot-api-secret-token": "right-secret",
        },
        body: JSON.stringify(update(11)),
      }
    );
    expect(accepted.status).toBe(204);
    socket.close(1000, "test complete");
  });

  it("tracks distinct browser clients without storing credentials or updates", async () => {
    const first = await openSocket("test-client-0001");
    expect(await (await hub()).hasActiveClients()).toBe(true);

    const second = await openSocket("test-client-0002");
    expect(await (await hub()).releaseClientAndHasOthers("test-client-0001")).toBe(true);
    expect(await (await hub()).releaseClientAndHasOthers("test-client-0002")).toBe(false);
    expect(await (await hub()).hasActiveClients()).toBe(false);
    expect(await (await hub()).ingestUpdateIfConnectedJson(JSON.stringify(update(19)))).toBe(false);

    const snapshot = JSON.parse(await (await hub()).getSnapshotJson()) as AppSnapshot;
    expect(snapshot.chats).toEqual([]);
    expect(snapshot.messages).toEqual({});
    first.close(1000, "test complete");
    second.close(1000, "test complete");
  });

  it("does not accept queued webhook deliveries until the dashboard activates its lease", async () => {
    const clientId = "test-client-gated";
    const socket = await openSocket(clientId, false);
    expect(await (await hub()).hasActiveClients()).toBe(false);

    const webhookUrl =
      `https://example.com/telegram/webhook/${await botTokenKey(TOKEN)}/${await webhookSecretDigest("right-secret")}`;
    const paused = await SELF.fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "right-secret",
      },
      body: JSON.stringify(update(18)),
    });
    expect(paused.status).toBe(503);

    expect(await (await hub()).setClientActive(clientId, true)).toBe(true);
    const framePromise = nextFrame(socket);
    const accepted = await SELF.fetch(webhookUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "right-secret",
      },
      body: JSON.stringify(update(18)),
    });
    expect(accepted.status).toBe(204);
    expect((await framePromise).type).toBe("batch");
    socket.close(1000, "test complete");
  });

  it("fans ordinary supergroup text out immediately without retaining its payload", async () => {
    const socket = await openSocket();
    const framePromise = nextFrame(socket);
    const incoming = update(20);
    await (await hub()).ingestUpdateJson(JSON.stringify(incoming));
    const frame = await framePromise;
    const events = eventsIn(frame);

    expect(frame.type).toBe("batch");
    expect(events.map((event) => event.type)).toEqual(["raw", "message", "chat"]);
    expect(events.find((event) => event.type === "message")).toMatchObject({
      chatId: String(CHAT.id),
      message: { text: "near-real-time", _key: "m:42" },
    });

    await (await hub()).ingestUpdateJson(JSON.stringify(incoming));
    const snapshot = JSON.parse(await (await hub()).getSnapshotJson()) as AppSnapshot;
    expect(snapshot.polling.updatesSeen).toBe(0);
    expect(snapshot.chats).toEqual([]);
    expect(snapshot.messages).toEqual({});
    expect(snapshot.rawUpdates).toEqual([]);
    socket.close(1000, "test complete");
  });

  it("emits redacted API activity only to the current WebSocket session", async () => {
    const socket = await openSocket();
    const framePromise = nextFrame(socket);
    await (await hub()).recordTelegramCallJson(
      "getManagedBotToken",
      JSON.stringify({ user_id: 707, provider_token: "top-secret" }),
      JSON.stringify({ ok: true, result: { token: "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG" } }),
      12
    );

    const frame = await framePromise;
    expect(frame).toMatchObject({
      type: "log",
      entry: {
        params: { provider_token: "[redacted]" },
        result: "[sensitive response omitted from the session log]",
      },
    });
    const snapshot = JSON.parse(await (await hub()).getSnapshotJson()) as AppSnapshot;
    expect(snapshot.log).toEqual([]);
    expect(JSON.stringify(snapshot)).not.toContain("top-secret");
    socket.close(1000, "test complete");
  });

  it("routes guest and ephemeral interactions as transient events", async () => {
    const socket = await openSocket();
    const guestFrame = nextFrame(socket);
    await (await hub()).ingestUpdateJson(JSON.stringify({
      update_id: 26,
      guest_message: {
        message_id: 0,
        guest_query_id: "guest-26",
        date: Math.floor(Date.now() / 1000),
        chat: CHAT,
        from: { id: 707, is_bot: false, first_name: "Ada" },
        text: "@bot summarize this",
      },
    }));
    expect(eventsIn(await guestFrame).at(-1)).toMatchObject({
      type: "query",
      query: { id: "guest_message-guest-26", kind: "guest_message" },
    });

    const messageFrame = nextFrame(socket);
    await (await hub()).ingestUpdateJson(JSON.stringify({
      update_id: 27,
      message: {
        message_id: 0,
        ephemeral_message_id: 991,
        date: Math.floor(Date.now() / 1000),
        chat: CHAT,
        from: { id: 707, is_bot: false, first_name: "Ada" },
        text: "private command",
      },
    }));
    expect(eventsIn(await messageFrame).find((event) => event.type === "message")).toMatchObject({
      message: { _key: "e:991" },
    });

    const patchFrame = nextFrame(socket);
    await (await hub()).absorbTelegramResultJson(
      "editEphemeralMessageText",
      JSON.stringify({ chat_id: CHAT.id, ephemeral_message_id: 991, text: "edited privately" }),
      "true",
      "{}"
    );
    await expect(patchFrame).resolves.toMatchObject({
      type: "message_patch",
      messageKey: "e:991",
      patch: { text: "edited privately" },
    });
    socket.close(1000, "test complete");
  });

  it("streams individual and aggregate reactions for browser rendering", async () => {
    const socket = await openSocket();
    const individualFrame = nextFrame(socket);
    await (await hub()).ingestUpdateJson(JSON.stringify({
      update_id: 31,
      message_reaction: {
        chat: CHAT,
        message_id: 42,
        date: Math.floor(Date.now() / 1000),
        user: { id: 707, is_bot: false, first_name: "Ada" },
        old_reaction: [{ type: "emoji", emoji: "👋" }],
        new_reaction: [{ type: "custom_emoji", custom_emoji_id: "5368324170671202286" }],
      },
    }));
    expect(eventsIn(await individualFrame).find((event) => event.type === "reaction")).toMatchObject({
      type: "reaction",
      messageId: 42,
      oldReactions: [{ type: "emoji", emoji: "👋" }],
      reactions: [{ type: "custom_emoji", custom_emoji_id: "5368324170671202286" }],
    });

    const aggregateFrame = nextFrame(socket);
    await (await hub()).ingestUpdateJson(JSON.stringify({
      update_id: 32,
      message_reaction_count: {
        chat: CHAT,
        message_id: 42,
        date: Math.floor(Date.now() / 1000),
        reactions: [
          { type: { type: "emoji", emoji: "👋" }, total_count: 2 },
          { type: { type: "custom_emoji", custom_emoji_id: "5368324170671202286" }, total_count: 1 },
        ],
      },
    }));
    expect(eventsIn(await aggregateFrame).find((event) => event.type === "reaction")).toMatchObject({
      type: "reaction",
      messageId: 42,
      replace: true,
      reactions: [
        { type: { type: "emoji", emoji: "👋" }, total_count: 2 },
        { type: { type: "custom_emoji" }, total_count: 1 },
      ],
    });
    socket.close(1000, "test complete");
  });

  it("mirrors a successful bot reaction because Telegram suppresses its update", async () => {
    const socket = await openSocket();
    const framePromise = nextFrame(socket);
    await (await hub()).absorbTelegramResultJson(
      "setMessageReaction",
      JSON.stringify({
        chat_id: CHAT.id,
        message_id: 42,
        reaction: [{ type: "custom_emoji", custom_emoji_id: "5368324170671202286" }],
      }),
      "true",
      JSON.stringify({ reactionLocalId: "reaction-local-42" })
    );

    await expect(framePromise).resolves.toMatchObject({
      type: "reaction",
      chatId: String(CHAT.id),
      messageId: 42,
      own: true,
      observationId: "reaction-local-42",
      reactions: [{ type: "custom_emoji", custom_emoji_id: "5368324170671202286" }],
    });
    socket.close(1000, "test complete");
  });
});
