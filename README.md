# Botgram

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/iebb/botgram)

[Open the source on GitHub](https://github.com/iebb/botgram) · [Open the live dashboard](https://botgram.ieb.app)

Botgram is the source for Humanoid, a Telegram-style control room for Telegram
bot accounts. React and Next.js produce the static interface; a Cloudflare Worker
proxies the Bot API, accepts Telegram webhooks, and relays events to currently
open dashboards over a hibernating WebSocket.

The dashboard provides guided tools plus a free-form console for the complete Bot
API 10.2 surface: 185 catalogued methods, future method names, JSON parameters,
and streaming multipart uploads.

## Bot API boundaries

Humanoid does not turn a bot into a user account:

- A bot generally cannot begin a private conversation. A user must contact it,
  add it to a chat, or otherwise grant it a scoped interaction first.
- The Bot API does not expose arbitrary existing chat history. Only updates that
  Telegram still has pending when a dashboard connects, live updates, and Message
  results from calls made in that browser can enter its locally retained timeline.
- The Bot API has no method to enumerate a bot's contacts or every group/channel
  it has joined. Launch restores only chats already learned by this browser; a
  specific known chat can be resolved with `getChat`.
- The Bot API does not expose a bot/user-style list of installed sticker sets.
  Humanoid discovers sets from sticker messages this browser receives or sends,
  then uses `getStickerSet` to add every sticker currently in each discovered set.
- Permissions, edit/delete windows, privacy mode, payments, business features,
  Stars, and Telegram rate limits still apply.

If a group shows join/service events but not ordinary messages, Telegram Group
Privacy is enabled for the bot. Promote the bot to group admin, or use
`@BotFather` -> `/setprivacy` -> select the bot -> **Disable**, then remove and
re-add it to the group. Humanoid detects `can_read_all_group_messages: false` and
shows this remediation in the affected chat and Webhook panel.

## Semi-stateless architecture

```text
Telegram -> client-leased webhook -> hibernating WebSocket fanout -> React memory
                                                              -> browser IndexedDB
Bot API  <- authenticated, storage-free Worker proxy <- current browser
```

`worker/bot-hub.ts` is only an open-connection coordinator. Normal requests never
read or write Durable Object storage. The browser immediately renders live events,
then coalesces snapshots into IndexedDB. Per-bot chats, messages, incoming update
payloads, queries, redacted API activity, resolved avatar file IDs, the selected
chat, discovered sticker-set metadata, local sticker-use frequency, and Rich Studio
drafts survive reloads on that browser. Theme choice is also local. The bot token,
sticker files, and uploaded file bytes are never written to IndexedDB. The bot
token is intentionally kept in a separate localStorage entry.

The retained event collections are bounded to 500 messages per chat, 300 raw
updates, 300 API entries, and 200 queries. Browser storage remains device-local and
may be deleted by the operator, browser cleanup, private-browsing rules, or quota
eviction. **Clear browser history** removes the current bot's saved dashboard
history and discovered sticker library; it does not delete Telegram messages or
the separately saved Rich Studio draft and theme.

Cloudflare Worker logs and traces are disabled. Telegram files are returned with
`Cache-Control: private, no-store`; only their reusable Telegram file IDs are
memoized locally.

The Worker has no bot-token binding, credential database, or server session. The
browser can retain multiple validated bot accounts and sends only the active local
token on each API request. Switching accounts returns to the browser-local chooser;
each account keeps a separate IndexedDB timeline. A session-only, same-origin
browser cookie mirrors the active token solely for native image/video/audio requests
and the browser WebSocket, which cannot set an Authorization header. The Worker
consumes the credential transiently and never persists or logs it.

The webhook is a client lease. A connected dashboard installs it automatically;
the last client removes Humanoid's own endpoint with `drop_pending_updates: false`
on a normal close or account switch. Multiple tabs keep it alive. If a browser
crashes before releasing the lease, the endpoint returns a retryable response while
no dashboard is connected so Telegram does not receive a false acknowledgement.
When Telegram reports more than 50 queued updates at launch, Humanoid pauses before
installing the webhook and asks whether to catch up or start fresh. Catch-up keeps
the queue and temporarily lowers webhook concurrency; start fresh requires a second
confirmation because Telegram's `drop_pending_updates` operation is irreversible.
Humanoid never discards a queue merely because the dashboard was closed.

IndexedDB is not a Bot API history source. This dashboard only saves updates that
reach an open browser and Message results from its own API calls. With the
production webhook installed, `getUpdates` cannot run. Even after removing the
webhook, `getUpdates` returns only Telegram's pending update queue (kept for at
most 24 hours), not legacy chats or arbitrary message history.

## Features

