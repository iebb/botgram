import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetSavedBotAccount,
  rememberBotAccount,
  savedBotAccounts,
  savedBotToken,
} from "../lib/client/botToken";

const TOKEN_ONE = "123456789:abcdefghijklmnopqrstuvwxyz_ABCDEFG";
const TOKEN_TWO = "987654321:ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefg";

describe("browser-local bot accounts", () => {
  const values = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };

  beforeEach(() => {
    values.clear();
    vi.stubGlobal("window", { localStorage });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("stores multiple tokens behind identity-only account summaries", () => {
    rememberBotAccount(TOKEN_ONE, {
      id: 123456789,
      first_name: "First",
      username: "first_bot",
    });
    rememberBotAccount(TOKEN_TWO, {
      id: 987654321,
      first_name: "Second",
      username: "second_bot",
    });

    expect(savedBotAccounts().map((account) => account.botId)).toEqual(["987654321", "123456789"]);
    expect(savedBotAccounts()).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ token: TOKEN_ONE }),
    ]));
    expect(savedBotToken("123456789")).toBe(TOKEN_ONE);
    expect(savedBotToken("987654321")).toBe(TOKEN_TWO);
  });

  it("replaces rotated credentials and forgets only the selected bot", () => {
    rememberBotAccount(TOKEN_ONE, { id: 123456789, first_name: "First" });
    rememberBotAccount(TOKEN_TWO, { id: 987654321, first_name: "Second" });
    const rotated = `${TOKEN_ONE}x`;
    rememberBotAccount(rotated, { id: 123456789, first_name: "First renamed" });

    expect(savedBotToken("123456789")).toBe(rotated);
    expect(savedBotAccounts().filter((account) => account.botId === "123456789")).toHaveLength(1);

    forgetSavedBotAccount("123456789");
    expect(savedBotToken("123456789")).toBe("");
    expect(savedBotToken("987654321")).toBe(TOKEN_TWO);
  });
});
