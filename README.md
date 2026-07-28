# Humanoid

Humanoid is a Telegram-style control room for one Telegram bot. The interface is
built with React and Next.js, exported as static assets, and served beside a
Cloudflare Worker. Incoming updates arrive through a Telegram webhook and are
pushed to open dashboards over a hibernating WebSocket.

The dashboard provides guided forms for everyday work and a raw API console for
the complete Bot API 10.2 surface: 185 catalogued methods, arbitrary future method
names, JSON parameters, and streamed multipart uploads.

## Bot API boundaries

Humanoid does not turn a bot into a user account. In particular:

- A bot generally cannot begin a private conversation. A user must contact it,
  add it to a chat, or otherwise grant the Bot API a scoped interaction first.
- A bot does not receive a normal Telegram user's full chat history. Humanoid
  persists only updates delivered to this webhook and messages returned by calls
  made through this dashboard.
- Permissions, edit/delete windows, privacy mode, payments, business/managed-bot
  features, Stars, and Telegram's rate limits still apply.
- Inline buttons are activated by real Telegram clients; their callbacks then
  appear in Humanoid's query inbox.

## Architecture

| Part | Responsibility |
| --- | --- |
| `app/`, `components/` | Telegram-like Next.js/React interface |
| `worker/index.ts` | Authenticated API gateway, Telegram webhook, file proxy, asset routing |
| `worker/bot-hub.ts` | Per-bot SQLite Durable Object, update de-duplication, persisted timelines, hibernating WebSockets |
| `worker/telegram.ts` | Bot API JSON calls, streaming multipart uploads, credential-safe logging |
| `lib/methods.ts` | Current Bot API method catalogue and starter payloads |

The production update path is:

```text
Telegram -> /telegram/webhook -> SQLite Durable Object -> WebSocket -> React store
```

There is no timer-based update polling in production. A reconnecting client gets
an immediate persisted snapshot, and subsequent updates are broadcast as soon as
the webhook is committed.

## Features

- Text sends with HTML, MarkdownV2, legacy Markdown, link previews, replies,
  message effects, business connections, direct-message topics, and keyboards.
- A dedicated Bot API 10.2 Rich Message Studio whose default editing surface is a
  true WYSIWYG canvas with inline formatting, block insertion, sanitized rich
  paste, and clean Rich HTML output. Advanced HTML source, Rich Markdown, and
  native-block modes sit beside templates, a media library, keyboard editor,
  payload validation, local autosave/import/export, and 30-second streaming drafts.
- Photos, video, live photos, animations, audio, voice, video notes, documents,
  stickers, albums, paid media, locations, venues, contacts, polls, checklists,
  dice, invoices, games, and chat actions.
- Inline and reply keyboard builders, message editing/deletion/reactions,
  forwarding/copying, pinning, live locations, and media replacement.
- Callback, inline, guest, shipping, pre-checkout, and join-request response tools.
- Chat administration, bot settings, commands, menu buttons, gifts/Stars,
  stickers, forum topics, invite/subscription links, and managed bots.
- Raw update history and a redacted API activity log.
- Automatically cached Telegram profile photos for seen users and chat photos for
  groups/channels, with initials when the Bot API exposes no avatar.
- A free-form console that can call every current or future Bot API method.

## Security model

`BOT_TOKEN` is a Cloudflare secret. It is never shipped in the static bundle or
stored in browser storage. The operator signs in with that token once; the Worker
compares hashes in constant time and issues a signed, `HttpOnly`, `Secure`,
`SameSite=Strict` session cookie. Mutating API requests are same-origin only.

The webhook has a deterministic high-entropy secret derived from `BOT_TOKEN` and
rejects unsigned updates. Telegram files are streamed through an authenticated
proxy, uploads are forwarded without whole-file buffering, and known token/secret
fields are redacted before API calls reach persistent logs. Managed-bot credentials
are shown only in the immediate console response.

## Local development

Use the real token only in the ignored `.env` file:

```bash
cp .env.example .env
npm install
npm test
npm run typecheck
npm run dev:worker
```

Open `http://localhost:3838`. Plain `npm run dev` runs the exported UI only; use
`dev:worker` when exercising auth, persistence, Bot API calls, or WebSockets.

## Cloudflare deployment

Build and deploy to the intended Cloudflare account without copying the token to
shell history:

```bash
npm run build
CLOUDFLARE_ACCOUNT_ID=<ieb-account-id> npx wrangler deploy --secrets-file .env
```

After deployment, sign in and choose **Updates -> Restore webhook**, or call the
authenticated `POST /api/webhook/install` endpoint. That installs
`https://<deployment>/telegram/webhook` with all 26 current update types and 40
parallel Telegram connections.

`BOT_TOKEN` identifies both the Telegram bot and its Durable Object. Changing the
token intentionally selects a different persisted bot workspace.

## Verification

```bash
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
HUMANOID_URL=https://<deployment> npm run verify:live
```

The Worker tests cover authentication, forged webhook rejection, update
de-duplication and persistence, WebSocket delivery, guest/ephemeral routing, and
sensitive-log redaction. The catalogue test guards the 185-method/26-update surface.
The live verifier signs in, calls Telegram, validates the authenticated WebSocket
snapshot and avatar resolver, and installs/checks the real webhook without sending a
message or altering saved chat history. Synthetic update persistence and immediate
event delivery are covered by the isolated Worker tests.
