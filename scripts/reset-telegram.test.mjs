import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import test from "node:test";
import pg from "pg";
import ts from "typescript";
import { drizzle } from "drizzle-orm/node-postgres";

const require = createRequire(import.meta.url);
const campaignId = "telegram-reconnect-2026-10-21";

test("one-time Telegram reset and reconnect campaign", {
  skip: !process.env.TELEGRAM_RESET_TEST_DATABASE_URL && "Set TELEGRAM_RESET_TEST_DATABASE_URL to a local test database"
}, async t => {
  const client = new pg.Client({ connectionString: process.env.TELEGRAM_RESET_TEST_DATABASE_URL });
  const schema = `telegram_reset_test_${randomUUID().replaceAll("-", "")}`;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE announcement_campaigns (id text PRIMARY KEY, starts_at timestamptz, ends_at timestamptz,
        permanent boolean DEFAULT false, status text DEFAULT 'active', pages jsonb NOT NULL,
        exclusions jsonb DEFAULT '{"cities":[],"districts":[],"complexes":[]}');
      CREATE TABLE announcement_receipts (client_id uuid, banner_id text, acknowledged_at timestamptz DEFAULT now(), PRIMARY KEY(client_id,banner_id));
      CREATE TABLE telegram_chat_settings (client_id uuid PRIMARY KEY, telegram_chat_id text, enabled boolean);
      CREATE TABLE telegram_complex_subscriptions (id int PRIMARY KEY, telegram_chat_id text, active boolean);
      CREATE TABLE telegram_subscription_intents (token_hash text PRIMARY KEY, completed_at timestamptz, expires_at timestamptz);
      CREATE TABLE telegram_walk_notifications (id int PRIMARY KEY, subscription_id int REFERENCES telegram_complex_subscriptions ON DELETE CASCADE, sent_at timestamptz, failed_at timestamptz);
      CREATE TABLE telegram_bot_messages (chat_id text, message_id int, sent_at timestamptz, PRIMARY KEY(chat_id,message_id));
      CREATE TABLE telegram_api_limits (scope text PRIMARY KEY, blocked_until timestamptz);
      INSERT INTO telegram_api_limits VALUES ('global', now() + interval '1 minute');
      CREATE TABLE pets (id int); INSERT INTO pets VALUES (1);
    `);
    const { resetTelegramSubscriptions, deleteTrackedTelegramHistory, activateTelegramReconnectCampaign } = await import("./reset-telegram.mjs");
    const owner = randomUUID();
    await client.query("INSERT INTO telegram_chat_settings VALUES ($1,'100',true)", [owner]);
    await client.query(`INSERT INTO telegram_complex_subscriptions VALUES (1,'100',true),(2,'200',false);
      INSERT INTO telegram_subscription_intents VALUES ('pending',null,now()+interval '1 hour');
      INSERT INTO telegram_walk_notifications VALUES (1,1,null,null)`);

    await t.test("reset clears subscriptions, bindings, intents and queue exactly once", async () => {
      const counts = await resetTelegramSubscriptions(client);
      assert.equal(counts.walkSubscriptions, 2);
      assert.equal(counts.messageBindings, 1);
      assert.equal(counts.intents, 1);
      assert.equal(counts.queuedNotifications, 1);
      for (const table of ["telegram_chat_settings", "telegram_complex_subscriptions", "telegram_subscription_intents", "telegram_walk_notifications"]) {
        assert.equal((await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count, 0);
      }
      assert.equal((await client.query("SELECT count(*)::int AS count FROM pets")).rows[0].count, 1);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM telegram_api_limits")).rows[0].count, 1);
      const marker = (await client.query("SELECT * FROM announcement_campaigns WHERE id=$1", [campaignId])).rows[0];
      assert.equal(marker.status, "disabled");
      assert.equal(marker.starts_at, null);
      await client.query("INSERT INTO telegram_chat_settings VALUES ($1,'100',true)", [owner]);
      await assert.rejects(resetTelegramSubscriptions(client), /already|уже/i);
      assert.equal((await client.query("SELECT count(*)::int AS count FROM telegram_chat_settings")).rows[0].count, 1);
    });

    await t.test("cleanup reports confirmed deletions separately and retains inaccessible history", async () => {
      const now = new Date("2026-10-21T12:00:00Z");
      for (const [id, age] of [[1, 1], [2, 1], [3, 48], [4, 1]]) {
        await client.query("INSERT INTO telegram_bot_messages VALUES ('100',$1,$2)", [id, new Date(+now - age * 3600_000)]);
      }
      const called = [];
      const report = await deleteTrackedTelegramHistory(client, async (method, body) => {
        called.push(body.message_id);
        assert.equal(method, "deleteMessage");
        if (body.message_id === 2) throw new Error("Bad Request: message to delete not found");
        if (body.message_id === 4) throw new Error("Forbidden");
        return true;
      }, now);
      assert.deepEqual(report, { tracked: 4, deleted: 1, alreadyAbsent: 1, tooOld: 1, failed: 1, remainingTracked: 2 });
      assert.deepEqual(called, [1, 2, 4]);
      assert.deepEqual((await client.query("SELECT message_id FROM telegram_bot_messages ORDER BY message_id")).rows.map(r => r.message_id), [3, 4]);
      await client.query("DELETE FROM telegram_bot_messages");
      await client.query("INSERT INTO telegram_bot_messages VALUES ('100',5,$1)", [now]);
      const unconfirmed = await deleteTrackedTelegramHistory(client, async () => false, now);
      assert.equal(unconfirmed.deleted, 0);
      assert.equal(unconfirmed.remainingTracked, 1);
    });

    await t.test("activation starts exactly 48 server hours once and never extends it", async () => {
      const first = await activateTelegramReconnectCampaign(client);
      assert.equal(+new Date(first.endsAt) - +new Date(first.startsAt), 48 * 3600_000);
      assert.ok(Math.abs(+new Date(first.startsAt) - Date.now()) < 5000);
      const repeated = await activateTelegramReconnectCampaign(client);
      assert.deepEqual(repeated, first);
    });

    await t.test("only both active subscriptions suppress the campaign; server receipts survive reloads", async () => {
      const exports = {};
      runInNewContext(ts.transpileModule(readFileSync(new URL("../lib/announcements.ts", import.meta.url), "utf8"), {
        compilerOptions: { module: ts.ModuleKind.CommonJS }
      }).outputText, { exports, require(name) {
        if (name === "../db") return { withDb: fn => fn(drizzle(client)) };
        if (name === "../db/schema") return {};
        if (name === "./announcement-types") return { telegramReconnectCampaignId: campaignId };
        if (name === "./announcement-settings") return { allowsAnnouncement: () => true };
        return require(name);
      } });
      const visible = async () => (await exports.listAnnouncements(owner)).banners.some(b => b.id === campaignId);
      assert.equal(await visible(), true, "messages only");
      await client.query("INSERT INTO telegram_complex_subscriptions VALUES (3,'200',true)");
      assert.equal(await visible(), true, "another Telegram account's walk subscription");
      await client.query("INSERT INTO telegram_complex_subscriptions VALUES (4,'100',true)");
      assert.equal(await visible(), false, "both subscriptions on the linked account");
      await client.query("UPDATE telegram_chat_settings SET enabled=false");
      assert.equal(await visible(), true, "walks only");
      await client.query("UPDATE telegram_complex_subscriptions SET active=false");
      assert.equal(await visible(), true, "neither active");
      await client.query("UPDATE telegram_chat_settings SET enabled=true");
      assert.equal(await visible(), true, "inactive walk subscription does not suppress");
      assert.equal(await exports.acknowledgeAnnouncement(owner, campaignId), true);
      assert.equal(await visible(), false, "seen even without closing");
      await client.query("DELETE FROM announcement_receipts");
      await client.query("UPDATE announcement_campaigns SET starts_at=now()+interval '1 hour' WHERE id=$1", [campaignId]);
      assert.equal(await visible(), false, "not started yet");
      await client.query("UPDATE announcement_campaigns SET starts_at=now()-interval '1 hour' WHERE id=$1", [campaignId]);
      await client.query("UPDATE announcement_campaigns SET ends_at=now() WHERE id=$1", [campaignId]);
      assert.equal(await visible(), false, "exact expiry is excluded");
      assert.equal(await exports.acknowledgeAnnouncement(owner, campaignId), false);
    });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
