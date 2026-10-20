import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL) {
    for (const suffix of [".ts", "/index.ts"]) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
  }
  return nextResolve(specifier, context);
} });

const databaseUrl = process.env.CHAT_TEST_DATABASE_URL;
test("dialogs preserve privacy, receipts and the original retention deadline in PostgreSQL", {
  skip: !databaseUrl && "Set CHAT_TEST_DATABASE_URL to a local test database."
}, async t => {
  const schema = `chat_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  const previousUrl = process.env.DATABASE_URL;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(await readFile(new URL("../drizzle/0011_colossal_wallflower.sql", import.meta.url), "utf8"));
    await client.query(`CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid NOT NULL,
      name text, owner_name text, photo_type text, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
      CREATE TABLE walks (id uuid PRIMARY KEY, pet_id uuid REFERENCES pets(id));`);
    await client.query(await readFile(new URL("../drizzle/0045_dialogs.sql", import.meta.url), "utf8"));
    const legacyPair = [randomUUID(), randomUUID()].sort();
    const legacy = (await client.query("INSERT INTO dialogs (client_low,client_high) VALUES ($1,$2) RETURNING id", legacyPair)).rows[0].id;
    const selectionMigration = new URL("../drizzle/0046_dialog_pet_selection.sql", import.meta.url);
    await client.query(await readFile(selectionMigration, "utf8"));
    const migrated = (await client.query("SELECT * FROM dialogs WHERE id=$1", [legacy])).rows[0];
    assert.equal(migrated.low_pet_id, null);
    assert.equal(migrated.high_pet_id, null);
    assert.equal(migrated.client_low, legacyPair[0]);
    await client.query("DELETE FROM dialogs WHERE id=$1", [legacy]);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    await client.query("ALTER TABLE client_sessions ADD COLUMN has_added_pet boolean DEFAULT false");
    process.env.DATABASE_URL = isolatedUrl.href;
    const { createClientSession, sessionCookie } = await import("./session");
    const collection = await import("../app/api/dialogs/route");
    const item = await import("../app/api/dialogs/[id]/route");
    const messages = await import("../app/api/dialogs/[id]/messages/route");
    const sessionApi = await import("../app/api/session/route");
    const { cleanupExpiredDialogs } = await import("../scripts/cleanup-expired-walks.mjs");
    const sessions = await Promise.all([0, 1, 2].map(() => createClientSession({ clientId: randomUUID() })));
    const origin = "http://localhost:3000";
    const request = (who: number, path: string, method = "GET", body?: object) => new Request(origin + path, {
      method, headers: { cookie: who < 0 ? "" : sessionCookie(new Request(origin), sessions[who]).split(";")[0],
        origin, "content-type": "application/json" }, ...(body && { body: JSON.stringify(body) })
    });
    const walks = [randomUUID(), randomUUID()];
    for (let i = 0; i < 2; i++) {
      const petId = randomUUID();
      await client.query("INSERT INTO pets (id,client_id,name,owner_name) VALUES ($1,$2,$3,$4)", [petId, sessions[i].clientId, `Пёс ${i}`, `Хозяин ${i}`]);
      await client.query("INSERT INTO walks (id,pet_id) VALUES ($1,$2)", [walks[i], petId]);
    }
    const open = (who: number, walkId: string, petId?: string) => collection.POST(request(who, "/api/dialogs", "POST", { walkId, ...(petId ? { petId } : {}) }));
    let id = "";
    const context = () => ({ params: Promise.resolve({ id }) });
    const path = () => `/api/dialogs/${id}`;
    const send = (who: number, text: string, requestId = randomUUID()) => messages.POST(request(who, path() + "/messages", "POST",
      { text, requestId, senderClientId: sessions[2].clientId }), context());
    const history = async (who: number, query = "") => messages.GET(request(who, path() + "/messages" + query), context());
    const action = (who: number, body: object) => item.PATCH(request(who, path(), "PATCH", body), context());

    await t.test("legacy identity cannot replace another browser's session", async () => {
      assert.equal((await sessionApi.POST(request(-1, "/api/session", "POST", { legacyClientId: sessions[0].clientId }))).status, 400);
      const { getClientSession } = await import("./session");
      assert.equal((await getClientSession(request(0, "/api/session")))?.clientId, sessions[0].clientId);
    });
    await t.test("selection rejects foreign, invited, deleted and malformed pet IDs before creation", async () => {
      await client.query("CREATE TABLE pet_collaborators (pet_id uuid, client_id uuid)");
      const foreign = (await client.query("SELECT pet_id FROM walks WHERE id=$1", [walks[1]])).rows[0].pet_id;
      await client.query("INSERT INTO pet_collaborators VALUES ($1,$2)", [foreign, sessions[0].clientId]);
      const unrelated = randomUUID();
      await client.query("INSERT INTO pets (id,client_id,name,owner_name) VALUES ($1,$2,'Чужой','Другой')", [unrelated, sessions[2].clientId]);
      const deleted = randomUUID();
      await client.query("INSERT INTO pets (id,client_id,name,owner_name) VALUES ($1,$2,'Удалённый','Анна')", [deleted, sessions[0].clientId]);
      await client.query("DELETE FROM pets WHERE id=$1", [deleted]);
      for (const petId of [foreign, unrelated, deleted]) assert.equal((await open(0, walks[1], petId)).status, 404);
      assert.equal((await collection.POST(request(0, "/api/dialogs", "POST", { walkId: walks[1], petId: foreign, clientId: sessions[1].clientId }))).status, 404);
      assert.equal((await open(0, walks[1], "bad-id")).status, 400);
      assert.equal((await client.query("SELECT * FROM dialogs")).rowCount, 0);
    });

    await t.test("opposite concurrent opens share one empty dialog without starting retention", async () => {
      const responses = await Promise.all([open(0, walks[1]), open(1, walks[0])]);
      const rows = await Promise.all(responses.map(r => r.json()));
      assert.equal(responses[0].status, 200, JSON.stringify(rows));
      assert.equal(rows[0].dialog.id, rows[1].dialog.id);
      assert.equal(rows[0].dialog.peer.name, "Пёс 1 • Хозяин 1");
      assert.equal(rows[1].dialog.peer.name, "Пёс 0 • Хозяин 0");
      id = rows[0].dialog.id;
      assert.equal(rows[0].dialog.expiresAt, null);
      assert.equal((await client.query("SELECT * FROM dialogs")).rowCount, 1);
      assert.deepEqual((await (await collection.GET(request(0, "/api/dialogs"))).json()).dialogs, []);
    });
    await t.test("session, membership and origin guard every endpoint", async () => {
      assert.equal((await history(-1)).status, 401);
      assert.equal((await history(2)).status, 404);
      assert.equal((await send(2, "взлом")).status, 404);
      assert.equal((await action(2, { action: "hide" })).status, 404);
      const forged = request(0, path() + "/messages", "POST", { text: "x", requestId: randomUUID() });
      forged.headers.set("origin", "https://evil.invalid");
      assert.equal((await messages.POST(forged, context())).status, 403);
      assert.equal((await open(0, walks[0])).status, 400);
    });
    await t.test("server rejects empty and oversized text; failed sends do not start retention", async () => {
      for (const text of [" \n\t", "a".repeat(2001)]) assert.equal((await send(0, text)).status, 400);
      assert.equal((await client.query("SELECT expires_at FROM dialogs WHERE id=$1", [id])).rows[0].expires_at, null);
    });
    let deadline = "";
    await t.test("concurrent first messages set one deadline and timeout retries do not duplicate", async () => {
      const key = randomUUID();
      const responses = await Promise.all([send(0, "🐕".repeat(2000), key), send(1, "Привет"), send(0, "🐕".repeat(2000), key)]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 201, 201]);
      assert.equal((await client.query("SELECT * FROM dialog_messages")).rowCount, 2);
      assert.equal((await client.query("SELECT * FROM dialog_messages WHERE sender_client_id=$1", [sessions[2].clientId])).rowCount, 0);
      assert.equal((await send(0, "другой текст", key)).status, 409);
      const data = await (await history(0)).json();
      deadline = data.dialog.expiresAt;
      assert.ok(Math.abs(Date.parse(deadline) - Date.now() - 72 * 3600000) < 5000);
      assert.ok(data.messages.every((m: { readAt: unknown }) => m.readAt === null));
      assert.equal(data.messages.filter((m: { mine: boolean }) => m.mine).length, 1);
    });
    await t.test("both sides see their peer's pet and owner in the list and inside the dialog", async () => {
      for (const who of [0, 1]) {
        const expected = `Пёс ${1 - who} • Хозяин ${1 - who}`;
        const list = await (await collection.GET(request(who, "/api/dialogs"))).json();
        assert.equal(list.dialogs[0].peer.name, expected);
        assert.equal((await (await history(who)).json()).dialog.peer.name, expected);
      }
    });
    await t.test("explicit selection survives reopening without changing participants, hidden history or deadline", async () => {
      const chosen = [randomUUID(), randomUUID()];
      for (const who of [0, 1]) await client.query("INSERT INTO pets (id,client_id,name,owner_name,created_at) VALUES ($1,$2,$3,$4,now()+interval '1 minute')",
        [chosen[who], sessions[who].clientId, who === 0 ? "Луна" : "Рекс", who === 0 ? "Анна" : "Ольга"]);
      await action(0, { action: "hide" });
      const hidden = (await (await history(0)).json()).dialog.hiddenThrough;
      const responses = await Promise.all([open(0, walks[1], chosen[0]), open(1, walks[0], chosen[1])]);
      for (const response of responses) {
        assert.equal(response.status, 200);
        const data = await response.json();
        assert.equal(data.dialog.id, id);
        assert.equal(data.dialog.expiresAt, deadline);
      }
      assert.equal((await client.query("SELECT * FROM dialogs")).rowCount, 1);
      await client.query("UPDATE pets SET photo_type='image/jpeg' WHERE id=$1", [chosen[1]]);
      for (const who of [0, 1]) {
        await open(who, walks[1 - who]);
        const data = await (await history(who)).json();
        assert.equal(data.dialog.peer.name, who === 0 ? "Рекс • Ольга" : "Луна • Анна");
        if (who === 0) assert.ok(data.dialog.peer.photoUrl.startsWith(`/api/pet-photo?id=${chosen[1]}&v=`));
        else assert.equal(data.dialog.peer.photoUrl, "/dog-placeholder.webp");
        assert.equal(data.dialog.expiresAt, deadline);
        if (who === 0) {
          assert.equal(data.dialog.hiddenThrough, hidden);
          assert.deepEqual(data.messages, []);
        } else {
          const list = await (await collection.GET(request(who, "/api/dialogs"))).json();
          assert.equal(list.dialogs[0].peer.name, "Луна • Анна");
        }
      }
      await client.query("UPDATE dialogs SET low_hidden_through=0, high_hidden_through=0 WHERE id=$1", [id]);
    });

    await t.test("list and polling do not read; explicit receipts affect only incoming shown messages", async () => {
      await collection.GET(request(1, "/api/dialogs"));
      const data = await (await history(1)).json();
      const incoming = data.messages.find((m: { mine: boolean }) => !m.mine);
      const own = data.messages.find((m: { mine: boolean }) => m.mine);
      assert.equal(incoming.readAt, null);
      assert.equal((await action(1, { action: "read", messageSeqs: [incoming.seq, own.seq] })).status, 200);
      const read = await (await history(0, `?afterSeq=2&pendingIds=${incoming.seq},${own.seq}`)).json();
      assert.ok(read.receipts.find((m: { seq: number }) => m.seq === incoming.seq)?.readAt);
      assert.equal((await client.query("SELECT read_at FROM dialog_messages WHERE dialog_id=$1 AND seq=$2", [id, own.seq])).rows[0].read_at, null);
      assert.equal(read.dialog.expiresAt, deadline);
    });
    await t.test("hide clears only one participant; new messages do not restore hidden history or renew the deadline", async () => {
      assert.equal((await action(0, { action: "hide" })).status, 200);
      assert.equal((await (await history(0)).json()).messages.length, 0);
      assert.equal((await (await history(1)).json()).messages.length, 2);
      assert.equal((await (await collection.GET(request(0, "/api/dialogs"))).json()).dialogs.length, 0);
      await send(1, "Снова привет");
      const visible = await (await history(0)).json();
      assert.deepEqual(visible.messages.map((m: { text: string }) => m.text), ["Снова привет"]);
      assert.equal(visible.dialog.expiresAt, deadline);
      assert.equal((await (await collection.GET(request(0, "/api/dialogs"))).json()).dialogs.length, 1);
      await action(0, { action: "read", messageSeqs: [1, 2, 3] });
      const unreadHidden = await client.query("SELECT * FROM dialog_messages WHERE dialog_id=$1 AND sender_client_id=$2 AND seq<3", [id, sessions[1].clientId]);
      assert.ok(unreadHidden.rows.every(row => row.read_at === null));
    });
    await t.test("history is bounded, ordered and paginated without skipping messages", async () => {
      for (let i = 0; i < 51; i++) await send(1, `строка ${i}`);
      const latest = await (await history(1)).json();
      assert.equal(latest.messages.length, 50);
      assert.equal(latest.hasOlder, true);
      const older = await (await history(1, `?beforeSeq=${latest.messages[0].seq}`)).json();
      assert.equal(older.messages.length, 4);
      const all = [...older.messages, ...latest.messages];
      assert.equal(new Set(all.map(m => m.seq)).size, 54);
      assert.deepEqual(all.map(m => m.seq), all.map(m => m.seq).sort((a, b) => a - b));
      assert.deepEqual((await (await history(1, "?beforeSeq=0")).json()).messages, []);
    });
    await t.test("a send that crosses the deadline rolls back instead of returning an expired message", async () => {
      await client.query(`CREATE FUNCTION delay_chat_insert() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN PERFORM pg_sleep(0.5); RETURN NEW; END $$;
        CREATE TRIGGER delay_chat BEFORE INSERT ON dialog_messages FOR EACH ROW EXECUTE FUNCTION delay_chat_insert();`);
      try {
        await client.query("UPDATE dialogs SET expires_at=clock_timestamp()+interval '300 milliseconds' WHERE id=$1", [id]);
        const before = (await client.query("SELECT count(*) FROM dialog_messages WHERE dialog_id=$1", [id])).rows[0].count;
        assert.equal((await send(0, "Пересечение срока")).status, 410);
        assert.equal((await client.query("SELECT count(*) FROM dialog_messages WHERE dialog_id=$1", [id])).rows[0].count, before);
      } finally {
        await client.query("DROP TRIGGER delay_chat ON dialog_messages; DROP FUNCTION delay_chat_insert()");
        await client.query("UPDATE dialogs SET expires_at=$2 WHERE id=$1", [id, deadline]);
      }
    });
    await t.test("expired data is inaccessible before cleanup; new generation never revives old requests", async () => {
      await client.query("UPDATE dialogs SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1", [id]);
      assert.equal((await history(0)).status, 410);
      assert.equal((await send(0, "поздно")).status, 410);
      assert.equal((await action(0, { action: "read", messageSeqs: [1] })).status, 410);
      assert.equal((await (await collection.GET(request(0, "/api/dialogs"))).json()).dialogs.length, 0);
      await cleanupExpiredDialogs(client);
      assert.equal((await client.query("SELECT * FROM dialog_messages")).rowCount, 0);
      assert.equal((await send(0, "старый повтор")).status, 404);
      const next = await (await open(0, walks[1])).json();
      assert.notEqual(next.dialog.id, id);
      id = next.dialog.id;
      assert.equal(next.dialog.expiresAt, null);
      await send(0, "Новая переписка");
      assert.ok(Date.parse((await (await history(0)).json()).dialog.expiresAt) >= Date.parse(deadline));
    });
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
