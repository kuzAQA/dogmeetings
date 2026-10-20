import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
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
const pause = (ms = 20) => new Promise(resolve => setTimeout(resolve, ms));
async function until(check: () => boolean | Promise<boolean>, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (!await check()) {
    if (Date.now() > deadline) throw new Error("Timed out waiting for SSE state");
    await pause();
  }
}
function consume(response: Response) {
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /text\/event-stream/);
  assert.match(response.headers.get("cache-control") ?? "", /no-store.*private/);
  const reader = response.body!.getReader();
  const events: Array<{ event: string; data: Record<string, unknown> }> = [];
  let ended = false;
  const finished = (async () => {
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const result = await reader.read();
        if (result.done) break;
        buffer += decoder.decode(result.value, { stream: true });
        let end;
        while ((end = buffer.indexOf("\n\n")) >= 0) {
          const frame = buffer.slice(0, end); buffer = buffer.slice(end + 2);
          const event = frame.match(/^event: (.+)$/m)?.[1];
          const data = frame.match(/^data: (.+)$/m)?.[1];
          if (event && data) events.push({ event, data: JSON.parse(data) });
        }
      }
    } finally { ended = true; }
  })();
  void finished.catch(() => {});
  return { events, reader, finished, ended: () => ended,
    count: () => events.filter(e => e.event === "unread").at(-1)?.data.unreadCount,
    messages: () => events.filter(e => e.event === "message") };
}

