import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { cleanupTelegramMessages, nextTelegramCleanupAt, recordTelegramMessage, telegramRetentionBoundary } from "../scripts/cleanup-expired-walks.mjs";

const now = new Date("2026-10-05T00:00:00+03:00");
const dates = ["2026-10-03T23:59:59+03:00", "2026-10-04T00:00:00+03:00", "2026-10-05T00:00:00+03:00"];

function storage() {
  const messages = dates.map((sent_at, i) => ({ chat_id: "123", message_id: i + 1, sent_at: new Date(sent_at) }));
  let queue = messages.map((message) => ({ ...message }));
  return {
    messages,
    get queue() { return queue; },
    async query(sql, params) {
      if (sql.includes("DELETE FROM telegram_walk_notifications")) queue = queue.filter((row) => row.sent_at >= params[0]);
      else if (sql.includes("SELECT")) return { rows: messages.filter((row) => row.sent_at < params[0]) };
      else if (sql.includes("DELETE FROM telegram_bot_messages")) {
        const index = messages.findIndex((row) => row.chat_id === params[0] && row.message_id === params[1]);
        if (index >= 0) messages.splice(index, 1);
      }
      return { rows: [] };
    }
  };
}

test("calendar boundary and next midnight use Moscow, including month/year rollover", () => {
  assert.equal(telegramRetentionBoundary(now).toISOString(), "2026-10-03T21:00:00.000Z");
  assert.equal(nextTelegramCleanupAt(now).toISOString(), "2026-10-05T21:00:00.000Z");
  assert.equal(telegramRetentionBoundary(new Date("2026-10-04T20:59:59Z")).toISOString(), "2026-10-02T21:00:00.000Z");
  assert.equal(telegramRetentionBoundary(new Date("2026-01-01T00:00:00+03:00")).toISOString(), "2025-12-30T21:00:00.000Z");
  assert.equal(telegramRetentionBoundary(new Date("2024-03-01T00:00:00+03:00")).toISOString(), "2024-02-28T21:00:00.000Z");
});

test("strict boundary deletes day-before-yesterday, retains yesterday/today; rerun is safe", async () => {
  const client = storage();
  const calls = [];
  const request = async (method, body) => { calls.push({ method, body }); return true; };
  await cleanupTelegramMessages(client, request, now);
  await cleanupTelegramMessages(client, request, now);
  assert.deepEqual(client.messages.map((row) => row.message_id), [2, 3]);
  assert.deepEqual(client.queue.map((row) => row.message_id), [2, 3]);
  assert.deepEqual(calls, [{ method: "deleteMessage", body: { chat_id: "123", message_id: 1 } }]);
});

test("downtime and API failure retain metadata, log failure and continue", async () => {
  const client = storage();
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try {
    assert.equal(await cleanupTelegramMessages(client, async () => false, now), true);
    assert.equal(client.messages.length, 3);
    let calls = 0;
    assert.equal(await cleanupTelegramMessages(client, async () => { calls++; return true; }, new Date("2026-10-10T00:00:00+03:00")), false);
    assert.equal(calls, 0); // Telegram forbids deletion after 48h.
    assert.equal(client.queue.length, 0);
    assert.equal(client.messages.length, 3);
    assert.equal(errors.length, 4);
  } finally { console.error = original; }
});

test("tracking uses Telegram date/IDs and conflict-safe insert", async () => {
  let saved;
  await recordTelegramMessage({ query: async (...args) => { saved = args; } }, {
    message_id: 7, date: now.getTime() / 1000, chat: { id: -123 }
  });
  assert.match(saved[0], /ON CONFLICT DO NOTHING/);
  assert.deepEqual(saved[1], ["-123", 7, now]);
  await assert.rejects(recordTelegramMessage({ query: async () => assert.fail() }, {}));
});

test("tracking failure rolls back its savepoint without failing an already sent notification", async () => {
  const source = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
  const body = source.slice(source.indexOf("async function telegramBotRequest("), source.indexOf("function locationRequestMessage("));
  const queries = [];
  const message = { message_id: 7, date: now.getTime() / 1000, chat: { id: 123 } };
  const request = runInNewContext(body + "\ntelegramBotRequest", {
    fetch: async () => ({ ok: true, json: async () => ({ ok: true, result: message }) }),
    AbortSignal,
    recordTelegramMessage: async () => { throw new Error("storage unavailable"); },
    console: { error() {} }
  });
  assert.equal(await request("fake", "sendMessage", {}, 5000, { query: async (sql) => queries.push(sql) }, true), message);
  assert.deepEqual(queries, ["SAVEPOINT telegram_message_tracking", "ROLLBACK TO SAVEPOINT telegram_message_tracking"]);
});

test("existing scheduler starts cleanup immediately and schedules Moscow midnight without real I/O", async () => {
  const source = (await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "")
    .replace("import.meta.url", '"file:///mock-scheduler.mjs"');
  const timers = [];
  let cleaned = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now.getTime(); } }
  runInNewContext(source, {
    pg: { Client: class { async connect() {} async end() {} async query(sql) { if (sql.includes("DELETE FROM telegram_walk_notifications")) cleaned++; return { rows: [] }; } } },
    Date: Clock, Intl, console: { info() {}, error() {} },
    process: { argv: ["node", "/mock-scheduler.mjs"], env: { DATABASE_URL: "mock" }, on() {} },
    setTimeout: (callback, delay) => { timers.push({ callback: callback.name, delay }); return 1; }, clearTimeout() {},
    pathToFileURL: () => ({ href: "file:///mock-scheduler.mjs" })
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(cleaned, 1);
  assert.ok(timers.some((timer) => timer.callback === "runMessageCleanup" && timer.delay === 24 * 60 * 60 * 1000));
  assert.ok(timers.some((timer) => timer.callback === "runAndSchedule" && timer.delay === 6 * 60 * 60 * 1000));
});
