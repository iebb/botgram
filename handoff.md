# Humanoid operator handoff

Humanoid is a single-bot Next.js/React dashboard served with a Cloudflare Worker.
Production updates use a Telegram webhook and a hibernating Durable Object
WebSocket. The Durable Object is connection coordination only: normal operation
does not use Durable Object storage.

## Runtime contract

- `BOT_TOKEN` is a Worker secret and the dashboard login credential.
- `/telegram/webhook` rejects updates without Telegram's expected secret header.
- The Worker relays updates and Bot API results only to dashboards currently open.
- React applies live events immediately. It coalesces per-bot chats, messages,
  queries, raw updates, redacted logs, selected chat, and resolved avatar file IDs
  into browser IndexedDB after the render path, so they survive local reloads.
- Sticker messages also populate a per-bot IndexedDB metadata library. A received
  `set_name` is hydrated with `getStickerSet`; only IDs, set metadata, a bounded
  deduplication ledger, and local use counts persist. Sticker bytes remain `no-store`.
- Rich Studio configuration autosaves per bot and theme choice is browser-local.
  Upload file bytes remain session-only; import and export are explicit file
  actions.
- The Worker, Durable Object, and static application store none of this dashboard
  history. IndexedDB remains local to one browser profile and is subject to browser
  clearing, private-mode behavior, quota, and eviction.
- Worker observability is disabled and proxied Telegram files use `no-store`.
- Login uses a signed session cookie with no browser-persistence attribute. It
  contains no token and has a 24-hour signature expiry.

Telegram itself still owns and retains Telegram-side messages and media. Humanoid
cannot retrieve arbitrary existing history, and bots still cannot initiate a new
private conversation. `getUpdates` is mutually exclusive with the installed
webhook and exposes only unconfirmed updates that Telegram retains for at most 24
hours; it is not a legacy chat API. Updates delivered while no Humanoid browser is
open are not recoverable from this dashboard after the webhook has acknowledged
them.

If joins appear in a group but ordinary text does not, inspect the fresh `getMe`
field `can_read_all_group_messages`. `false` means Telegram Group Privacy is on;
the webhook and ingest path cannot recover messages Telegram never delivers. Make
the bot an admin in that group, or disable `/setprivacy` in `@BotFather` and re-add
the bot. The dashboard surfaces this condition automatically.

## Operator commands

```bash
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
CLOUDFLARE_ACCOUNT_ID=<ieb-account-id> npx wrangler deploy --secrets-file .env
HUMANOID_URL=https://<deployment> npm run verify:live
```

The ignored `.env` is the only local token source. Never print, commit, or move the
token into Wrangler variables. Restore Telegram delivery from **Updates -> Restore
webhook** after experimenting with a different webhook or `getUpdates` client.

## UI behavior

- **Clear browser history** removes the current bot's saved dashboard snapshot and
  discovered sticker library, then broadcasts a clear event to other open
  dashboards. It does not affect Telegram messages, the Rich Studio draft, or the
  theme.
- Rich Message Studio opens a Notion-style block canvas with drag handles, `/`
  commands, and block context actions. Advanced source/native views remain present.
- User profile photos use `getUserProfilePhotos`; group/channel photos use
  `getChat`. Telegram file IDs persist in IndexedDB; proxied image bytes use
  `no-store`.
- The composer sticker selector ranks discovered sets and stickers by local use.
  `.TGS` uses a lazily imported Lottie canvas renderer and `.WEBM` uses looping
  muted video; offscreen stickers do not start animation work.
- Selecting a non-private chat fetches the bot's own `getChatMember` record.
  Admin navigation is absent for non-admins, and rights-specific controls are
  omitted when their matching administrator permission is false.
- The Console accepts every current or future Bot API method. Sensitive managed-bot
  results are omitted from the transient activity stream.

## Verification boundary

Worker tests cover authentication, webhook rejection, transient WebSocket delivery,
deduplication within a live object instance, guest/ephemeral routing, session-only
server logs, and empty server snapshots. Browser tests cover per-bot IndexedDB
round-tripping, sticker-library persistence/deduplication/frequency sorting, admin
permission visibility, and the separation of dashboard history from preferences
and rich drafts. The live verifier checks login, empty server state, the real bot,
authenticated WebSocket readiness, avatar resolution, and webhook installation
without contacting a user. A real Telegram interaction is still required to prove
end-to-end user-to-bot delivery and browser restoration.
