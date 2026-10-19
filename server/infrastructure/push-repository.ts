import { sql } from "drizzle-orm";
import { withDb } from "../../db";
import { ChatError } from "./chat-repository";

export async function subscriptionStatus(clientId: string, sessionHash: string, endpoint: string) {
  return withDb(async db => {
    const result = await db.execute<{ active: boolean }>(sql`SELECT active FROM push_subscriptions
      WHERE client_id = ${clientId}::uuid AND session_hash = ${sessionHash} AND endpoint = ${endpoint}`);
    return { enabled: result.rows[0]?.active === true };
  });
}

export async function savePushSubscription(clientId: string, sessionHash: string,
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) {
  return withDb(db => db.transaction(async tx => {
    const owned = await tx.execute<{ client_id: string }>(sql`SELECT client_id FROM push_subscriptions WHERE endpoint = ${subscription.endpoint} FOR UPDATE`);
    if (owned.rows[0] && owned.rows[0].client_id !== clientId) throw new ChatError(409, "Подписка связана с другой сессией браузера.");
    // Keeping the version on an identical retry prevents replaying old deliveries.
    const result = await tx.execute(sql`INSERT INTO push_subscriptions (client_id, session_hash, endpoint, p256dh, auth)
      VALUES (${clientId}::uuid, ${sessionHash}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
      ON CONFLICT (endpoint) DO UPDATE SET active = true, session_hash = EXCLUDED.session_hash,
        p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth, updated_at = clock_timestamp(),
        version = CASE WHEN push_subscriptions.active AND push_subscriptions.session_hash = EXCLUDED.session_hash
          AND push_subscriptions.p256dh = EXCLUDED.p256dh AND push_subscriptions.auth = EXCLUDED.auth
          THEN push_subscriptions.version ELSE gen_random_uuid() END
      WHERE push_subscriptions.client_id = EXCLUDED.client_id RETURNING id`);
    if (!result.rows.length) throw new ChatError(409, "Подписка связана с другой сессией браузера.");
    return { enabled: true };
  }));
}

export async function disablePushSubscription(clientId: string, sessionHash: string, endpoint: string) {
  return withDb(async db => {
    await db.execute(sql`UPDATE push_subscriptions SET active = false, updated_at = clock_timestamp()
      WHERE client_id = ${clientId}::uuid AND session_hash = ${sessionHash} AND endpoint = ${endpoint}`);
    return { enabled: false };
  });
}
