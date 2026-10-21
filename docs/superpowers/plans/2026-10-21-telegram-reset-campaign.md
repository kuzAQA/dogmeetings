# Telegram reset and reconnect campaign

**Goal:** Reset Telegram subscriptions once, restart the existing bot, and offer eligible users one reconnect hint during one fixed 48-hour production campaign.

**Architecture:** Keep the existing Telegram link and confirmation flow. Reuse `announcement_campaigns`, `announcement_receipts`, the existing announcement dialog and its Telegram dock example; never activate a campaign from a migration, deployment, restart, or first visit. No new tables or API endpoints.

**Scope:** Announcement eligibility and display receipt, existing announcement browser tests, one guarded reset/cleanup script and tests, runner image copies. Preserve Caddy and compose changes. No new dependencies, bot, token, broadcast, or simulated `/start`.

1. [x] Inspect subscriptions, intents, message registry, queue, link/confirmation flow, and Telegram API limits.
2. [x] Implement and test fixed campaign dates, subscription eligibility, and recording actual display.
3. [x] Implement and test guarded one-time reset and best-effort deletion of tracked Telegram messages.
4. [x] Inspect production checkout; back up database, tracked/untracked server changes and Caddy configuration; deploy without overwriting server configuration.
5. [x] After explicit destructive-action confirmation: stop app and scheduler to prevent in-flight sends/confirmations; reset subscriptions/intents/queue, attempt tracked-message deletion, start and verify existing services/polling; activate the single campaign after reset and a healthy app. Report actual counts and Moscow expiry.

## Contracts and limitations

- `telegram_chat_settings` holds client/chat bindings and Dialog message consent. `telegram_complex_subscriptions` holds walk subscriptions. `telegram_subscription_intents` holds expiring start/confirmation tokens. `telegram_walk_notifications` is the walk delivery queue. `telegram_bot_messages` tracks known sent messages; it is not complete Telegram history. API rate-limit records must survive reset.
- The dock creates a `combined` intent through `/api/telegram/subscription-link`. `/start TOKEN` prepares confirmation; the confirmed callback enables both subscriptions. Keep this path intact.
- `walk-cleanup` deletes the webhook without dropping pending updates and polls `getUpdates`, forwarding updates to the authenticated app route. Confirm actual production mode with `getWebhookInfo`; a service restart does not start the bot for a user.
- Telegram `deleteMessage` generally permits deletion only for messages younger than 48 hours and requires known message IDs/permissions. No Bot API method enumerates full private-chat history or starts the bot as a user. Preserve undeleted registry entries and report unknown history separately.
- Campaign absence means disabled. The activation uses one fixed ID and a database timestamp; the end is exactly start + 48 hours. Re-running reset must fail before changing data; activation must never extend an existing campaign.
- Hide the hint only when both message consent and an active walk subscription exist for the client's linked Telegram chat. An impression is keyed by campaign and trusted client session, recorded after a visible painted frame, independently of dismissal/clicks. Existing legacy hint keys must not suppress the new campaign.
- Users with cleared identity cookies cannot be recognised as the same client; this is an existing anonymous-session limitation.

## Production access and backup

The configured SSH key is absent from this execution environment. The owner supplied password authentication and confirmed the reset on 2026-10-21. Connected only to the new VDS. Initial checkout HEAD matched local `315c2b9`; server changes included Caddy and compose configuration. Database dump, binary diff, untracked archive and copies/checksums of Caddy/compose are saved under `/opt/backups/telegram-reset-20261021T115128Z`. A fresh `database-before-reset.dump` was taken with app and scheduler stopped. `pg_restore --list` read both backups successfully. The previous image remains tagged `dogmeet-app:before-telegram-reset-20261021`. Caddy and compose checksums still match after deployment.

## Production result, 2026-10-21

- Removed 9 walk subscription rows (8 active), 3 Dialog bindings (all enabled), and 5 intent rows (none pending/unexpired). The delivery queue had 0 rows. Pets, walks, Dialog history, client sessions, rate-limit records and administrative Telegram configuration were not reset.
- Telegram confirmed all 55 tracked message deletions: 55 deleted, 0 already absent, 0 too old, 0 failures, 0 tracked messages remaining immediately after cleanup. **Untracked Telegram history remains unknown. This is not proof of full chat-history removal.** The reset report is `reset-report.jsonl` inside the backup directory.
- Existing `@dogmeetrubot` restarted through the `scheduler` service. `getMe` succeeded; `getWebhookInfo` reports no webhook and 0 pending updates. The existing polling loop and notification queue listener started without observed errors. App, database and scheduler are healthy/running; public `/api/health` returns 200. No new bot/token, broadcasts, user `/start`, or dropped Telegram updates were used.
- Campaign `telegram-reconnect-2026-10-21` is active from **2026-10-21 15:15:03.523086 MSK** to **2026-10-23 15:15:03.523086 MSK**, exactly 48 hours. Database status/dates and one recorded production test impression were verified. App restarts, subsequent visits and repeated activation cannot extend these dates.
- Real production browser verification used a separate anonymous session with a saved location and no pets: the banner appeared, its receipt saved without clicking, and it stayed absent after reload. Screenshot: `outputs/telegram-reconnect-production.png`. The campaign also reaches users without pets; other announcements retain their pet requirement. The existing location/onboarding and home-screen entry rules remain in use.

## Validation and remaining limits

- New isolated PostgreSQL suite: 5 tests passed, covering one-time reset, preservation of unrelated data/rate limits, confirmed vs failed/absent deletion, exact nonextending dates, both/one/no active subscriptions, another chat account, future/expired campaigns and durable receipts.
- Existing announcement API/PostgreSQL suite: 17 passed. Existing Telegram unit/API/deletion/flow checks: 65 passed, 2 skipped for missing optional database configuration; the Dialog PostgreSQL suite was then run with the local test database and passed.
- New campaign browser suite passed all 8 mobile/desktop checks before the no-pet exception; after that change, all 7 targeted mobile tests (5 campaign cases and 2 general-banner regressions) passed, plus the desktop no-pet case. Typecheck, local build and both production image builds succeeded. Lint: 0 errors, 1 existing image warning in `DogmeetFrame.tsx`.
- The broader 43-test browser run had 40 passes and 3 failures. All 3 were reproduced with the original announcement component from HEAD: two old sharing-example tests expect a removed second SVG/chevron, and preview-off expects 404 while the external dev server has preview enabled and returns 401 without a session. These unrelated failures were not changed or represented as a passing full suite.
- Telegram Bot API cannot enumerate all historical private-chat messages or start the bot for a user. Full unknown-history deletion remains unfulfilled. The live confirmation flow must be completed by each user through the existing Telegram button; it was not simulated on anyone's behalf. Clearing both identity cookies and local storage creates a new anonymous identity that cannot be recognised as already shown.

A concurrent local navigation change in `app/Home.tsx` was preserved. Only the announcement condition was applied to the server's Home source; its diff is one line. No unrelated source changes were deployed.

## Official sources

- https://core.telegram.org/bots/api#deletemessage
- https://core.telegram.org/bots/api#getupdates
- https://core.telegram.org/bots/api#getwebhookinfo
- https://core.telegram.org/bots#how-do-bots-work
