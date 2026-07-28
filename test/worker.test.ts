import { env, reset, SELF } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import type { AppSnapshot, StreamEvent } from "../lib/types";
import { makeSessionCookie } from "../worker/auth";

const CHAT = {
  id: -100424242,
  type: "supergroup",
  title: "Worker test chat",
} as const;

function hub() {
  const botId = env.BOT_TOKEN.split(":", 1)[0] || "primary";
  return env.BOT_HUB.getByName(`bot:${botId}`);
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

async function sessionCookie(): Promise<string> {
  return (await makeSessionCookie(env.BOT_TOKEN)).split(";", 1)[0];
}

function nextFrame(socket: WebSocket): Promise<StreamEvent> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("Timed out waiting for WebSocket frame")), 2_000);
    socket.addEventListener(
      "message",
      (event) => {
        clearTimeout(timeout);
        resolve(JSON.parse(String(event.data)) as StreamEvent);
      },
      { once: true }
    );
  });
}

describe("Humanoid Worker", () => {
  beforeEach(async () => {
    await reset();
  });

  it("protects dashboard APIs and rejects forged webhook deliveries", async () => {
    const state = await SELF.fetch("https://example.com/api/state");
    expect(state.status).toBe(401);
    await expect(state.json()).resolves.toMatchObject({ ok: false, error_code: 401 });

    const webhook = await SELF.fetch("https://example.com/telegram/webhook", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-telegram-bot-api-secret-token": "wrong",
      },
      body: JSON.stringify(update(10)),
    });
    expect(webhook.status).toBe(401);
  });

  it("persists updates once and retains Bot API constraints", async () => {
    const stub = hub();
    const incoming = update(20);
    await stub.ingestUpdateJson(JSON.stringify(incoming));
    await stub.ingestUpdateJson(JSON.stringify(incoming));

    const snapshot = JSON.parse(await stub.getSnapshotJson()) as AppSnapshot;
    expect(snapshot.polling.updatesSeen).toBe(1);
    expect(snapshot.rawUpdates).toHaveLength(1);
    expect(snapshot.chats).toHaveLength(1);
    expect(snapshot.chats[0].unread).toBe(1);
    expect(snapshot.messages[String(CHAT.id)]).toHaveLength(1);
    expect(snapshot.messages[String(CHAT.id)][0]).toMatchObject({ text: "near-real-time", _key: "m:42" });

    await stub.markRead(String(CHAT.id));
    const readSnapshot = JSON.parse(await stub.getSnapshotJson()) as AppSnapshot;
    expect(readSnapshot.chats[0].unread).toBe(0);
  });

  it("redacts token-bearing methods from durable logs", async () => {
    await hub().recordTelegramCallJson(
      "getManagedBotToken",
      JSON.stringify({ user_id: 707, provider_token: "top-secret" }),
      JSON.stringify({ ok: true, result: { token: "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG" } }),
      12
    );

    const snapshot = JSON.parse(await hub().getSnapshotJson()) as AppSnapshot;
    expect(snapshot.log[0].params).toMatchObject({ provider_token: "[redacted]" });
    expect(snapshot.log[0].result).toBe("[sensitive result shown once in the Console only]");
    expect(JSON.stringify(snapshot)).not.toContain("top-secret");
  });

  it("keeps ephemeral identities stable and handles edits and deletion", async () => {
    const ephemeral = {
      update_id: 25,
      message: {
        message_id: 0,
        ephemeral_message_id: 991,
        date: Math.floor(Date.now() / 1000),
        chat: CHAT,
        from: { id: 707, is_bot: false, first_name: "Ada" },
        receiver_user: { id: 707, is_bot: false, first_name: "Ada" },
        text: "private command",
      },
    };
    await hub().ingestUpdateJson(JSON.stringify(ephemeral));
    let snapshot = JSON.parse(await hub().getSnapshotJson()) as AppSnapshot;
    expect(snapshot.messages[String(CHAT.id)][0]._key).toBe("e:991");

    await hub().absorbTelegramResultJson(
      "editEphemeralMessageText",
      JSON.stringify({
        chat_id: CHAT.id,
        receiver_user_id: 707,
        ephemeral_message_id: 991,
        text: "edited privately",
      }),
      "true",
      "{}"
    );
    snapshot = JSON.parse(await hub().getSnapshotJson()) as AppSnapshot;
    expect(snapshot.messages[String(CHAT.id)][0].text).toBe("edited privately");

    await hub().absorbTelegramResultJson(
      "deleteEphemeralMessage",
      JSON.stringify({ chat_id: CHAT.id, receiver_user_id: 707, ephemeral_message_id: 991 }),
      "true",
      "{}"
    );
    snapshot = JSON.parse(await hub().getSnapshotJson()) as AppSnapshot;
    expect(snapshot.messages[String(CHAT.id)] || []).toHaveLength(0);
  });

  it("routes guest-mode messages to the answer queue without conflating chat histories", async () => {
    await hub().ingestUpdateJson(JSON.stringify({
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
    const snapshot = JSON.parse(await hub().getSnapshotJson()) as AppSnapshot;
    expect(snapshot.queries[0]).toMatchObject({ id: "guest_message-guest-26", kind: "guest_message" });
    expect(snapshot.messages[String(CHAT.id)] || []).toHaveLength(0);
  });

  it("pushes an ingested update over the authenticated WebSocket immediately", async () => {
    const response = await SELF.fetch("https://example.com/api/ws", {
      headers: { cookie: await sessionCookie(), upgrade: "websocket" },
    });
    expect(response.status).toBe(101);
    const socket = response.webSocket;
    expect(socket).not.toBeNull();
    socket!.accept();

    const initial = await nextFrame(socket!);
    expect(initial.type).toBe("snapshot");

    const firstEvent = nextFrame(socket!);
    await hub().ingestUpdateJson(JSON.stringify(update(30, 77)));
    expect((await firstEvent).type).toBe("raw");

    const expected = ["message", "chat", "polling"];
    for (const type of expected) expect((await nextFrame(socket!)).type).toBe(type);
    socket!.close(1000, "test complete");
  });

  it("serves cached user avatars without exposing Telegram file credentials", async () => {
    await hub().setAvatarJson("user:707", JSON.stringify({ fileId: "avatar-file-id" }), Date.now() + 60_000);
    const response = await SELF.fetch("https://example.com/api/avatar?id=707&kind=user", {
      headers: { cookie: await sessionCookie() },
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, file_id: "avatar-file-id" });
  });
});
