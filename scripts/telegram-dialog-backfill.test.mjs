import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

const filename = "0052_enable_walk_subscribers_dialog_notifications.sql";
const clientId = (number) => `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`;

test("dialog backfill enables only active walk subscribers and preserves later opt-outs", async () => {
  assert.ok(process.env.TELEGRAM_DIALOG_BACKFILL_TEST_DATABASE_URL,
    "Set TELEGRAM_DIALOG_BACKFILL_TEST_DATABASE_URL to a dedicated PostgreSQL test database");
  const client = new Client({ connectionString: process.env.TELEGRAM_DIALOG_BACKFILL_TEST_DATABASE_URL });
  const schema = `telegram_backfill_test_${randomUUID().replaceAll("-", "")}`;
  const sql = await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8");
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE telegram_complex_subscriptions (
        id serial PRIMARY KEY, telegram_chat_id varchar(20) NOT NULL, active boolean NOT NULL
      );
      CREATE TABLE telegram_chat_settings (
        client_id uuid PRIMARY KEY, telegram_chat_id varchar(20) NOT NULL,
        enabled boolean NOT NULL DEFAULT false
      );
      CREATE TABLE telegram_subscription_intents (
        token_hash text PRIMARY KEY, client_id uuid, used_by_chat_id varchar(20),
        used_at timestamptz, expires_at timestamptz NOT NULL
      );
      CREATE TABLE app_migrations (
        filename text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now()
      );
      INSERT INTO telegram_complex_subscriptions (telegram_chat_id, active)
      VALUES ('100', true), ('100', true), ('200', false), ('600', true);
    `);
    for (const [number, chat, enabled] of [
      [1, "100", false], [2, "100", true], [3, "200", false], [4, "300", false],
      [5, "100", false], [6, "500", false], [13, "100", false], [20, "200", true],
    ]) {
      await client.query("INSERT INTO telegram_chat_settings VALUES ($1, $2, $3)",
        [clientId(number), chat, enabled]);
    }
    for (const [index, [number, chat, used, expired]] of [
      [7, "100", true, false], [8, "100", false, false], [9, null, true, false],
      [null, "100", true, false], [11, "100", true, true],
      [12, "100", true, false], [12, "200", true, true],
      [6, "100", true, false], [13, "200", true, false], [14, "200", true, false],
      [15, "", true, false], [16, "100", true, false], [16, "100", true, true],
      [17, "100", true, false], [17, "600", true, false],
      [18, "100", true, false], [18, "200", false, false],
    ].entries()) {
      await client.query(`
        INSERT INTO telegram_subscription_intents VALUES
          ($1, $2, $3, $4, now() + ($5::integer * interval '1 day'))
      `, [String(index), number === null ? null : clientId(number), chat,
        used ? new Date() : null, expired ? -1 : 1]);
    }

    // Match migrate.sh's filename guard and atomic SQL + tracking transaction in the isolated schema.
    const migrate = async () => {
      const applied = await client.query("SELECT 1 FROM app_migrations WHERE filename = $1", [filename]);
      if (applied.rowCount) return false;
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("INSERT INTO app_migrations (filename) VALUES ($1)", [filename]);
        await client.query("COMMIT");
        return true;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    };
    const settings = async () => (await client.query(
      "SELECT client_id, telegram_chat_id, enabled FROM telegram_chat_settings ORDER BY client_id"
    )).rows;

    assert.equal(await migrate(), true);
    assert.deepEqual(await settings(), [
      [1, "100", true], [2, "100", true], [3, "200", false], [4, "300", false],
      [5, "100", true], [6, "500", false], [7, "100", true], [11, "100", true],
      [13, "100", true], [16, "100", true], [18, "100", true], [20, "200", true],
    ].map(([number, chat, enabled]) => ({
      client_id: clientId(number), telegram_chat_id: chat, enabled,
    })));

    const firstResult = await settings();
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    assert.deepEqual(await settings(), firstResult, "repeated SQL must not duplicate client settings");

    await client.query("UPDATE telegram_chat_settings SET enabled = false WHERE client_id = $1", [clientId(7)]);
    const optedOut = await settings();
    assert.equal(await migrate(), false, "tracked migration must not run again");
    assert.deepEqual(await settings(), optedOut, "later user opt-out must survive the next migration run");
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM app_migrations")).rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
