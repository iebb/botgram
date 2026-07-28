# Humanoid

Humanoid is a Telegram-style control room for one Telegram bot. React and
Next.js produce the static interface; a Cloudflare Worker proxies the Bot API,
accepts Telegram webhooks, and relays events to currently open dashboards over a
hibernating WebSocket.

The dashboard provides guided tools plus a free-form console for the complete Bot
API 10.2 surface: 185 catalogued methods, future method names, JSON parameters,
and streaming multipart uploads.

## Bot API boundaries

Humanoid does not turn a bot into a user account:

- A bot generally cannot begin a private conversation. A user must contact it,
  add it to a chat, or otherwise grant it a scoped interaction first.
- The Bot API does not expose arbitrary existing chat history. Only updates that
  arrive while this dashboard is open, plus Message results from calls made in
  that browser, can enter its locally retained timeline.
- Permissions, edit/delete windows, privacy mode, payments, business features,
  Stars, and Telegram rate limits still apply.

If a group shows join/service events but not ordinary messages, Telegram Group
Privacy is enabled for the bot. Promote the bot to group admin, or use
`@BotFather` -> `/setprivacy` -> select the bot -> **Disable**, then remove and
re-add it to the group. Humanoid detects `can_read_all_group_messages: false` and
shows this remediation in the affected chat and Webhook panel.

## Semi-stateless architecture

```text
Telegram -> /telegram/webhook -> hibernating WebSocket fanout -> React memory
                                                              -> browser IndexedDB
Bot API  <- authenticated, storage-free Worker proxy <- current browser
```

`worker/bot-hub.ts` is only an open-connection coordinator. Normal requests never
read or write Durable Object storage. The browser immediately renders live events,
then coalesces snapshots into IndexedDB. Per-bot chats, messages, incoming update
payloads, queries, redacted API activity, resolved avatar file IDs, the selected
chat, and Rich Studio drafts survive reloads on that browser. Theme choice is also
local. The bot token and uploaded file bytes are never written to IndexedDB.

The retained event collections are bounded to 500 messages per chat, 300 raw
updates, 300 API entries, and 200 queries. Browser storage remains device-local and
may be deleted by the operator, browser cleanup, private-browsing rules, or quota
eviction. **Clear browser history** removes the current bot's saved dashboard
history; it does not delete Telegram messages or the separately saved Rich Studio
draft and theme.

Cloudflare Worker logs and traces are disabled. Telegram files are returned with
`Cache-Control: private, no-store`; only their reusable Telegram file IDs are
memoized locally.

The unavoidable server-side state is narrowly scoped: the bot token is a
Cloudflare secret, Telegram retains data according to Telegram's own service
behavior, and the browser holds a signed session cookie until the browser session
closes. The cookie contains no bot token and expires cryptographically after 24
hours.

IndexedDB is not a Bot API history source. This dashboard only saves updates that
reach an open browser and Message results from its own API calls. With the
production webhook installed, `getUpdates` cannot run. Even after removing the
webhook, `getUpdates` returns only Telegram's pending update queue (kept for at
most 24 hours), not legacy chats or arbitrary message history.

## Features

- Text, rich content, media, albums, polls, locations, payments, stickers,
  interactive keyboards, replies, edits, deletions, reactions, and administration.
- A dedicated Rich Message Studio with a Notion-style WYSIWYG canvas: draggable
  blocks, slash commands, per-block context menus, duplicate/delete/move/transform
  actions, rich paste sanitization, inline formatting, HTML source, Rich Markdown,
  native blocks, media, keyboard editing, validation, import/export, and streaming
  drafts. Draft configuration autosaves per bot in IndexedDB; import/export still
  happens only when the operator explicitly chooses a file, and upload bytes stay
  session-only.
- Lazy user/chat avatar resolution through Telegram. File IDs are memoized only in
  the current browser; avatar bytes are not cached by Humanoid.
- Live raw updates, answerable callback/inline/payment/join queries, and a redacted
  API activity view, persisted locally with bounded history.

## Security

`BOT_TOKEN` stays in the ignored `.env` file locally and in a Worker secret in
production. It is never included in the static bundle or browser storage. Login
uses constant-time verification and returns an `HttpOnly`, `Secure`,
`SameSite=Strict` session cookie. Mutation routes require same-origin requests.

The Telegram webhook validates a secret derived from `BOT_TOKEN`. Uploads and
downloads stream through authenticated routes. Known secret fields are redacted
before transient API events reach the browser, and managed-bot credentials appear
only in the immediate console response.

## Development and deployment

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
CLOUDFLARE_ACCOUNT_ID=<ieb-account-id> npx wrangler deploy --secrets-file .env
HUMANOID_URL=https://<deployment> npm run verify:live
```

`npm run dev:worker` serves the exported UI and Worker locally on port 3838. After
deployment, choose **Updates -> Restore webhook** if Telegram delivery needs to be
installed or repaired.

The live verifier authenticates, checks that `/api/state` begins empty, exercises
the Bot API proxy and avatar resolver, verifies the WebSocket and webhook, and does
not send a Telegram message.
