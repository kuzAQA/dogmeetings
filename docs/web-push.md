# Web Push for chat

1. Generate a VAPID key pair once: `pnpm exec web-push generate-vapid-keys --json`. Keep the private key secret. Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (a real `mailto:` contact) in the app and existing scheduler environments. Compose passes all three to both processes. Restarting must reuse the pair. A changed key requires reconnecting each browser.
2. Apply `drizzle/0047_chat_push.sql` through the existing migration runner before updating the app. This adds subscriptions, per-device outbox jobs and an unread index; it does not change existing messages or deadlines. No production migration or deployment was performed for this change.
3. Start the app as usual and the existing `node scripts/cleanup-expired-walks.mjs` scheduler. Compose already starts this scheduler. It checks the durable PostgreSQL push outbox every 5 seconds even when no browser is open. No separate queue service is required. Without VAPID configuration, jobs stay pending until configured or their dialogs expire. The connection prompt stays open and explains the configuration error.
4. Use HTTPS (localhost is sufficient for mocked tests). On iOS/iPadOS 16.4+, add Dogmeet to the Home Screen from Safari and open the installed app. Permission must be granted by the user. Browser permission alone does not enable delivery: the local subscription and authenticated server record must both exist. The setting applies to this browser/installation, and session rotation invalidates old jobs until reconnection.

A phone opening a LAN address such as `http://192.168.0.137:3001/` is not in a secure context: Chrome blocks Push and Service Worker APIs there. Localhost is a browser exception for the same device; it does not make a computer’s LAN address secure on a phone. Phone delivery tests need HTTPS with a certificate trusted by that phone. The connection dialog explains this before requesting permission.

After the first successful creation of an owned pet and the save confirmation, a blocking prompt opens. Shared pets, editing and failed saves do not trigger it. The first-owned-pet marker persists in this browser independently of the pet list, so deleting all owned pets and adding another does not show it again. Existing owned pets also set this marker when loaded. Selecting a location does not open it. Escape, backdrop clicks, dragging and background scrolling do not dismiss it. The background is inert to keyboard and assistive technology. Only a successful **Подключить** action closes it. Denial, dismissed permission, unsupported browsers, registration errors and server failures leave the prompt open with instructions and retry. Its pending state survives reload where browser storage is available. Menu disabling requires confirmation, stops server delivery first, then unsubscribes locally; a local unsubscribe failure is reported separately. If a cleared session cookie leaves an endpoint owned by an earlier client, connecting recreates the browser subscription without transferring the old server record.

## Delivery guarantees

Message creation and recipient jobs commit in one transaction. A repeated message request creates no additional jobs. Each active subscription has its own job and version. Jobs use an atomic `SKIP LOCKED` claim, a 60-second lease, at most 5 attempts and exponential delays of 10, 20, 40 and 80 seconds. Restarted workers recover expired leases; completed jobs never run again. Temporary network/408/429/5xx errors retry; 404/410 deactivate that subscription. Other permanent HTTP errors finish the job. Job eligibility is checked again immediately before delivery: recipient membership, unread status, hidden-through boundary, original 72-hour deadline, active subscription version and current unexpired session must all match. TTL never exceeds the remaining dialog lifetime. Expired dialog cleanup cascades to jobs.

The standard `web-push` library encrypts and signs requests; Node HTTPS sends them with a 10-second overall abort deadline, including DNS and connection setup. Notification clicks use an acknowledged message to a ready tab, with a same-origin URL fallback for a tab still bootstrapping its session.

HTTP Web Push cannot guarantee exactly-once delivery if a process dies after the provider accepts a request but before PostgreSQL records success. A stable `dialogId:messageSeq` event, Web Push topic, notification tag and persistent service-worker event deduplication suppress repeated user notifications. There remains an unavoidable crash window between showing a notification and recording its ID. A message can also be read after eligibility checking while a provider request is in flight. These limitations must not be described as exactly-once delivery.

Payloads contain only a fixed title, dialog ID and stable event ID. Endpoints and keys are private, never logged or returned to another session. The API requires the existing cookie session and same-origin mutations, validates P-256/auth keys, and accepts only HTTPS push endpoints from FCM, Mozilla, Apple and Windows push services. The service worker does not cache private responses and only opens same-origin dialog links. Opening a push, menu, list or fetching unread counts does not mark messages read; the existing visible-message observer does.

## Local verification

```sh
node --test server/push-validation.test.mjs server/push-worker.test.mjs server/push-service-worker.test.mjs
CHAT_TEST_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/dogmeet_push_test node --experimental-strip-types --test lib/dialogs.test.ts lib/push.test.ts
VINEXT_RUNTIME=node VINEXT_NO_DEV_LOCK=1 pnpm exec playwright test e2e/push-unread.spec.ts e2e/unread-race.spec.ts --project=mobile --project=desktop
pnpm lint
pnpm exec tsc --noEmit
pnpm build
```

Tests create and remove isolated schemas in the explicitly supplied local database. Browser mocks test subscription control flow and UI; they do **not** prove real push delivery. A real HTTPS browser/device and real VAPID configuration are still required for an end-to-end delivery check. Do not access production to perform this check without authorization.
