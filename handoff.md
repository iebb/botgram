# Humanoid operator handoff

Humanoid is a multi-account Next.js/React bot dashboard served with a Cloudflare Worker.
Production updates use a Telegram webhook and a hibernating Durable Object
WebSocket. The Durable Object is connection coordination only: normal operation
does not use Durable Object storage.

## Runtime contract

- Bot tokens are browser-owned localStorage data, not Worker secrets. The local
  account chooser stores validated bot identities and credentials; one active
  session-only browser cookie mirrors the current token for native media and
  WebSocket transport.
- `/telegram/webhook/<hub-key>/<secret-digest>` rejects updates unless Telegram's
  secret header hashes to the digest in the route.
- A connected dashboard installs Humanoid's webhook automatically. The last normal
  client close/account switch deletes only Humanoid's endpoint without dropping
  pending updates; another connected tab retains it. With no client after an abrupt
  exit, webhook deliveries receive a retryable response instead of being acknowledged.
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
- The Worker has no credential/session storage. Complete-token one-way hashes
  isolate transient bot hubs without revealing one bot's events to another.

Telegram itself still owns and retains Telegram-side messages and media. Humanoid
cannot retrieve arbitrary existing history, enumerate contacts or joined chats,
or initiate a new private conversation. `getUpdates` is mutually exclusive with
an installed webhook and exposes only unconfirmed updates that Telegram retains
for at most 24 hours; it is not a legacy chat API. The client lease avoids knowingly
acknowledging updates when no dashboard can save them, but it cannot create a
general Telegram history API.

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
CLOUDFLARE_ACCOUNT_ID=<ieb-account-id> npx wrangler deploy
HUMANOID_URL=https://<deployment> npm run verify:live
```

The ignored `.env` supplies the token only to local/live verification. Never
print, commit, or move it into Wrangler variables or secrets. The app saves
operator-entered accounts in that browser's localStorage. Opening an authenticated
dashboard restores Telegram delivery automatically; **Updates -> Restore webhook**
is also available after experimenting with another webhook or `getUpdates` client.

## UI behavior

- **Clear browser history** removes the current bot's saved dashboard snapshot and
  discovered sticker library, then broadcasts a clear event to other open
  dashboards. It does not affect Telegram messages, the Rich Studio draft, or the
  theme.
- **Switch account** releases the current client lease, clears the session-only
  transport credential, and opens the browser-local saved-bot chooser. Forgetting
  an account removes its localStorage token without implicitly deleting its
  IndexedDB history.
- Sidebar search deduplicates speakers from every locally retained chat and matches
  display names, usernames, and IDs. Private-chat rows open directly; group-only
  people can be checked by exact ID with `getChat`, subject to Telegram access.
- Rich Message Studio opens a Notion-style Block Editor with drag handles, `/`
  commands, and block context actions. Advanced source/native views remain present.
  Its destination is derived only from the currently selected chat; autosave and
  import never restore a stale chat/channel target. Both Studio and the normal
  composer expose the opt-in three-second Thinking stream. Telegram permits
  `sendRichMessageDraft` only in private chats and without direct file uploads.
- User profile photos use `getUserProfilePhotos`; group/channel photos use
  `getChat`. Telegram file IDs persist in IndexedDB; proxied image bytes use
  `no-store`.
- The composer sticker selector ranks discovered sets and stickers by local use.
  `.TGS` uses a lazily imported Lottie canvas renderer and `.WEBM` uses looping
  muted video; offscreen stickers do not start animation work.
- Message reaction updates are merged into browser-local counts; anonymous
  `message_reaction_count` updates replace those counts authoritatively. Custom
  emoji media is resolved in batches of at most 200 and is never stored server-side.
  Telegram suppresses update events for bot-made reactions, so a successful
  `setMessageReaction` is mirrored through the Worker and an idempotent browser
  fallback. Reactions from other users require bot administrator status plus the
  explicitly installed reaction update types and cannot be backfilled historically.
  The custom reaction picker hydrates observed sets and sorts them by local use.
- Rich custom emoji insertion resolves the sticker first, defaults its required
  alternative to the sticker's own emoji, and blocks invalid or missing fallbacks.
  Telegram remains authoritative for Premium/Fragment eligibility.
- Selecting a non-private chat fetches the bot's own `getChatMember` record.
  Admin navigation is absent for non-admins, and rights-specific controls are
  omitted when their matching administrator permission is false.
- The Console accepts every current or future Bot API method. Sensitive managed-bot
  results are omitted from the transient activity stream.

## Verification boundary

Worker tests cover browser-owned credentials, stateless webhook rejection,
transient WebSocket delivery, deduplication within a live object instance,
guest/ephemeral routing, distinct client leases, session-only server logs, and
empty server snapshots. Browser tests cover local account switching and per-bot
IndexedDB round-tripping, sticker-library persistence/deduplication/frequency sorting, admin
permission visibility, and the separation of dashboard history from preferences
and rich drafts. The live verifier checks credential rejection, empty server state, the real bot,
authenticated WebSocket readiness, avatar resolution, webhook installation, and
last-client deregistration without contacting a user. A real Telegram interaction
is still required to prove end-to-end user-to-bot delivery and browser restoration.
