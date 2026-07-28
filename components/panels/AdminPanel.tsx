"use client";

import React, { useState } from "react";
import { useStore } from "../Store";
import { Collapsible, Field, Json, Select, TextArea, TextInput, Toggle } from "../UI";
import { userName } from "@/lib/format";
import type { TgAny } from "@/lib/types";
import {
  canPinMessages,
  canSetChatStickerSet,
  hasAdminPermission,
  isBotAdministrator,
} from "@/lib/chatPermissions";

const MEMBER_PERMS = [
  "can_send_messages",
  "can_send_audios",
  "can_send_documents",
  "can_send_photos",
  "can_send_videos",
  "can_send_video_notes",
  "can_send_voice_notes",
  "can_send_polls",
  "can_send_other_messages",
  "can_add_web_page_previews",
  "can_change_info",
  "can_invite_users",
  "can_pin_messages",
  "can_manage_topics",
  "can_manage_direct_messages",
  "can_manage_tags",
];

const ADMIN_RIGHTS = [
  "is_anonymous",
  "can_manage_chat",
  "can_delete_messages",
  "can_manage_video_chats",
  "can_restrict_members",
  "can_promote_members",
  "can_change_info",
  "can_invite_users",
  "can_post_stories",
  "can_edit_stories",
  "can_delete_stories",
  "can_post_messages",
  "can_edit_messages",
  "can_pin_messages",
  "can_manage_topics",
];

export default function AdminPanel() {
  const { chat, selectedChatId, call, notify, botChatMember } = useStore();
  const [result, setResult] = useState<unknown>(null);

  if (!chat || !selectedChatId) {
    return (
      <div className="muted" style={{ padding: "1.5rem", textAlign: "center" }}>
        Select a chat first.
      </div>
    );
  }
  if (!isBotAdministrator(botChatMember)) return null;
  const chat_id = Number(selectedChatId);
  const knownUsers = Object.values(chat.knownUsers || {}) as TgAny[];
  const canPromote = hasAdminPermission(botChatMember, "can_promote_members");
  const canRestrict = hasAdminPermission(botChatMember, "can_restrict_members");
  const canChangeInfo = hasAdminPermission(botChatMember, "can_change_info");
  const canInvite = hasAdminPermission(botChatMember, "can_invite_users");
  const canManageTopics = hasAdminPermission(botChatMember, "can_manage_topics");
  const canPin = canPinMessages(chat.chat, botChatMember);
  const canSetStickerSet = canSetChatStickerSet(chat.chat, botChatMember);
  const grantableRights = ADMIN_RIGHTS.filter((right) =>
    right === "is_anonymous"
    || botChatMember?.status === "creator"
    || botChatMember?.[right] === true
  );

  const run = async (method: string, params: TgAny, okMsg?: string) => {
    const res = await call(method, params);
    setResult(res.ok ? res.result : res);
    if (res.ok && okMsg) notify(okMsg);
  };

  return (
    <div className="scroll-y" style={{ flex: 1 }}>
      <Members
        chat_id={chat_id}
        knownUsers={knownUsers}
        run={run}
        canPromote={canPromote}
        grantableRights={grantableRights}
      />
      {canRestrict && <Restrictions chat_id={chat_id} knownUsers={knownUsers} run={run} />}
      {(canChangeInfo || canRestrict || canPin || canSetStickerSet) && (
        <ChatSettings
          chat_id={chat_id}
          run={run}
          canChangeInfo={canChangeInfo}
          canRestrict={canRestrict}
          canPin={canPin}
          canSetStickerSet={canSetStickerSet}
        />
      )}
      {canInvite && <InviteLinks chat_id={chat_id} run={run} />}
      {chat.chat.is_forum && canManageTopics && <ForumTopics chat_id={chat_id} run={run} />}
      <Danger chat_id={chat_id} run={run} />

      {result != null && (
        <div className="section" style={{ borderBottom: "none" }}>
          <div className="section-title">Last result</div>
          <Json value={result} />
        </div>
      )}
    </div>
  );
}

