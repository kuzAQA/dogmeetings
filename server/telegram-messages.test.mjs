import { requestTelegramApi } from "./telegram-api.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { replaceTelegramWalkNotification } from "./telegram-walk-photo.mjs";
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
    AbortSignal, FormData,
    requestTelegramApi: (...args) => requestTelegramApi(...args, async callback => callback({ query: async () => ({ rows: [] }) })),
    recordTelegramMessage: async () => { throw new Error("storage unavailable"); },
    console: { error() {} }
  });
  const form = new FormData();
  form.set("chat_id", "123");
  for (const method of ["sendMessage", "sendPhoto"]) {
    queries.length = 0;
    assert.equal(await request("fake", method, method === "sendPhoto" ? form : {}, 5000, { query: async (sql) => queries.push(sql) }, true), message);
    assert.deepEqual(queries, ["SAVEPOINT telegram_message_tracking", "ROLLBACK TO SAVEPOINT telegram_message_tracking"]);
  }
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

function walkMessageStorage() {
  const rows = [];
  const live = new Map();
  const events = [];
  let nextId = 1;
  const failures = { send: false, deletion: '' };
  const client = { async query(sql, params = []) {
    if (sql.includes('SELECT message_id')) return { rows: rows.filter(row => row.walk_id === params[0] && row.chat_id === params[1]).map(row => ({ ...row })) };
    if (sql.includes('INSERT INTO telegram_bot_messages')) {
      events.push('persist');
      rows.push({ chat_id: params[0], message_id: params[1], sent_at: params[2], walk_id: params[3] });
    }
    if (sql.includes('DELETE FROM telegram_bot_messages')) {
      const index = rows.findIndex(row => row.chat_id === params[0] && row.message_id === params[1]);
      if (index >= 0) rows.splice(index, 1);
    }
    return { rows: [] };
  } };
  const request = async (method, body) => {
    if (method === 'sendMessage') {
      events.push('send');
      if (failures.send) throw new Error('send failed');
      const message = { message_id: nextId++, date: Math.floor(Date.now() / 1000), chat: { id: Number(body.chat_id) } };
      live.set(`${body.chat_id}/${message.message_id}`, body.text);
      return message;
    }
    assert.equal(method, 'deleteMessage');
    assert.equal(events.at(-1), 'persist', 'persist the new message before attempting deletion');
    if (failures.deletion) throw new Error(failures.deletion);
    if (!live.delete(`${body.chat_id}/${body.message_id}`)) throw new Error('Bad Request: message to delete not found');
    return true;
  };
  const send = async (walkId, chatId, text) => replaceTelegramWalkNotification(client, walkId, { chat_id: chatId, text }, async () => null, request);
  return { client, rows, live, events, failures, send };
}

test('creation -> edit -> second edit leaves one current message; tracking survives a new caller', async () => {
  const f = walkMessageStorage();
  for (const text of ['created', 'edited', 'edited again']) {
    await f.send('walk-a', '123', text);
    assert.equal(f.live.size, 1);
    assert.equal(f.rows.length, 1);
    assert.equal([...f.live.values()][0], text);
  }
  await replaceTelegramWalkNotification(f.client, 'walk-a', { chat_id: '123', text: 'after restart' }, async () => null,
    async (method, body) => {
      if (method === 'sendMessage') { f.live.set('123/10', body.text); return { message_id: 10, date: Math.floor(Date.now() / 1000), chat: { id: 123 } }; }
      f.live.delete(`123/${body.message_id}`); return true;
    });
  assert.deepEqual([...f.live.values()], ['after restart']);
  assert.equal(f.rows[0].message_id, 10);
});

test('replacement isolates walks, chats and unrelated notification types', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'a');
  await f.send('walk-b', '123', 'b');
  await f.send('walk-a', '-456', 'a other chat');
  f.rows.push({ walk_id: null, chat_id: '123', message_id: 99, sent_at: new Date() });
  f.live.set('123/99', 'location request');
  await f.send('walk-a', '123', 'a edited');
  assert.deepEqual([...f.live.values()].sort(), ['a edited', 'a other chat', 'b', 'location request']);
  assert.equal(f.rows.length, 4);
});

test('send failure leaves the old message and its persisted ID untouched', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'created');
  f.failures.send = true;
  await assert.rejects(f.send('walk-a', '123', 'edited'), /send failed/);
  assert.deepEqual([...f.live.values()], ['created']);
  assert.equal(f.rows[0].message_id, 1);
  assert.deepEqual(f.events, ['send', 'persist', 'send']);
});

test('already absent old message is handled without an error', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'created');
  f.live.clear();
  await f.send('walk-a', '123', 'edited');
  assert.deepEqual([...f.live.values()], ['edited']);
  assert.deepEqual(f.rows.map(row => row.message_id), [2]);
});

test('deletion failure logs the refusal and preserves new ID plus old ID for a later retry', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'created');
  f.failures.deletion = "Bad Request: message can't be deleted";
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try { await f.send('walk-a', '123', 'edited'); } finally { console.error = original; }
  assert.equal(errors.length, 1);
  assert.deepEqual(f.rows.map(row => row.message_id), [1, 2]);
  assert.equal(f.live.size, 2, 'Telegram refusal must not be reported as deletion');
  f.failures.deletion = '';
  await f.send('walk-a', '123', 'edited again');
  assert.deepEqual([...f.live.values()], ['edited again']);
  assert.deepEqual(f.rows.map(row => row.message_id), [3]);
});

test('48-hour limit retains both IDs and logs that the old message cannot be deleted', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'created');
  f.rows[0].sent_at = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try { await f.send('walk-a', '123', 'edited'); } finally { console.error = original; }
  assert.equal(errors.length, 1);
  assert.match(String(errors[0][1]), /48/);
  assert.deepEqual(f.rows.map(row => row.message_id), [1, 2]);
  assert.equal(f.live.size, 2);
});

test('failed metadata deletion rolls back only its savepoint and retains the new message ID', async () => {
  const f = walkMessageStorage();
  await f.send('walk-a', '123', 'created');
  const query = f.client.query;
  const sqlCalls = [];
  f.client.query = async (sql, params) => {
    sqlCalls.push(sql);
    if (sql.includes('DELETE FROM telegram_bot_messages')) throw new Error('metadata deletion failed');
    return query(sql, params);
  };
  const errors = [];
  const original = console.error;
  console.error = (...args) => errors.push(args);
  try { await f.send('walk-a', '123', 'edited'); } finally { console.error = original; }
  assert.deepEqual([...f.live.values()], ['edited']);
  assert.ok(f.rows.some(row => row.message_id === 2));
  assert.ok(sqlCalls.includes('ROLLBACK TO SAVEPOINT telegram_walk_delete'));
  assert.ok(sqlCalls.includes('RELEASE SAVEPOINT telegram_walk_delete'));
  assert.equal(errors.length, 1);
});
