import { describe, expect, it } from "vitest";
import {
  constantTimeEqual,
  hasValidSession,
  makeSessionCookie,
  verifyBotToken,
} from "../worker/auth";

const TOKEN = "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG";

describe("dashboard authentication", () => {
  it("compares credentials without accepting lookalikes", async () => {
    await expect(constantTimeEqual("same", "same")).resolves.toBe(true);
    await expect(constantTimeEqual("same", "different")).resolves.toBe(false);
    await expect(verifyBotToken(TOKEN, TOKEN)).resolves.toBe(true);
    await expect(verifyBotToken(`${TOKEN}x`, TOKEN)).resolves.toBe(false);
  });

  it("issues an HttpOnly strict cookie that verifies without exposing the token", async () => {
    const setCookie = await makeSessionCookie(TOKEN);
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).not.toContain(TOKEN);

    const cookie = setCookie.split(";", 1)[0];
    const request = new Request("https://example.com/api/state", {
      headers: { cookie },
    });
    await expect(hasValidSession(request, TOKEN)).resolves.toBe(true);
    await expect(hasValidSession(request, `${TOKEN}x`)).resolves.toBe(false);
  });
});
