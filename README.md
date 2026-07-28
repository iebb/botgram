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
  that session, can appear in its timeline.
- Permissions, edit/delete windows, privacy mode, payments, business features,
  Stars, and Telegram rate limits still apply.

## Ephemeral architecture

```text
Telegram -> /telegram/webhook -> hibernating WebSocket fanout -> React memory
Bot API  <- authenticated Worker proxy <- current browser session
```

`worker/bot-hub.ts` is only an open-connection coordinator. Normal requests never
read or write Durable Object storage. Chats, messages, update payloads, queries,
API activity, avatars, rich drafts, and theme choices live only in the current
browser page and vanish on reload/close. Cloudflare Worker logs and traces are
disabled. Telegram files are returned with `Cache-Control: private, no-store`.

The unavoidable state is narrowly scoped: the bot token is a Cloudflare secret,
Telegram retains data according to Telegram's own service behavior, and the
browser holds a signed session cookie until the browser session closes. The cookie
contains no bot token and expires cryptographically after 24 hours.

## Features

- Text, rich content, media, albums, polls, locations, payments, stickers,
  interactive keyboards, replies, edits, deletions, reactions, and administration.
- A dedicated Rich Message Studio with a Notion-style WYSIWYG canvas: draggable
  blocks, slash commands, per-block context menus, duplicate/delete/move/transform
  actions, rich paste sanitization, inline formatting, HTML source, Rich Markdown,
  native blocks, media, keyboard editing, validation, import/export, and streaming
  drafts. Import/export happens only when the operator explicitly chooses a file.
- Lazy user/chat avatar resolution through Telegram. File IDs are memoized only in
  the current React session; avatar bytes are not cached by Humanoid.
- Live raw updates, answerable callback/inline/payment/join queries, and a redacted
  API activity view, all limited to the open page.

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
