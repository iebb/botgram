# Humanoid operator handoff

Humanoid is a single-bot Telegram dashboard deployed as a Next.js static export
plus a Cloudflare Worker. Its production update path is webhook-driven and does
not use `getUpdates`, SSE, or process memory.

## Runtime

- `BOT_TOKEN` is required as a Worker secret and is also the dashboard login.
- `/telegram/webhook` validates Telegram's secret header before accepting an update.
- One SQLite Durable Object named from the bot's numeric id persists chats,
  messages, pending queries, raw updates, webhook health, and redacted API calls.
- Authenticated clients receive a snapshot and near-real-time events through a
  hibernating Durable Object WebSocket.
- User and chat avatars are resolved lazily through the Bot API and cached in the
  same Durable Object for 24 hours (negative lookups for one hour).
- Retention is bounded to 500 messages per chat, 300 raw updates, 300 log entries,
  and 200 pending queries.

## Operator commands

```bash
npm test
npm run typecheck
npm run build
npx wrangler deploy --dry-run
CLOUDFLARE_ACCOUNT_ID=<ieb-account-id> npx wrangler deploy --secrets-file .env
HUMANOID_URL=https://<deployment> npm run verify:live
```

The `.env` file is ignored. Do not print, commit, paste, or place `BOT_TOKEN` in a
Wrangler config variable. The example token in `.env.example` is deliberately fake.

After the first deployment, install or repair Telegram delivery from
**Updates -> Restore webhook**. The Worker chooses its own URL, uses all current
update types, keeps pending Telegram updates, and records webhook health in the UI.

## Operational behavior

- The dashboard is locked until the operator provides the configured token.
- The sidebar connection indicator reflects the dashboard WebSocket; the Updates
  panel separately reports Telegram webhook health and the latest received update.
- **Clear saved history** deletes only the dashboard's Durable Object records. It
  does not delete Telegram chats or messages.
- Uploads and Telegram downloads stream through the Worker.
- Every Bot API method is available in Console, including newer methods not yet in
  the suggestions list. Prefer the guided screens for common actions.
- Rich Message Studio is available from the main menu and each chat composer. Its
  default visual canvas edits Telegram Rich HTML directly and sanitizes pasted or
  source HTML to the supported tag and attribute set; HTML source, Rich Markdown,
  and native blocks remain available as advanced views. Sources, options, and the
  keyboard autosave locally, while selected upload files remain memory-only and
  must be chosen again after an import or reload.
- Managed-bot tokens are intentionally absent from the persistent activity log.

## Verification boundary

Automated tests prove the Worker/SQLite/WebSocket flow with synthetic updates. The
live verifier checks `getMe`, login, the Bot API proxy, authenticated WebSocket
snapshot, avatar resolution, and webhook installation without contacting a user or
clearing saved history. Actual user-to-bot delivery still requires a real Telegram
interaction and should not be claimed from synthetic checks alone.
