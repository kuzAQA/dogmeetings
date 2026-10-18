import assert from "node:assert/strict";
import test from "node:test";
import { requestTelegramApi, reserveTelegramRequest } from "./telegram-api.mjs";
const initialTime = Date.now();
let clock = initialTime;
test.beforeEach(t => {
  clock += 120_000;
  t.mock.method(Date, "now", () => clock);
});

function storage() {
  const limits = new Map(), commands = [];
  let saved;
  return { limits, commands, async query(sql, params = []) {
    commands.push(sql);
    if (sql === "BEGIN") saved = new Map([...limits].map(([key, value]) => [key, { ...value }]));
    if (sql === "ROLLBACK") { limits.clear(); for (const [key, value] of saved) limits.set(key, value); }
    if (sql.includes("unnest")) for (const scope of params[0]) if (!limits.has(scope)) limits.set(scope, { scope, next_at: new Date(0), blocked_until: new Date(0) });
    if (sql.includes("FOR UPDATE")) return { rows: params[0].map(scope => ({ ...limits.get(scope) })) };
    if (sql.startsWith("UPDATE")) limits.get(params[0]).next_at = params[1];
    if (sql.includes("EXCLUDED.blocked_until")) limits.get("global").blocked_until = new Date(Date.now() + params[0] * 1000);
    if (sql.startsWith("SELECT blocked_until")) return { rows: [limits.get("global")] };
    return { rows: [] };
  } };
}

test("shared reservations enforce 20 requests/sec, private chat and group spacing", async () => {
  const client = storage(), now = Date.now();
  assert.equal(await reserveTelegramRequest(client, "123", now), 0);
  assert.equal(await reserveTelegramRequest(client, "456", now), 50);
  assert.equal(await reserveTelegramRequest(client, "123", now), 1000);
  assert.equal(await reserveTelegramRequest(client, "-123", now), 1050);
  assert.equal(await reserveTelegramRequest(client, "-123", now), 4050);
  await assert.rejects(reserveTelegramRequest(client, "-123", now), error => error.retryAfter === 8);
  assert.equal(client.commands.at(-1), "ROLLBACK");
  assert.equal(new Date(client.limits.get("chat:-123").next_at).getTime(), now + 7050);
});

test("429 persists retry_after; another process/new signal cannot issue a request during the pause", async () => {
  const client = storage();
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: false, status: 429, json: async () => ({ ok: false, parameters: { retry_after: 37 } }) }; };
  const rateDb = callback => callback(client);
  await assert.rejects(requestTelegramApi("fake", "sendMessage", { chat_id: "123" }, fetcher, 5000, rateDb), error => error.retryAfter === 37);
  assert.ok(client.limits.get("global").blocked_until.getTime() > Date.now() + 35_000);
  const { requestTelegramApi: otherProcess } = await import("./telegram-api.mjs?second-process");
  await assert.rejects(otherProcess("fake", "deleteMessage", { chat_id: "456", message_id: 1 }, fetcher, 5000, rateDb), error => error.retryAfter >= 36);
  assert.equal(calls, 1);
});

test("429 with absent retry_after has a safe pause; other API errors preserve status", async () => {
  const client = storage();
  await assert.rejects(requestTelegramApi("fake", "sendMessage", {}, async () => ({ ok: false, status: 429, json: async () => ({}) }), 5000, callback => callback(client)), error => error.retryAfter === 60);
  clock += 61_000;
  const other = storage();
  await assert.rejects(requestTelegramApi("fake", "sendMessage", {}, async () => ({ ok: false, status: 403, json: async () => ({ description: "bot was blocked" }) }), 5000, callback => callback(other)), error => error.telegramStatus === 403 && !error.retryAfter);
});

test("a failed pause write retains retry_after and stops requests in the current process", async t => {
  const client = storage();
  const query = client.query;
  client.query = async (sql, params) => {
    if (sql.includes("EXCLUDED.blocked_until")) throw new Error("database unavailable");
    return query(sql, params);
  };
  t.mock.method(console, "error", () => {});
  let calls = 0;
  const fetcher = async () => { calls++; return { ok: false, status: 429, json: async () => ({ parameters: { retry_after: 90 } }) }; };
  await assert.rejects(requestTelegramApi("fake", "sendMessage", {}, fetcher, 5000, cb => cb(client)), error => error.retryAfter === 90);
  await assert.rejects(requestTelegramApi("fake", "sendMessage", {}, fetcher, 5000, cb => cb(client)), error => error.retryAfter === 90);
  assert.equal(calls, 1);
});

test("multipart bodies and Telegram results remain intact; false deletion is rejected", async () => {
  const client = storage(), form = new FormData();
  form.set("chat_id", "123");
  const message = { message_id: 7, date: 1, chat: { id: 123 } };
  assert.equal(await requestTelegramApi("fake", "sendPhoto", form, async (_url, options) => {
    assert.equal(options.body, form);
    assert.equal(options.headers, undefined);
    return { ok: true, json: async () => ({ ok: true, result: message }) };
  }, 5000, callback => callback(client)), message);
  await assert.rejects(requestTelegramApi("fake", "deleteMessage", {}, async () => ({ ok: true, json: async () => ({ ok: true, result: false }) }), 5000, callback => callback(storage())), /не подтвердил/);
});
