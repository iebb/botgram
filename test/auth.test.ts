import { describe, expect, it } from "vitest";
import {
  botCredentialFromRequest,
  botTokenKey,
  constantTimeEqual,
  randomWebhookSecret,
  webhookSecretDigest,
} from "../worker/auth";

const TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG";

describe("browser-owned bot credentials", () => {
  it("accepts bearer or browser transport credentials without creating a server session", async () => {
    const bearer = await botCredentialFromRequest(new Request("https://example.com/api/state", {
      headers: { authorization: `Bearer ${TOKEN}` },
    }));
    expect(bearer).toEqual({
      token: TOKEN,
      botId: "123456789",
      hubKey: await botTokenKey(TOKEN),
    });

    const cookie = await botCredentialFromRequest(new Request("https://example.com/api/file?id=1", {
      headers: { cookie: `humanoid_bot_token=${encodeURIComponent(TOKEN)}` },
    }));
    expect(cookie).toEqual(bearer);
    await expect(botCredentialFromRequest(new Request("https://example.com/api/state"))).resolves.toBeNull();
  });

  it("isolates transient hubs by the complete token instead of its public bot id", async () => {
    await expect(botTokenKey(TOKEN)).resolves.not.toBe(await botTokenKey(`${TOKEN}x`));
  });

  it("verifies stateless webhook secrets from a one-way URL digest", async () => {
    const secret = randomWebhookSecret();
    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const digest = await webhookSecretDigest(secret);
    await expect(constantTimeEqual(await webhookSecretDigest(secret), digest)).resolves.toBe(true);
    await expect(constantTimeEqual(await webhookSecretDigest(`${secret}x`), digest)).resolves.toBe(false);
  });
});
