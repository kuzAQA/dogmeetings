import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

// Resolve the project's extensionless TypeScript imports for the native Node test runner.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith(".") && context.parentURL) {
      for (const suffix of [".ts", "/index.ts"]) {
        const url = new URL(specifier + suffix, context.parentURL);
        if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
      }
    }
    return nextResolve(specifier, context);
  }
});

const databaseUrl = process.env.ADMIN_TELEGRAM_TEST_DATABASE_URL;

test("admin Telegram count uses real subscription state in an isolated PostgreSQL schema", {
  skip: !databaseUrl && "Set ADMIN_TELEGRAM_TEST_DATABASE_URL to a local test database."
}, async (t) => {
  const schema = `admin_telegram_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const previousEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    NODE_ENV: process.env.NODE_ENV
  };
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query("CREATE TABLE walks (id uuid PRIMARY KEY)");
    for (const migration of ["0011_colossal_wallflower.sql", "0018_admin_sessions.sql", "0019_telegram_complex_subscriptions.sql"]) {
      await client.query(await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
    }
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.ADMIN_SESSION_SECRET = "admin-telegram-test-secret-only-0000000000";
    Object.assign(process.env, { NODE_ENV: "development" });
    const fetchMock = t.mock.method(globalThis, "fetch", () => { throw new Error("Tests must not send Telegram notifications."); });

    const { GET } = await import("../app/api/dogsfather/telegram-subscriptions/route");
    const { createAdminSessionCookie, revokeAdminSession } = await import("./admin-auth");
    const { createClientSession, getClientSession, sessionCookie } = await import("./session");
    const { activateTelegramComplexSubscription, deactivateTelegramComplexSubscription } = await import("./telegram-subscriptions");
    const url = "http://localhost:3000/api/dogsfather/telegram-subscriptions";
    const cookie = (await createAdminSessionCookie(new Request(url))).split(";")[0];
    const adminRequest = () => new Request(url, { headers: { cookie } });
    const count = async () => {
      const response = await GET(adminRequest());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store, private");
      return (await response.json()).activeSubscriptions;
    };

    await t.test("anonymous and authenticated ordinary users cannot access the count", async () => {
      assert.equal((await GET(new Request(url))).status, 401);
      const session = await createClientSession({ clientId: randomUUID() });
      const userRequest = new Request(url, { headers: { cookie: sessionCookie(new Request(url), session).split(";")[0] } });
      assert.ok(await getClientSession(userRequest));
      const response = await GET(userRequest);
      assert.equal(response.status, 401);
      assert.equal((await response.json()).activeSubscriptions, undefined);
    });
    await t.test("no subscriptions returns zero", async () => {
      assert.equal(await count(), 0);
    });

    const firstId = randomUUID();
    const disabledId = randomUUID();
    await client.query(`INSERT INTO telegram_complex_subscriptions
      (id, telegram_chat_id, city, district, residential_complex, active, deactivated_at)
      VALUES ($1, '123', 'Москва', 'Район', 'Первый ЖК', true, null),
             ($2, '123', 'Москва', 'Район', 'Второй ЖК', true, now()),
             ($3, '456', 'Москва', 'Район', 'Третий ЖК', false, now())`, [firstId, randomUUID(), disabledId]);
    const walkId = randomUUID();
    await client.query("INSERT INTO walks (id) VALUES ($1)", [walkId]);
    await client.query(`INSERT INTO telegram_walk_notifications (id, walk_id, subscription_id)
      VALUES ($1, $3, $4), ($2, $3, $5)`, [randomUUID(), randomUUID(), walkId, firstId, disabledId]);
    await client.query("INSERT INTO walks (id) VALUES ($1)", [randomUUID()]);
    await client.query(`INSERT INTO telegram_walk_notifications (id, walk_id, subscription_id)
      SELECT $1, id, $2 FROM walks WHERE id <> $3`, [randomUUID(), firstId, walkId]);
    const token = "a".repeat(32);
    await client.query(`INSERT INTO telegram_subscription_intents
      (token_hash, city, district, residential_complex, expires_at)
      VALUES ($1, 'Москва', 'Район', 'Третий ЖК', now() + interval '15 minutes')`, [createHash("sha256").update(token).digest("hex")]);

    await t.test("counts active subscription rows, including multiple complexes per chat, without joins", async () => {
      assert.equal(await count(), 2);
    });
    await t.test("real activation and repeated activation update the count without duplicates", async () => {
      assert.equal((await activateTelegramComplexSubscription(token, "456")).status, "subscribed");
      assert.equal(await count(), 3);
      assert.equal((await activateTelegramComplexSubscription(token, "456")).status, "active");
      assert.equal(await count(), 3);
    });
    await t.test("real deactivation and repeated deactivation update the count", async () => {
      assert.equal((await deactivateTelegramComplexSubscription(firstId, "123")).status, "unsubscribed");
      assert.equal(await count(), 2);
      assert.equal((await deactivateTelegramComplexSubscription(firstId, "123")).status, "inactive");
      assert.equal(await count(), 2);
      await client.query("UPDATE telegram_complex_subscriptions SET active = false");
      assert.equal(await count(), 0);
    });
    await t.test("database failure returns an error without a zero count", async () => {
      await client.query("ALTER TABLE telegram_complex_subscriptions RENAME TO unavailable_subscriptions");
      const response = await GET(adminRequest());
      assert.equal(response.status, 500);
      assert.deepEqual(await response.json(), { error: "Не удалось загрузить подписки Telegram." });
    });
    await t.test("a revoked administrator session cannot access the count", async () => {
      await revokeAdminSession(adminRequest());
      assert.equal((await GET(adminRequest())).status, 401);
    });
    assert.equal(fetchMock.mock.calls.length, 0);
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
