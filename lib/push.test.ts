import assert from "node:assert/strict";
import { createECDH, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL) for (const suffix of [".ts", "/index.ts"]) {
    const url = new URL(specifier + suffix, context.parentURL);
    if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
  }
  return nextResolve(specifier, context);
} });

const databaseUrl = process.env.CHAT_TEST_DATABASE_URL;
test("push subscriptions, transactional outbox, delivery and unread in PostgreSQL", {
  skip: !databaseUrl && "Set CHAT_TEST_DATABASE_URL to a local test database."
}, async t => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(databaseUrl!).hostname), "Only local PostgreSQL is allowed");
  const schema = `push_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  const env = { DATABASE_URL: process.env.DATABASE_URL, VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY, VAPID_SUBJECT: process.env.VAPID_SUBJECT };
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    for (const filename of ["0011_colossal_wallflower.sql"]) await client.query(await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8"));
    await client.query(`CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid NOT NULL, name text, owner_name text, photo_type text, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
      CREATE TABLE walks (id uuid PRIMARY KEY, pet_id uuid REFERENCES pets(id));`);
    for (const filename of ["0045_dialogs.sql", "0046_dialog_pet_selection.sql", "0047_chat_push.sql"]) await client.query(await readFile(new URL(`../drizzle/${filename}`, import.meta.url), "utf8"));
    const isolated = new URL(databaseUrl!); isolated.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolated.href;
    process.env.VAPID_PUBLIC_KEY = "test-public"; process.env.VAPID_PRIVATE_KEY = "test-private"; process.env.VAPID_SUBJECT = "mailto:test@example.com";
    const { createClientSession, sessionCookie } = await import("./session");
    const api = await import("../app/api/push/route");
    const chat = await import("../server/infrastructure/chat-repository");
    const { deliverPushBatch } = await import("../server/push-worker.mjs");
    const sessions = await Promise.all([0, 1, 2].map(() => createClientSession({ clientId: randomUUID() })));
    const origin = "http://localhost:3000";
    const request = (who: number, body?: object, otherOrigin = origin) => new Request(origin + "/api/push", {
      method: body ? "POST" : "GET", headers: { origin: otherOrigin, "content-type": "application/json",
        cookie: who < 0 ? "" : sessionCookie(new Request(origin), sessions[who]).split(";")[0] },
      ...(body && { body: JSON.stringify(body) })
    });
    const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
    const subscription = (device: string) => ({ endpoint: `https://fcm.googleapis.com/fcm/send/${device}`,
      keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } });
    const subscribe = (who: number, device: string) => api.POST(request(who, { action: "subscribe", subscription: subscription(device) }));
    async function reset() { await client.query("DELETE FROM dialogs; DELETE FROM push_subscriptions"); }
    async function open() { return (await chat.openDialog(sessions[0].clientId, { peerClientId: sessions[1].clientId })).dialog.id; }

    await t.test("authenticated same-origin, idempotent browser subscriptions cannot be read, overwritten or disabled by others", async () => {
      await reset();
      assert.equal((await api.GET(request(-1))).status, 401);
      assert.equal((await api.POST(request(-1, { action: "subscribe", subscription: subscription("a") }))).status, 401);
      assert.equal((await api.POST(request(0, { action: "subscribe", subscription: subscription("a") }, "https://evil.test"))).status, 403);
      assert.equal((await subscribe(0, "a")).status, 200);
      const before = (await client.query("SELECT * FROM push_subscriptions")).rows[0];
      assert.equal((await subscribe(0, "a")).status, 200);
      assert.equal((await client.query("SELECT * FROM push_subscriptions")).rows.length, 1);
      assert.equal((await client.query("SELECT version FROM push_subscriptions")).rows[0].version, before.version);
      assert.equal((await subscribe(1, "a")).status, 409);
      const endpoint = subscription("a").endpoint;
      assert.deepEqual(await (await api.POST(request(1, { action: "status", endpoint }))).json(), { enabled: false });
      await api.POST(request(1, { action: "disable", endpoint }));
      assert.equal((await client.query("SELECT active FROM push_subscriptions")).rows[0].active, true);
      await subscribe(0, "b");
      await api.POST(request(0, { action: "disable", endpoint }));
      assert.equal((await client.query("SELECT count(*) FROM push_subscriptions WHERE active")).rows[0].count, "1");
      await subscribe(0, "a");
      assert.notEqual((await client.query("SELECT version FROM push_subscriptions WHERE endpoint=$1", [endpoint])).rows[0].version, before.version);
      for (const invalid of ["http://127.0.0.1", "https://fcm.googleapis.com.evil.test/path"]) assert.equal((await api.POST(request(0, { action: "subscribe", subscription: { ...subscription("a"), endpoint: invalid } }))).status, 400);
      assert.equal((await api.POST(request(0, { action: "subscribe", subscription: { ...subscription("a"), keys: { auth: "bad", p256dh: "bad" } } }))).status, 400);
    });

    await t.test("new message and recipient-only jobs commit together; duplicate requests do not enqueue twice", async () => {
      await reset();
      await subscribe(1, "a"); await subscribe(1, "b"); await subscribe(0, "sender"); await subscribe(2, "stranger");
      const id = await open(), key = randomUUID();
      const results = await Promise.all([chat.sendMessage(sessions[0].clientId, id, key, "Привет"), chat.sendMessage(sessions[0].clientId, id, key, "Привет")]);
      assert.equal(results.filter(row => row.duplicate).length, 1);
      assert.equal((await client.query("SELECT * FROM chat_push_outbox")).rows.length, 2);
      await client.query(`CREATE FUNCTION fail_outbox() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'outbox unavailable'; END $$;
        CREATE TRIGGER fail_outbox BEFORE INSERT ON chat_push_outbox FOR EACH ROW EXECUTE FUNCTION fail_outbox()`);
      await assert.rejects(chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Не сохранится"));
      assert.equal((await client.query("SELECT count(*) FROM dialog_messages")).rows[0].count, "1");
      assert.equal((await client.query("SELECT last_seq FROM dialogs WHERE id=$1", [id])).rows[0].last_seq, "1");
      await client.query("DROP TRIGGER fail_outbox ON chat_push_outbox; DROP FUNCTION fail_outbox()");
    });

    await t.test("one device failure does not resend successful deliveries, retries survive restart and 410 deactivates only the failed device", async () => {
      await reset(); await subscribe(1, "a"); await subscribe(1, "b");
      const id = await open(); await chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Секретный текст");
      const config = { publicKey: "test", privateKey: "test", subject: "mailto:test@example.com" };
      const deliveries: string[] = [];
      await deliverPushBatch(client, config, async (sub: { endpoint: string }, payload: string, options: { TTL: number }) => {
        deliveries.push(sub.endpoint); assert.ok(!payload.includes("Секретный текст")); assert.ok(options.TTL <= 259200);
        if (sub.endpoint.endsWith("/b")) throw Object.assign(new Error("temporary"), { statusCode: 503 });
      });
      assert.equal((await client.query("SELECT count(*) FROM dialog_messages")).rows[0].count, "1");
      const pending = (await client.query("SELECT * FROM chat_push_outbox WHERE done_at IS NULL")).rows[0];
      assert.equal(pending.attempts, 1); assert.ok(new Date(pending.available_at) > new Date());
      await client.query("UPDATE chat_push_outbox SET available_at=now()-interval '1 second' WHERE done_at IS NULL");
      await deliverPushBatch(client, config, async (sub: { endpoint: string }) => { deliveries.push(sub.endpoint); throw Object.assign(new Error("gone"), { statusCode: 410 }); });
      assert.equal(deliveries.filter(endpoint => endpoint.endsWith("/a")).length, 1);
      assert.equal((await client.query("SELECT active FROM push_subscriptions WHERE endpoint=$1", [subscription("b").endpoint])).rows[0].active, false);
      assert.equal((await client.query("SELECT count(*) FROM chat_push_outbox WHERE done_at IS NULL")).rows[0].count, "0");
    });

    await t.test("atomic claim excludes competing workers and recovers abandoned leases", async () => {
      await reset(); await subscribe(1, "a");
      const id = await open(); await chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Привет");
      const second = new Client({ connectionString: isolated.href }); await second.connect();
      const config = { publicKey: "test", privateKey: "test", subject: "mailto:test@example.com" };
      let sent = 0;
      try {
        await Promise.all([deliverPushBatch(client, config, async () => { sent++; }), deliverPushBatch(second, config, async () => { sent++; })]);
        assert.equal(sent, 1);
        await chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Следующее");
        await client.query("UPDATE chat_push_outbox SET attempts=1, lease=gen_random_uuid(), locked_until=now()-interval '1 second' WHERE done_at IS NULL");
        await deliverPushBatch(second, config, async () => { sent++; });
        assert.equal(sent, 2);
      } finally { await second.end(); }
    });

    await t.test("read, hidden, expired, disabled, rotated-session and exhausted jobs are cancelled before delivery", async () => {
      const config = { publicKey: "test", privateKey: "test", subject: "mailto:test@example.com" };
      for (const cause of ["read", "hide", "expire", "disable", "session", "exhausted"]) {
        await reset(); await subscribe(1, "a");
        const id = await open(); await chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Привет");
        if (cause === "read") await chat.updateDialog(sessions[1].clientId, id, "read", [1]);
        if (cause === "hide") await chat.updateDialog(sessions[1].clientId, id, "hide", []);
        if (cause === "expire") await client.query("UPDATE dialogs SET expires_at=now()-interval '1 second'");
        if (cause === "disable") await api.POST(request(1, { action: "disable", endpoint: subscription("a").endpoint }));
        if (cause === "session") await client.query("UPDATE push_subscriptions SET session_hash=repeat('0',64)");
        if (cause === "exhausted") await client.query("UPDATE chat_push_outbox SET attempts=5, locked_until=now()-interval '1 second'");
        let sent = 0; await deliverPushBatch(client, config, async () => { sent++; });
        assert.equal(sent, 0, cause);
        assert.equal((await client.query("SELECT count(*) FROM chat_push_outbox WHERE done_at IS NULL")).rows[0].count, "0", cause);
      }
    });

    await t.test("unread ignores outgoing, read, hidden and expired messages, includes older pages and dialogs", async () => {
      await reset(); const id = await open();
      for (let index = 0; index < 55; index++) await chat.sendMessage(sessions[1].clientId, id, randomUUID(), `Входящее ${index}`);
      await chat.sendMessage(sessions[0].clientId, id, randomUUID(), "Исходящее последнее");
      assert.equal((await chat.listDialogs(sessions[0].clientId)).dialogs[0].unreadCount, 55);
      assert.deepEqual(await chat.unreadStatus(sessions[0].clientId), { unreadCount: 55 });
      await chat.dialogHistory(sessions[0].clientId, id, { pending: [] });
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 55);
      await chat.updateDialog(sessions[0].clientId, id, "read", [55]);
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 54);
      await chat.updateDialog(sessions[0].clientId, id, "hide", []);
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 0);
      await chat.sendMessage(sessions[1].clientId, id, randomUUID(), "Новое после скрытия");
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 1);
      await client.query("UPDATE dialogs SET expires_at=now()-interval '1 second'");
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 0);
      for (let index = 0; index < 51; index++) {
        const peer = randomUUID(), [low, high] = [sessions[0].clientId, peer].sort();
        const row = (await client.query("INSERT INTO dialogs (client_low,client_high,expires_at,last_seq) VALUES ($1,$2,now()+interval '1 hour',1) RETURNING id", [low, high])).rows[0];
        await client.query("INSERT INTO dialog_messages (dialog_id,seq,sender_client_id,request_id,text,created_at) VALUES ($1,1,$2,$3,'Привет',now())", [row.id, peer, randomUUID()]);
      }
      const page = await chat.listDialogs(sessions[0].clientId);
      assert.equal(page.dialogs.length, 50); assert.ok(page.nextCursor);
      assert.equal((await chat.unreadStatus(sessions[0].clientId)).unreadCount, 51);
      const [at, cursorId] = page.nextCursor!.split("|");
      const next = await chat.listDialogs(sessions[0].clientId, { at, id: cursorId });
      assert.equal(next.dialogs.length, 1); assert.equal(next.dialogs[0].unreadCount, 1);
    });
  } finally {
    for (const [key, value] of Object.entries(env)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await client.end();
  }
});