type Run = (method: string, params: TgAny, okMsg?: string) => Promise<void>;

function UserPicker({
  value,
  onChange,
  users,
}: {
  value: string;
  onChange: (v: string) => void;
  users: TgAny[];
}) {
  return (
    <>
      <Field label="User">
        <Select
          value={users.some((u) => String(u.id) === value) ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          options={[
            { value: "", label: "— pick a known user —" },
            ...users.map((u) => ({ value: String(u.id), label: `${userName(u)} (${u.id})` })),
          ]}
        />
      </Field>
      <Field label="…or user_id">
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder="123456789" />
      </Field>
    </>
  );
}

function Members({
  chat_id,
  knownUsers,
  run,
  canPromote,
  grantableRights,
}: {
  chat_id: number;
  knownUsers: TgAny[];
  run: Run;
  canPromote: boolean;
  grantableRights: string[];
}) {
  const [uid, setUid] = useState("");
  const [title, setTitle] = useState("");
  const [rights, setRights] = useState<Record<string, boolean>>({
    can_delete_messages: true,
    can_pin_messages: true,
  });

  return (
    <Collapsible title="Members & admins" defaultOpen>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.625rem" }}>
        <button className="btn sm" onClick={() => run("getChatAdministrators", { chat_id })}>
          List admins
        </button>
        <button className="btn sm" onClick={() => run("getChatMemberCount", { chat_id })}>
          Member count
        </button>
      </div>

      <UserPicker value={uid} onChange={setUid} users={knownUsers} />

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginBottom: "0.625rem" }}>
        <button
          className="btn sm"
          onClick={() => run("getChatMember", { chat_id, user_id: Number(uid) })}
        >
          Get member
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run("getUserProfilePhotos", { user_id: Number(uid), limit: 5 })
          }
        >
          Profile photos
        </button>
        <button
          className="btn sm"
          onClick={() => run("getUserChatBoosts", { chat_id, user_id: Number(uid) })}
        >
          Boosts
        </button>
      </div>

      {canPromote && (
        <>
          <div className="section-title">Promote</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.5rem" }}>
            {grantableRights.map((r) => (
              <Toggle
                key={r}
                checked={!!rights[r]}
                onChange={(v) => setRights({ ...rights, [r]: v })}
                label={r.replace(/^can_|^is_/, "")}
              />
            ))}
          </div>
          <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
            <button
              className="btn sm primary"
              onClick={() => run("promoteChatMember", {
                chat_id,
                user_id: Number(uid),
                ...Object.fromEntries(grantableRights.map((right) => [right, !!rights[right]])),
              }, "Promoted")}
            >
              Promote
            </button>
            <button
              className="btn sm"
              onClick={() =>
                run(
                  "promoteChatMember",
                  {
                    chat_id,
                    user_id: Number(uid),
                    ...Object.fromEntries(ADMIN_RIGHTS.map((r) => [r, false])),
                  },
                  "Demoted"
                )
              }
            >
              Demote
            </button>
          </div>

          <Field label="Admin custom title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Moderator" />
          </Field>
          <button
            className="btn sm"
            onClick={() =>
              run(
                "setChatAdministratorCustomTitle",
                { chat_id, user_id: Number(uid), custom_title: title },
                "Custom title set"
              )
            }
          >
            Set title
          </button>
        </>
      )}
    </Collapsible>
  );
}

