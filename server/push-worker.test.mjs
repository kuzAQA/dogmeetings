import assert from "node:assert/strict";
import test from "node:test";
import { deliverPushBatch } from "./push-worker.mjs";

function fixture(fail) {
  const queries = [], sent = [];
  let claimed = false;
  const client = { async query(sql, values) {
    queries.push({ sql, values });
    if (sql.includes("SKIP LOCKED")) {
      if (claimed) return { rows: [] };
      claimed = true;
      return { rows: [{ id: "job", lease: "lease", attempts: 1 }] };
    }
    if (sql.includes("SELECT s.endpoint")) return { rows: [{ endpoint: "https://fcm.googleapis.com/fcm/send/a", p256dh: "key", auth: "auth", dialog_id: "dialog", message_seq: "1", ttl: 120 }] };
    return { rows: [] };
  } };
  return { queries, sent, client, send: async (...args) => { sent.push(args); if (fail) throw fail; } };
}
const config = { publicKey: "public", privateKey: "private", subject: "mailto:test@example.com" };

test("delivery uses a durable lease and minimal payload, then acknowledges only that job", async () => {
  const f = fixture();
  assert.equal(await deliverPushBatch(f.client, config, f.send), 1);
  assert.deepEqual(JSON.parse(f.sent[0][1]), { title: "Новое сообщение в Диалогах", dialogId: "dialog", eventId: "dialog:1" });
  assert.equal(f.sent[0][2].TTL, 120);
  assert.equal(f.sent[0][2].timeout, 10000);
  assert.ok(f.queries.some(q => q.sql.includes("done_at") && q.values?.includes("delivered")));
});

test("temporary errors back off, permanent gone responses deactivate subscription", async () => {
  for (const statusCode of [429, 503, 404, 410, 400]) {
    const f = fixture({ statusCode });
    await deliverPushBatch(f.client, config, f.send);
    assert.equal(f.queries.some(q => q.sql.includes("SET active = false")), statusCode === 404 || statusCode === 410);
    assert.equal(f.queries.some(q => q.sql.includes("available_at =") && q.values?.includes(10)), statusCode === 429 || statusCode === 503);
  }
});

test("without VAPID no jobs are claimed", async () => {
  const f = fixture();
  assert.equal(await deliverPushBatch(f.client, null, f.send), 0);
  assert.equal(f.queries.length, 0);
});
