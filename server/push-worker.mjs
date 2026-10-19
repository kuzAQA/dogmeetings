import { Client } from "pg";
import webpush from "web-push";
import { createHash } from "node:crypto";
import { request } from "node:https";
import { pushEndpoint } from "./push-validation.mjs";

export function pushConfiguration() {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  return publicKey && privateKey && subject ? { publicKey, privateKey, subject } : null;
}

export function sendPush(subscription, payload, options) {
  // The library encrypts/signs; AbortSignal bounds the whole request, including DNS/connect.
  const details = webpush.generateRequestDetails(subscription, payload, options);
  return new Promise((resolve, reject) => {
    const outgoing = request(details.endpoint, { method: details.method, headers: details.headers,
      signal: AbortSignal.timeout(options.timeout) }, response => {
      response.resume();
      if (response.statusCode >= 200 && response.statusCode < 300) resolve(undefined);
      else reject(Object.assign(new Error("Push provider rejected delivery"), { statusCode: response.statusCode }));
    });
    outgoing.on("error", reject);
    outgoing.end(details.body);
  });
}

export async function deliverPushBatch(client, config = pushConfiguration(), send = sendPush) {
  if (!config) return 0;
  // A crash during the last attempt must not leave an immortal pending job.
  await client.query(`UPDATE chat_push_outbox SET done_at = clock_timestamp(), outcome = 'exhausted', lease = NULL
    WHERE done_at IS NULL AND attempts >= 5 AND locked_until <= clock_timestamp()`);
  let processed = 0;
  for (; processed < 25; processed++) {
    const claimed = await client.query(`UPDATE chat_push_outbox SET attempts = attempts + 1,
      locked_until = clock_timestamp() + interval '60 seconds', lease = gen_random_uuid()
      WHERE id = (SELECT id FROM chat_push_outbox WHERE done_at IS NULL AND attempts < 5
        AND available_at <= clock_timestamp() AND (locked_until IS NULL OR locked_until <= clock_timestamp())
        ORDER BY available_at, id FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id, lease, attempts`);
    const job = claimed.rows[0];
    if (!job) break;
    const finish = outcome => client.query(`UPDATE chat_push_outbox SET done_at = clock_timestamp(), outcome = $3,
      lease = NULL, locked_until = NULL WHERE id = $1 AND lease = $2`, [job.id, job.lease, outcome]);
    // Recheck after claiming: reads, hides, expiry, revocation and session rotation cancel delivery.
    const eligible = await client.query(`SELECT s.endpoint, s.p256dh, s.auth, o.dialog_id, o.message_seq,
        floor(extract(epoch FROM d.expires_at - clock_timestamp()))::integer AS ttl
      FROM chat_push_outbox o JOIN push_subscriptions s ON s.id = o.subscription_id
      JOIN client_sessions c ON c.client_id = s.client_id AND c.token_hash = s.session_hash
      JOIN dialogs d ON d.id = o.dialog_id
      JOIN dialog_messages m ON m.dialog_id = o.dialog_id AND m.seq = o.message_seq
      WHERE o.id = $1 AND o.lease = $2 AND o.done_at IS NULL AND s.active AND s.version = o.subscription_version
        AND c.expires_at > clock_timestamp() AND d.expires_at > clock_timestamp() + interval '1 second'
        AND s.client_id = CASE WHEN m.sender_client_id = d.client_low THEN d.client_high ELSE d.client_low END
        AND m.read_at IS NULL AND m.seq > CASE WHEN s.client_id = d.client_low THEN d.low_hidden_through ELSE d.high_hidden_through END`,
    [job.id, job.lease]);
    const row = eligible.rows[0];
    if (!row) { await finish("cancelled"); continue; }
    try {
      pushEndpoint(row.endpoint);
      const eventId = `${row.dialog_id}:${row.message_seq}`;
      await send({ endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
        JSON.stringify({ title: "Новое сообщение в Диалогах", dialogId: row.dialog_id, eventId }),
        { vapidDetails: config, TTL: Math.max(1, Math.min(row.ttl, 259200)), timeout: 10000,
          topic: createHash("sha256").update(eventId).digest("base64url").slice(0, 32) });
      await finish("delivered");
    } catch (error) {
      const status = Number(error.statusCode || 0);
      if (status === 404 || status === 410) {
        await client.query(`UPDATE push_subscriptions SET active = false, updated_at = clock_timestamp()
          WHERE id = (SELECT subscription_id FROM chat_push_outbox WHERE id = $1 AND lease = $2)
            AND version = (SELECT subscription_version FROM chat_push_outbox WHERE id = $1 AND lease = $2)`, [job.id, job.lease]);
      }
      const transient = !status || status === 408 || status === 429 || status >= 500;
      if (transient && job.attempts < 5) {
        await client.query(`UPDATE chat_push_outbox SET available_at = clock_timestamp() + $3 * interval '1 second',
          locked_until = NULL, lease = NULL WHERE id = $1 AND lease = $2`, [job.id, job.lease, 10 * 2 ** (job.attempts - 1)]);
      } else await finish("failed");
    }
  }
  return processed;
}

export function startPushWorker() {
  let stopped = false, timer, client;
  async function run() {
    let processed = 0;
    try {
      if (pushConfiguration()) {
        client = new Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000, query_timeout: 15000 });
        await client.connect();
        processed = await deliverPushBatch(client);
      }
    } catch {
      // Never log endpoints, keys or payloads; failed jobs remain durable for the next run.
      console.error("[chat-push] Обработка очереди не выполнена; повтор через 5 секунд.");
    } finally {
      if (client) await client.end().catch(() => {});
      client = null;
      if (!stopped) timer = setTimeout(run, processed === 25 ? 0 : 5000);
    }
  }
  void run();
  return () => { stopped = true; clearTimeout(timer); };
}