function Restrictions({
  chat_id,
  knownUsers,
  run,
}: {
  chat_id: number;
  knownUsers: TgAny[];
  run: Run;
}) {
  const [uid, setUid] = useState("");
  const [until, setUntil] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({});
  const [revokeMessages, setRevokeMessages] = useState(false);

  const untilDate = until ? Math.floor(new Date(until).getTime() / 1000) : undefined;

  return (
    <Collapsible title="Ban & restrict">
      <UserPicker value={uid} onChange={setUid} users={knownUsers} />
      <Field label="Until (empty = forever)">
        <TextInput type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>

      <div className="section-title">Permissions while restricted</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.5rem" }}>
        {MEMBER_PERMS.map((p) => (
          <Toggle
            key={p}
            checked={!!perms[p]}
            onChange={(v) => setPerms({ ...perms, [p]: v })}
            label={p.replace(/^can_/, "")}
          />
        ))}
      </div>

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "restrictChatMember",
              {
                chat_id,
                user_id: Number(uid),
                permissions: Object.fromEntries(MEMBER_PERMS.map((p) => [p, !!perms[p]])),
                until_date: untilDate,
                use_independent_chat_permissions: true,
              },
              "Restricted"
            )
          }
        >
          Restrict
        </button>
        <button
          className="btn sm danger"
          onClick={() =>
            run(
              "banChatMember",
              {
                chat_id,
                user_id: Number(uid),
                until_date: untilDate,
                revoke_messages: revokeMessages || undefined,
              },
              "Banned"
            )
          }
        >
          Ban
        </button>
        <button
          className="btn sm"
          onClick={() =>
            run("unbanChatMember", { chat_id, user_id: Number(uid), only_if_banned: true }, "Unbanned")
          }
        >
          Unban
        </button>
      </div>
      <Toggle checked={revokeMessages} onChange={setRevokeMessages} label="Delete their messages on ban" />

      <div className="section-title" style={{ marginTop: "0.75rem" }}>
        Sender chats (channels posting as themselves)
      </div>
      <SenderChatBan chat_id={chat_id} run={run} />
    </Collapsible>
  );
}

function SenderChatBan({ chat_id, run }: { chat_id: number; run: Run }) {
  const [sid, setSid] = useState("");
  return (
    <>
      <Field label="sender_chat_id">
        <TextInput value={sid} onChange={(e) => setSid(e.target.value)} placeholder="-100…" />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem" }}>
        <button
          className="btn sm danger"
          onClick={() => run("banChatSenderChat", { chat_id, sender_chat_id: Number(sid) }, "Banned")}
        >
          Ban sender chat
        </button>
        <button
          className="btn sm"
          onClick={() => run("unbanChatSenderChat", { chat_id, sender_chat_id: Number(sid) }, "Unbanned")}
        >
          Unban
        </button>
      </div>
    </>
  );
}

