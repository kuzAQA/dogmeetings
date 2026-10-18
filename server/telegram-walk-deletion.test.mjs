import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { replaceTelegramWalkNotification } from "./telegram-walk-photo.mjs";
import { cleanupDeletedWalkMessages } from "./telegram-walk-deletion.mjs";

function fixture() {
  const walks = new Set(["walk-a", "walk-b"]);
  const messages = [];
  const live = new Set();
  const calls = [];
  const failures = new Map();
  let nextId = 1;
  const client = { async query(sql, params = []) {
    if (sql.includes("SELECT message_id")) return { rows: messages.filter(m => m.walk_id === params[0] && m.chat_id === params[1]).map(m => ({ ...m })) };
    if (sql.includes("SELECT walk_id")) return { rows: messages.filter(m => walks.has(m.walk_id)).map(m => ({ ...m })) };
    if (sql.includes("SELECT id FROM walks")) return { rows: [...walks].filter(id => params[0].includes(id)).map(id => ({ id })) };
    if (sql.includes("NOT EXISTS")) return { rows: messages.filter(m => m.walk_id && !walks.has(m.walk_id) && !(new Date(m.delete_next_attempt_at).getTime() > Date.now())).map(m => ({ ...m })) };
    if (sql.includes("UPDATE telegram_bot_messages")) {
      const message = messages.find(m => m.chat_id === params[0] && m.message_id === params[1]);
      if (message) message.delete_next_attempt_at = new Date(Date.now() + params[2] * 1000);
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO")) messages.push({ chat_id: params[0], message_id: params[1], sent_at: params[2], walk_id: params[3] });
    else if (sql.includes("DELETE FROM telegram_bot_messages")) {
      const index = messages.findIndex(m => m.chat_id === params[0] && m.message_id === params[1]);
      if (index >= 0) messages.splice(index, 1);
    } else assert.match(sql, /SAVEPOINT/);
    return { rows: [] };
  } };
  const request = async (method, body) => {
    if (method === "sendMessage") {
      const message = { message_id: nextId++, date: Math.floor(Date.now() / 1000), chat: { id: Number(body.chat_id) } };
      live.add(`${body.chat_id}/${message.message_id}`);
      return message;
    }
    assert.equal(method, "deleteMessage");
    calls.push({ ...body });
    if (failures.has(body.chat_id)) throw new Error(failures.get(body.chat_id));
    if (!live.delete(`${body.chat_id}/${body.message_id}`)) throw new Error("Bad Request: message to delete not found");
    return true;
  };
  const send = (walk, chat = "123") => replaceTelegramWalkNotification(client, walk, { chat_id: chat, text: "walk" }, async () => null, request);
  const remove = async () => { walks.delete("walk-a"); return true; };
  const cleanup = () => cleanupDeletedWalkMessages(client, request);
  return { walks, messages, live, calls, failures, client, request, send, remove, cleanup };
}

for (const edits of [0, 3]) test(`creation -> ${edits} edits -> deletion isolates other walks and notification types`, async () => {
  const f = fixture();
  await f.send("walk-b");
  f.messages.push({ chat_id: "123", message_id: 99, sent_at: new Date(), walk_id: null });
  f.live.add("123/99");
  for (let i = 0; i <= edits; i++) await f.send("walk-a");
  assert.equal(await f.remove(), true);
  await f.cleanup();
  assert.deepEqual([...f.live], ["123/1", "123/99"]);
  assert.deepEqual(f.messages.map(m => m.walk_id), ["walk-b", null]);
});

test("all chats and all persisted replacement IDs are cleaned; refusal is retried", async t => {
  const f = fixture();
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  await f.send("walk-a", "123");
  f.failures.set("123", "Too Many Requests: retry after 60");
  await f.send("walk-a", "123");
  await f.send("walk-a", "456");
  f.calls.length = 0;
  assert.equal(await f.remove(), true);
  await f.cleanup();
  assert.equal(f.calls.length, 2);
  assert.deepEqual(f.messages.map(m => m.chat_id), ["123", "123"]);
  assert.equal(errors.length, 2);
  f.failures.clear();
  f.messages.forEach(m => { m.delete_next_attempt_at = new Date(0); });
  await cleanupDeletedWalkMessages(f.client, f.request);
  assert.equal(f.messages.length, 0);
  assert.equal(f.live.size, 0);
});

test("absent message, absent ID and absent notification are harmless", async t => {
  const f = fixture();
  t.mock.method(console, "error", () => assert.fail("missing messages should not log errors"));
  await f.send("walk-a");
  f.live.clear();
  f.messages.push({ walk_id: "walk-a", chat_id: "456", sent_at: new Date() });
  await f.remove();
  assert.equal(f.calls.length, 0);
  await f.cleanup();
  assert.equal(f.calls.length, 1);
  assert.equal(f.messages.filter(m => m.message_id).length, 0);
  const empty = fixture();
  await empty.remove();
  assert.equal(empty.calls.length, 0);
});

test("existing walks are untouched by background deletion", async () => {
  const f = fixture();
  await f.send("walk-a");
  await f.cleanup();
  assert.equal(f.calls.length, 0);
  assert.equal(f.messages.length, 1);
  assert.equal(f.live.size, 1);
});

test("48-hour limit and false API result retain IDs without claiming deletion", async t => {
  const f = fixture();
  const errors = [];
  t.mock.method(console, "error", (...args) => errors.push(args));
  await f.send("walk-a", "123");
  await f.send("walk-a", "456");
  f.messages[0].sent_at = new Date(Date.now() - 48 * 60 * 60 * 1000);
  await f.remove();
  await cleanupDeletedWalkMessages(f.client, async () => false);
  assert.equal(f.messages.length, 2);
  assert.equal(f.live.size, 2);
  assert.equal(errors.length, 2);
});

test("metadata cleanup failure cannot fail deletion and remains retryable", async t => {
  const f = fixture();
  t.mock.method(console, "error", () => {});
  await f.send("walk-a");
  const query = f.client.query;
  f.client.query = async (sql, params) => {
    if (sql.includes("DELETE FROM telegram_bot_messages")) throw new Error("storage unavailable");
    return query(sql, params);
  };
  assert.equal(await f.remove(), true);
  await f.cleanup();
  assert.equal(f.messages.length, 1);
  assert.equal(f.live.size, 0);
  f.client.query = query;
  f.messages.forEach(m => { m.delete_next_attempt_at = new Date(0); });
  await cleanupDeletedWalkMessages(f.client, f.request);
  assert.equal(f.messages.length, 0);
});

test("API deletion paths never perform Telegram I/O; worker retries retained IDs", async () => {
  const db = await readFile(new URL('../db/index.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(db, /telegram|withWalkDeletion/);
  for (const path of ["walks", "pets", "dogsfather/pets", "dogsfather/locations"]) {
    const source = await readFile(new URL(`../app/api/${path}/route.ts`, import.meta.url), "utf8");
    assert.doesNotMatch(source.slice(source.indexOf("export async function DELETE")), /telegram|withWalkDeletion/);
  }
  const worker = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
  assert.match(worker.slice(worker.indexOf("async function retryWalkTelegramNotifications")), /cleanupDeletedWalkMessages\(client/);
});
