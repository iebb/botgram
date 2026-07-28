import { describe, expect, it } from "vitest";
import { collectKnownPeople, exactUserId, searchKnownPeople } from "../lib/people";
import type { ChatEntry } from "../lib/types";

const chats: ChatEntry[] = [
  {
    chat: { id: -10042, type: "supergroup", title: "Mithka Users" },
    lastActivity: 300,
    unread: 0,
    knownUsers: {
      "707": { id: 707, is_bot: false, first_name: "Ada", username: "ada_dev" },
      "808": { id: 808, is_bot: false, first_name: "Grace", username: "grace_h" },
      "999": { id: 999, is_bot: true, first_name: "Humanoid" },
    },
  },
  {
    chat: { id: 707, type: "private", first_name: "Ada", username: "ada_dev" },
    lastActivity: 200,
    unread: 0,
    knownUsers: {},
  },
  {
    chat: { id: -44, type: "group", title: "Builders" },
    lastActivity: 100,
    unread: 0,
    knownUsers: {
      "707": { id: 707, is_bot: false, first_name: "Ada Lovelace" },
    },
  },
];

describe("browser-local people search", () => {
  it("deduplicates observed users and links private conversations", () => {
    const people = collectKnownPeople(chats, 999);

    expect(people.map((person) => person.user.id)).toEqual([707, 808]);
    expect(people[0]).toMatchObject({
      user: { id: 707, username: "ada_dev" },
      privateChatId: "707",
      sourceChats: [
        { id: "-10042", name: "Mithka Users" },
        { id: "-44", name: "Builders" },
      ],
    });
  });

  it("matches usernames with or without @ and numeric IDs", () => {
    const people = collectKnownPeople(chats, 999);

    expect(searchKnownPeople(people, "@grace_h").map((person) => person.user.id)).toEqual([808]);
    expect(searchKnownPeople(people, "707").map((person) => person.user.id)).toEqual([707]);
    expect(searchKnownPeople(people, "Ada").map((person) => person.user.id)).toEqual([707]);
  });

  it("accepts only safe positive exact IDs for Telegram resolution", () => {
    expect(exactUserId(" 707 ")).toBe(707);
    expect(exactUserId("@ada_dev")).toBeNull();
    expect(exactUserId("-10042")).toBeNull();
    expect(exactUserId("9999999999999999")).toBeNull();
  });
});