function ChatSettings({
  chat_id,
  run,
  canChangeInfo,
  canRestrict,
  canPin,
  canSetStickerSet,
}: {
  chat_id: number;
  run: Run;
  canChangeInfo: boolean;
  canRestrict: boolean;
  canPin: boolean;
  canSetStickerSet: boolean;
}) {
  const { upload, notify } = useStore();
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [perms, setPerms] = useState<Record<string, boolean>>({
    can_send_messages: true,
    can_send_photos: true,
    can_send_other_messages: true,
    can_add_web_page_previews: true,
    can_invite_users: true,
  });
  const [stickerSet, setStickerSet] = useState("");

  return (
    <Collapsible title="Chat settings">
      {canChangeInfo && (
        <>
          <Field label="Title">
            <TextInput value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <button className="btn sm" onClick={() => run("setChatTitle", { chat_id, title }, "Title set")}>
            Set title
          </button>

          <Field label="Description">
            <TextArea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} />
          </Field>
          <button
            className="btn sm"
            onClick={() => run("setChatDescription", { chat_id, description: desc }, "Description set")}
          >
            Set description
          </button>

          <Field label="Chat photo">
            <input
              type="file"
              accept="image/*"
              className="input"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                const res = await upload("setChatPhoto", { chat_id }, { photo: f });
                if (res.ok) notify("Chat photo set");
              }}
            />
          </Field>
          <button className="btn sm" onClick={() => run("deleteChatPhoto", { chat_id }, "Photo deleted")}>
            Delete photo
          </button>
        </>
      )}

      {canRestrict && (
        <>
          <div className="section-title" style={{ marginTop: canChangeInfo ? "0.75rem" : 0 }}>
            Default permissions
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 0.5rem" }}>
            {MEMBER_PERMS.map((p) => (
              <Toggle
                key={p}
                checked={!!perms[p]}
                onChange={(v) => setPerms({ ...perms, [p]: v })}
                label={p.replace(/^can_/, "")}
              />
            ))}
          </div>
          <button
            className="btn sm"
            style={{ marginTop: "0.5rem" }}
            onClick={() =>
              run(
                "setChatPermissions",
                {
                  chat_id,
                  permissions: Object.fromEntries(MEMBER_PERMS.map((p) => [p, !!perms[p]])),
                  use_independent_chat_permissions: true,
                },
                "Permissions set"
              )
            }
          >
            Apply permissions
          </button>
        </>
      )}

      {canSetStickerSet && (
        <>
          <Field label="Group sticker set" hint="Available because Telegram reports can_set_sticker_set.">
            <TextInput value={stickerSet} onChange={(e) => setStickerSet(e.target.value)} />
          </Field>
          <div style={{ display: "flex", gap: "0.375rem" }}>
            <button
              className="btn sm"
              onClick={() => run("setChatStickerSet", { chat_id, sticker_set_name: stickerSet }, "Set")}
            >
              Set sticker set
            </button>
            <button className="btn sm" onClick={() => run("deleteChatStickerSet", { chat_id }, "Removed")}>
              Remove
            </button>
          </div>
        </>
      )}

      {canPin && (
        <>
          <div className="section-title" style={{ marginTop: "0.75rem" }}>
            Pins
          </div>
          <button
            className="btn sm"
            onClick={() => run("unpinAllChatMessages", { chat_id }, "All messages unpinned")}
          >
            Unpin all messages
          </button>
        </>
      )}
    </Collapsible>
  );
}

