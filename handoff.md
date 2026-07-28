# Humanoid operator handoff

Humanoid is a single-bot Next.js/React dashboard served with a Cloudflare Worker.
Production updates use a Telegram webhook and a hibernating Durable Object
WebSocket. The Durable Object is connection coordination only: normal operation
does not use Durable Object storage.

## Runtime contract

- `BOT_TOKEN` is a Worker secret and the dashboard login credential.
- `/telegram/webhook` rejects updates without Telegram's expected secret header.
- The Worker relays updates and Bot API results only to dashboards currently open.
- React holds chats, messages, queries, raw updates, logs, and resolved avatar file
  IDs in memory. Reloading or closing the page clears all of them.
- Rich Studio drafts and theme choices are also memory-only. Import and export are
  explicit local file actions, not autosave.
- Worker observability is disabled and proxied Telegram files use `no-store`.
- Login uses a signed session cookie with no browser-persistence attribute. It
  contains no token and has a 24-hour signature expiry.

Telegram itself still owns and retains Telegram-side messages and media. Humanoid
cannot retrieve arbitrary existing history, and bots still cannot initiate a new
private conversation.

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

- **Clear current session** broadcasts an in-memory clear event to open dashboards;
  it does not affect Telegram messages.
- Rich Message Studio opens a Notion-style block canvas with drag handles, `/`
  commands, and block context actions. Advanced source/native views remain present.
- User profile photos use `getUserProfilePhotos`; group/channel photos use
  `getChat`. Results are memoized only until the page closes.
- The Console accepts every current or future Bot API method. Sensitive managed-bot
  results are omitted from the transient activity stream.

## Verification boundary

Worker tests cover authentication, webhook rejection, transient WebSocket delivery,
deduplication within a live object instance, guest/ephemeral routing, session-only
logs, and empty snapshots. The live verifier checks login, empty state, the real bot,
authenticated WebSocket readiness, avatar resolution, and webhook installation
without contacting a user. A real Telegram interaction is still required to prove
end-to-end user-to-bot delivery.