test("SSE uses isolated PostgreSQL, transactional NOTIFY and a real vinext Node stream", {
  skip: !databaseUrl && "Set CHAT_TEST_DATABASE_URL to a local test database.", timeout: 120000
}, async t => {
  const url = new URL(databaseUrl!);
  assert.ok(["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname), "Only a local test database is allowed");
  const schema = `sse_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  const previousUrl = process.env.DATABASE_URL;
  const streams: ReturnType<typeof consume>[] = [];
  await client.connect();
  const connectDescriptor = Object.getOwnPropertyDescriptor(Client.prototype, "connect")!;
  const queryDescriptor = Object.getOwnPropertyDescriptor(Client.prototype, "query")!;
  let connections = 0;
  let queries = 0;
  Object.defineProperty(Client.prototype, "connect", { ...connectDescriptor, value: function (...args: unknown[]) {
    connections++; return Reflect.apply(connectDescriptor.value, this, args);
  } });
  Object.defineProperty(Client.prototype, "query", { ...queryDescriptor, value: function (...args: unknown[]) {
    queries++; return Reflect.apply(queryDescriptor.value, this, args);
  } });
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(await readFile(new URL("../drizzle/0011_colossal_wallflower.sql", import.meta.url), "utf8"));
    await client.query(`CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid NOT NULL,
      name text, owner_name text, photo_type text, updated_at timestamptz DEFAULT now(), created_at timestamptz DEFAULT now());
      CREATE TABLE walks (id uuid PRIMARY KEY, pet_id uuid REFERENCES pets(id));`);
    await client.query(await readFile(new URL("../drizzle/0045_dialogs.sql", import.meta.url), "utf8"));
    await client.query(await readFile(new URL("../drizzle/0046_dialog_pet_selection.sql", import.meta.url), "utf8"));
    url.searchParams.set("options", `-c search_path=${schema}`);
    await client.query("ALTER TABLE client_sessions ADD COLUMN has_added_pet boolean DEFAULT false");
    process.env.DATABASE_URL = url.href;
    const { createClientSession, sessionCookie } = await import("./session");
    const repo = await import("../server/infrastructure/chat-repository");
    const { ChatEvents } = await import("../server/infrastructure/chat-events");
    const hub = new ChatEvents(() => new Client({ connectionString: url.href, application_name: schema }), repo.unreadSnapshot);
    const globals = globalThis as typeof globalThis & { __dogmeetChatEvents?: InstanceType<typeof ChatEvents> };
    globals.__dogmeetChatEvents = hub;
    const events = await import("../app/api/dialogs/events/route");
    const collection = await import("../app/api/dialogs/route");
    const sessions = await Promise.all([0, 1, 2].map(() => createClientSession({ clientId: randomUUID() })));
    const origin = "http://localhost:3000";
    const cookie = (who: number) => sessionCookie(new Request(origin), sessions[who]).split(";")[0];
    const request = (who: number, path: string, signal?: AbortSignal) => new Request(origin + path, {
      headers: { cookie: who < 0 ? "" : cookie(who) }, signal
    });
    const id = (await repo.openDialog(sessions[0].clientId, { peerClientId: sessions[1].clientId })).dialog.id;
    const open = async (who: number, signal?: AbortSignal) => {
      const stream = consume(await events.GET(request(who, "/api/dialogs/events", signal)));
      streams.push(stream); await until(() => stream.count() !== undefined); return stream;
    };
    let a!: ReturnType<typeof consume>;
    let aTab!: ReturnType<typeof consume>;
    let b!: ReturnType<typeof consume>;
    let c!: ReturnType<typeof consume>;
    let seq = 0;
    await t.test("auth, measured legacy connections and one listener for several users/tabs", async () => {
      assert.equal((await events.GET(request(-1, "/api/dialogs/events"))).status, 401);
      const before = { connections, queries };
      for (let i = 0; i < 5; i++) await collection.GET(request(0, "/api/dialogs?unread=1"));
      assert.equal(connections - before.connections, 10);
      assert.equal(queries - before.queries, 10);
      console.log("Legacy: 5 unread requests = 10 connections, 10 SQL queries");
      [a, aTab, b, c] = await Promise.all([open(0), open(0), open(1), open(2)]);
      const listeners = await client.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1", [schema]);
      assert.equal(listeners.rowCount, 1);
      assert.equal(a.count(), 0); assert.equal(c.count(), 0);
    });
    await t.test("commit delivers to A's tabs; sender and unrelated C receive no dialog information; retry and rollback are quiet", async () => {
      const requestId = randomUUID();
      const sent = await repo.sendMessage(sessions[1].clientId, id, requestId, "Привет");
      seq = sent.message.seq;
      await until(() => a.count() === 1 && aTab.count() === 1);
      assert.deepEqual(a.messages()[0].data, { dialogId: id, messageSeq: seq });
      assert.equal(b.events.length, 1); assert.equal(c.events.length, 1);
      const size = a.events.length;
      await repo.sendMessage(sessions[1].clientId, id, requestId, "Привет");
      await client.query(`CREATE FUNCTION reject_message() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'test rollback'; END $$;
        CREATE CONSTRAINT TRIGGER reject_message AFTER INSERT ON dialog_messages DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION reject_message()`);
      await assert.rejects(repo.sendMessage(sessions[1].clientId, id, randomUUID(), "rollback"));
      await pause(100);
      assert.equal(a.events.length, size);
      await client.query("DROP TRIGGER reject_message ON dialog_messages; DROP FUNCTION reject_message()");
    });
    await t.test("read, hide and nearest retention deadline update both tabs without another message", async () => {
      await repo.updateDialog(sessions[0].clientId, id, "read", [seq]);
      await until(() => a.count() === 0 && aTab.count() === 0);
      await repo.sendMessage(sessions[1].clientId, id, randomUUID(), "Второе");
      await until(() => a.count() === 1);
      await repo.updateDialog(sessions[0].clientId, id, "hide", []);
      await until(() => a.count() === 0 && aTab.count() === 0);
      await client.query("UPDATE dialogs SET expires_at=clock_timestamp()+interval '400 milliseconds' WHERE id=$1", [id]);
      await repo.sendMessage(sessions[1].clientId, id, randomUUID(), "Истечёт");
      await until(() => a.count() === 1);
      await until(() => a.count() === 0 && aTab.count() === 0);
    });
    await t.test("listener loss closes every stream; reconnection snapshots missed changes", async () => {
      const listener = (await client.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1", [schema])).rows[0].pid;
      await client.query("SELECT pg_terminate_backend($1)", [listener]);
      await until(() => [a, aTab, b, c].every(s => s.ended()));
      await client.query("UPDATE dialogs SET expires_at=clock_timestamp()+interval '1 hour' WHERE id=$1", [id]);
      await repo.sendMessage(sessions[1].clientId, id, randomUUID(), "Во время отключения");
      await pause(5100);
      a = await open(0);
      assert.equal(a.count(), 2);
      assert.equal(a.messages().length, 0);
      const abort = new AbortController();
      const tab = await open(0, abort.signal);
      abort.abort(); await until(tab.ended);
      await a.reader.cancel(); await a.finished;
      await until(async () => (await client.query("SELECT pid FROM pg_stat_activity WHERE application_name=$1", [schema])).rowCount === 0);
    });
    await t.test("real vinext Node endpoint flushes the snapshot and committed events before EOF; idle heartbeat performs no SQL", async () => {
      const existingListeners = new Set((await client.query("SELECT pid FROM pg_stat_activity WHERE application_name='dogmeet-chat-listener'")).rows.map(row => row.pid));
      const portServer = createServer();
      await new Promise<void>(resolve => portServer.listen(0, "127.0.0.1", resolve));
      const port = (portServer.address() as { port: number }).port;
      await new Promise<void>(resolve => portServer.close(() => resolve()));
      const instrumentation = `import pg from ${JSON.stringify(import.meta.resolve("pg"))};
        for (const [method, marker] of [["connect", "SSE_TEST_CONNECT"], ["query", "SSE_TEST_SQL"]]) {
          const original = pg.Client.prototype[method];
          pg.Client.prototype[method] = function(...args) { process.stdout.write(marker + "\\n"); return original.apply(this, args); };
        }`;
      const server = spawn(process.execPath, ["node_modules/vinext/dist/cli.js", "dev", "--port", String(port), "--hostname", "127.0.0.1"], {
        env: { ...process.env, VINEXT_RUNTIME: "node", VINEXT_NO_DEV_LOCK: "1", PLAYWRIGHT_TEST: "1", DATABASE_URL: url.href,
          NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=data:text/javascript,${encodeURIComponent(instrumentation)}` },
        stdio: ["ignore", "pipe", "ignore"]
      });
      let output = "";
      server.stdout.on("data", data => { output += String(data); });
      const metrics = () => ({ connections: output.match(/SSE_TEST_CONNECT/g)?.length ?? 0, queries: output.match(/SSE_TEST_SQL/g)?.length ?? 0 });
      const endpoint = `http://127.0.0.1:${port}/api/dialogs/events`;
      try {
        await until(async () => {
          try { return (await fetch(endpoint, { signal: AbortSignal.timeout(1000) })).status === 401; } catch { return false; }
        }, 45000);
        const response = await fetch(endpoint, { headers: { cookie: cookie(0) }, signal: AbortSignal.timeout(40000) });
        const stream = consume(response); streams.push(stream);
        await until(() => stream.count() === 2);
        assert.equal(stream.ended(), false);
        await repo.sendMessage(sessions[1].clientId, id, randomUUID(), "Настоящий поток");
        await until(() => stream.count() === 3 && stream.messages().length === 1);
        // pg_stat_statements is optional; inspect the listener itself and its connection lifetime.
        const listener = (await client.query("SELECT pid, query, backend_start FROM pg_stat_activity WHERE application_name='dogmeet-chat-listener'")).rows.filter(row => !existingListeners.has(row.pid));
        assert.equal(listener.length, 1);
        assert.match(listener[0].query, /LISTEN dogmeet_chat/);
        const counts = metrics();
        assert.ok(counts.queries > 0, "Instrument the actual Node server's pg client");
        await pause(26000);
        assert.equal(stream.count(), 3); assert.equal(stream.ended(), false);
        assert.deepEqual(metrics(), counts);
        const after = (await client.query("SELECT pid, query, backend_start FROM pg_stat_activity WHERE application_name='dogmeet-chat-listener'")).rows.filter(row => !existingListeners.has(row.pid));
        assert.deepEqual(after, listener);
        console.log("SSE: 4 streams / 3 users = 1 LISTEN; 26 seconds idle including heartbeat = 0 SQL, 0 new connections");
        await stream.reader.cancel();
        await until(async () => (await client.query("SELECT pid FROM pg_stat_activity WHERE pid=$1", [listener[0].pid])).rowCount === 0);
      } finally {
        server.kill("SIGTERM");
        await new Promise<void>(resolve => { if (server.exitCode !== null) resolve(); else server.once("exit", () => resolve()); });
      }
    });
  } finally {
    await Promise.allSettled(streams.map(stream => stream.reader.cancel()));
    Object.defineProperty(Client.prototype, "connect", connectDescriptor);
    Object.defineProperty(Client.prototype, "query", queryDescriptor);
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