function InviteLinks({ chat_id, run }: { chat_id: number; run: Run }) {
  const [name, setName] = useState("");
  const [limit, setLimit] = useState("");
  const [expire, setExpire] = useState("");
  const [joinRequest, setJoinRequest] = useState(false);
  const [link, setLink] = useState("");
  const [subPrice, setSubPrice] = useState("");

  const expireDate = expire ? Math.floor(new Date(expire).getTime() / 1000) : undefined;

  return (
    <Collapsible title="Invite links & join requests">
      <Field label="Link name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Member limit">
        <TextInput type="number" value={limit} onChange={(e) => setLimit(e.target.value)} />
      </Field>
      <Field label="Expires at">
        <TextInput type="datetime-local" value={expire} onChange={(e) => setExpire(e.target.value)} />
      </Field>
      <Toggle checked={joinRequest} onChange={setJoinRequest} label="Creates join request" />

      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap", margin: "0.5rem 0" }}>
        <button
          className="btn sm primary"
          onClick={() =>
            run(
              "createChatInviteLink",
              {
                chat_id,
                name: name || undefined,
                member_limit: !joinRequest && limit ? Number(limit) : undefined,
                expire_date: expireDate,
                creates_join_request: joinRequest || undefined,
              },
              "Invite link created"
            )
          }
        >
          Create
        </button>
        <button
          className="btn sm"
          onClick={() => run("exportChatInviteLink", { chat_id }, "Primary link replaced")}
        >
          Replace primary
        </button>
      </div>

      <Field label="Existing invite_link (to edit or revoke)">
        <TextInput value={link} onChange={(e) => setLink(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        <button
          className="btn sm"
          onClick={() =>
            run(
              "editChatInviteLink",
              {
                chat_id,
                invite_link: link,
                name: name || undefined,
                member_limit: !joinRequest && limit ? Number(limit) : undefined,
                expire_date: expireDate,
                creates_join_request: joinRequest || undefined,
              },
              "Link edited"
            )
          }
        >
          Edit
        </button>
        <button
          className="btn sm danger"
          onClick={() => run("revokeChatInviteLink", { chat_id, invite_link: link }, "Link revoked")}
        >
          Revoke
        </button>
      </div>

      <Field label="Subscription link price (Stars / month)">
        <TextInput type="number" value={subPrice} onChange={(e) => setSubPrice(e.target.value)} />
      </Field>
      <button
        className="btn sm"
        onClick={() =>
          run(
            "createChatSubscriptionInviteLink",
            {
              chat_id,
              name: name || undefined,
              subscription_period: 2592000,
              subscription_price: Number(subPrice) || 1,
            },
            "Subscription link created"
          )
        }
      >
        Create subscription link
      </button>
    </Collapsible>
  );
}

function ForumTopics({ chat_id, run }: { chat_id: number; run: Run }) {
  const [name, setName] = useState("");
  const [threadId, setThreadId] = useState("");
  const [iconColor, setIconColor] = useState("7322096");

  return (
    <Collapsible title="Forum topics">
      <Field label="Topic name">
        <TextInput value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Icon colour">
        <Select
          value={iconColor}
          onChange={(e) => setIconColor(e.target.value)}
          options={[
            { value: "7322096", label: "Blue" },
            { value: "16766590", label: "Yellow" },
            { value: "13338331", label: "Violet" },
            { value: "9367192", label: "Green" },
            { value: "16749490", label: "Rose" },
            { value: "16478047", label: "Red" },
          ]}
        />
      </Field>
      <button
        className="btn sm primary"
        onClick={() =>
          run("createForumTopic", { chat_id, name, icon_color: Number(iconColor) }, "Topic created")
        }
      >
        Create topic
      </button>

      <Field label="message_thread_id">
        <TextInput value={threadId} onChange={(e) => setThreadId(e.target.value)} />
      </Field>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        {[
          ["editForumTopic", "Rename"],
          ["closeForumTopic", "Close"],
          ["reopenForumTopic", "Reopen"],
          ["deleteForumTopic", "Delete"],
          ["unpinAllForumTopicMessages", "Unpin all"],
        ].map(([m, label]) => (
          <button
            key={m}
            className={`btn sm${m === "deleteForumTopic" ? " danger" : ""}`}
            onClick={() =>
              run(
                m,
                {
                  chat_id,
                  message_thread_id: Number(threadId),
                  name: m === "editForumTopic" ? name || undefined : undefined,
                },
                label
              )
            }
          >
            {label}
          </button>
        ))}
      </div>

      <div className="section-title" style={{ marginTop: "0.75rem" }}>
        General topic
      </div>
      <div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
        {[
          ["editGeneralForumTopic", "Rename"],
          ["closeGeneralForumTopic", "Close"],
          ["reopenGeneralForumTopic", "Reopen"],
          ["hideGeneralForumTopic", "Hide"],
          ["unhideGeneralForumTopic", "Unhide"],
          ["unpinAllGeneralForumTopicMessages", "Unpin all"],
        ].map(([m, label]) => (
          <button
            key={m}
            className="btn sm"
            onClick={() =>
              run(m, { chat_id, name: m === "editGeneralForumTopic" ? name : undefined }, label)
            }
          >
            {label}
          </button>
        ))}
      </div>
    </Collapsible>
  );
}

function Danger({ chat_id, run }: { chat_id: number; run: Run }) {
  return (
    <Collapsible title="Leave">
      <p className="muted" style={{ fontSize: "0.75rem", marginTop: 0 }}>
        Leaving is permanent for the bot — it can only come back if someone re-adds it.
      </p>
      <button className="btn sm danger" onClick={() => run("leaveChat", { chat_id }, "Left the chat")}>
        Leave chat
      </button>
    </Collapsible>
  );
}