- Text, rich content, media, albums, polls, locations, payments, stickers,
  interactive keyboards, replies, edits, deletions, reactions, and administration.
- Static, animated `.TGS`, and video `.WEBM` stickers render in messages and in a
  dedicated composer selector. The selector contains every set discovered from
  locally retained sticker messages, hydrates complete sets through the Bot API,
  and sorts both sets and stickers by browser-local use frequency. Animation code
  and sticker files load only when visible.
- Message reaction chips render observed emoji, custom emoji, paid reactions, and
  aggregate counts. Custom emoji entities and reactions resolve through
  `getCustomEmojiStickers` and reuse the animated sticker renderer. The reaction
  picker includes every custom emoji set discovered by this browser and ranks
  sets and emoji by local frequency. Because Telegram emits no reaction update
  for a reaction set by a bot, Humanoid mirrors a successful `setMessageReaction`
  result into the local timeline immediately. Other users' reaction updates still
  require the bot to be an administrator and the explicit reaction update types.
- A dedicated Rich Message Studio with a Notion-style WYSIWYG Block Editor: draggable
  blocks, slash commands, per-block context menus, duplicate/delete/move/transform
  actions, rich paste sanitization, inline formatting, HTML source, Rich Markdown,
  native blocks, media, rendered keyboard previews, validation, import/export,
  manual streaming, and an opt-in live draft that republishes unfinished input
  with a native Thinking block at a one-, three-, or five-second interval. Studio
  always sends to the currently open chat; a saved or imported draft cannot restore
  another destination. The ordinary chat composer exposes the same private-chat-only
  Thinking toggle and interval selector. Telegram restricts streamed rich drafts
  to private chats and disallows direct uploads in them, so group chats omit the
  control and Studio explains unavailable drafts.
  Draft configuration autosaves per bot in IndexedDB; import/export still
  happens only when the operator explicitly chooses a file, and upload bytes stay
  session-only.
- Lazy user/chat avatar resolution through Telegram. File IDs are memoized only in
  the current browser; avatar bytes are not cached by Humanoid.
- A browser-local multi-bot account chooser with per-bot IndexedDB history and an
  explicit forget action. Bot tokens never appear in account summaries.
- Sidebar people search by display name, `@username`, or numeric ID across users
  observed in this bot's locally saved chats. Exact IDs can be checked with
  `getChat`; Telegram does not expose an arbitrary private-user directory.
- Rich Studio rejects custom emoji without one valid Unicode fallback, verifies
  custom emoji IDs with Telegram before sending, and uses the sticker's `emoji`
  value as the WYSIWYG default. Telegram still enforces owner Premium/Fragment
  eligibility and per-chat custom-reaction rules.
- Live raw updates, answerable callback/inline/payment/join queries, and a redacted
  API activity view, persisted locally with bounded history.
- Admin tabs and actions are omitted unless a fresh `getChatMember` result says the
  bot is an administrator; individual controls are further filtered by rights such
  as `can_restrict_members`, `can_promote_members`, and `can_pin_messages`.

## Security

Bot tokens are saved in browser localStorage only after Telegram accepts them. They
are never included in the static bundle, Wrangler configuration, Worker secrets,
Durable Object storage, logs, or application databases. A session-only
`SameSite=Strict` transport cookie enables authenticated native media and
WebSockets. Mutation routes also require same-origin requests.

Each webhook installation creates a fresh random secret. Its one-way digest is in
the webhook route, so incoming deliveries can be verified without storing the
secret or bot token. Uploads and downloads stream through authenticated routes.
Known secret fields are redacted before transient API events reach the browser,
and managed-bot credentials appear only in the immediate console response.

## Development and deployment

The button above copies this public repository into your GitHub account, provisions
the Worker and its declared Durable Object through Cloudflare Workers Builds, and
opens the deployed dashboard. No Telegram bot token is requested during deployment:
enter it only in the deployed browser, where Botgram keeps it in localStorage.

```bash
npm install
npm run check
npx wrangler deploy --dry-run
CLOUDFLARE_ACCOUNT_ID=<your-account-id> npx wrangler deploy
HUMANOID_URL=https://<deployment> npm run verify:live
```

For optional live verification, create an ignored `.env` containing `BOT_TOKEN`.
It supplies the token only to local verification commands. Do
not upload it with Wrangler; production has no bot-token secret.

`npm run dev:worker` serves the exported UI and Worker locally on port 3838. After
deployment, opening an authenticated dashboard automatically installs the webhook.
**Updates -> Restore webhook** remains available for manual repair.

The live verifier passes the ignored `.env` token per request, checks that
`/api/state` begins empty, exercises
the Bot API proxy and avatar resolver, verifies the WebSocket and webhook, proves
the last client deregisters it, and does not send a Telegram message.
