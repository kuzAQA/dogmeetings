import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

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

const databaseUrl = process.env.ADMIN_LOCATIONS_TEST_DATABASE_URL;

test("admin places persist changes and protect linked walks in an isolated PostgreSQL schema", {
  skip: !databaseUrl && "Set ADMIN_LOCATIONS_TEST_DATABASE_URL to a local test database."
}, async (t) => {
  const schema = `admin_locations_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const previousEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    ADMIN_SESSION_SECRET: process.env.ADMIN_SESSION_SECRET,
    ADMIN_USERNAME_HASH: process.env.ADMIN_USERNAME_HASH,
    ADMIN_PASSWORD_HASH: process.env.ADMIN_PASSWORD_HASH,
    NODE_ENV: process.env.NODE_ENV
  };
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE locations (city text, district text, residential_complex text);
      CREATE TABLE places (
        id uuid PRIMARY KEY, city text, district text, residential_complex text,
        name varchar(100), normalized_name varchar(100),
        UNIQUE (city, district, residential_complex, normalized_name)
      );
      CREATE TABLE walks (
        id uuid PRIMARY KEY, place_id uuid REFERENCES places(id) ON DELETE RESTRICT,
        place varchar(100), updated_at timestamptz DEFAULT now()
      );
    `);
    for (const migration of ["0011_colossal_wallflower.sql", "0018_admin_sessions.sql"]) {
      await client.query(await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8"));
    }
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    process.env.ADMIN_SESSION_SECRET = "admin-locations-test-secret-only-0000000000";
    process.env.ADMIN_USERNAME_HASH = createHash("sha256").update("test-admin").digest("base64url");
    const verifier = randomBytes(32);
    process.env.ADMIN_PASSWORD_HASH = `pbkdf2_sha256:600000:c2FsdA:${verifier.toString("base64url")}`;
    Object.assign(process.env, { NODE_ENV: "development" });

    const { GET, PATCH, DELETE } = await import("../app/api/dogsfather/locations/route");
    const { createAdminLoginChallenge, createAdminSessionCookie, revokeAdminSession } = await import("./admin-auth");
    const { createClientSession, sessionCookie } = await import("./session");
    const url = "http://localhost:3000/api/dogsfather/locations";
    const cookie = (await createAdminSessionCookie(new Request(url))).split(";")[0];
    const location = { city: "Москва", district: "Коммунарка", complex: "Скандинавия" };
    const id = randomUUID();
    const otherId = randomUUID();
    const walkId = randomUUID();
    const target = { level: "place", ...location, id };
    const request = (method = "GET", payload?: Record<string, unknown>, cookies = cookie, origin = "http://localhost:3000") => new Request(url, {
      method,
      headers: { cookie: cookies, origin, "content-type": "application/json" },
      ...(payload && { body: JSON.stringify(payload) })
    });
    const remove = async (payload: Record<string, unknown> = target) => {
      const challenge = await createAdminLoginChallenge(request());
      const proof = createHmac("sha256", verifier).update(`dogmeet-login:v1:${challenge.challenge}`).digest("base64url");
      return DELETE(request("DELETE", { ...payload, proof }, `${cookie}; ${challenge.cookie.split(";")[0]}`));
    };
    const listing = async () => {
      const response = await GET(request());
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store, private");
      return response.json();
    };
    await client.query("INSERT INTO locations VALUES ($1, $2, $3), ($1, $2, 'Москвичка')", Object.values(location));
    await client.query(`INSERT INTO places VALUES
      ($1, $3, $4, $5, 'У парка', 'у парка'),
      ($2, $3, $4, 'Москвичка', 'У парка', 'у парка')`, [id, otherId, ...Object.values(location)]);
    await client.query("INSERT INTO walks (id, place_id, place) VALUES ($1, $2, 'У парка')", [walkId, id]);

    await t.test("anonymous and ordinary users cannot read, rename or delete places", async () => {
      const user = await createClientSession({ clientId: randomUUID() });
      for (const userCookie of ["", sessionCookie(new Request(url), user).split(";")[0]]) {
        assert.equal((await GET(request("GET", undefined, userCookie))).status, 401);
        assert.equal((await PATCH(request("PATCH", { ...target, name: "У озера" }, userCookie))).status, 401);
        assert.equal((await DELETE(request("DELETE", { ...target, proof: "a".repeat(43) }, userCookie))).status, 401);
      }
      assert.equal((await PATCH(request("PATCH", { ...target, name: "У озера" }, cookie, "https://evil.example"))).status, 401);
      assert.equal((await DELETE(request("DELETE", { ...target, proof: "a".repeat(43) }, cookie, "https://evil.example"))).status, 401);
    });
    await t.test("listing includes each place's actual parent complex", async () => {
      const data = await listing();
      assert.equal(data.locations.length, 2);
      assert.deepEqual(data.places.find((place: { id: string }) => place.id === id), { id, name: "У парка", ...location });
      assert.equal(data.places.find((place: { id: string }) => place.id === otherId).complex, "Москвичка");
    });
    await t.test("renaming normalizes names and persists them in both places and linked walks", async () => {
      assert.equal((await PATCH(request("PATCH", { ...target, name: "  у   озера  " }))).status, 200);
      assert.equal((await listing()).places.find((place: { id: string }) => place.id === id).name, "У озера");
      const { rows } = await client.query("SELECT p.normalized_name, w.place FROM places p JOIN walks w ON w.place_id = p.id WHERE p.id = $1", [id]);
      assert.deepEqual(rows, [{ normalized_name: "у озера", place: "У озера" }]);
    });
    await t.test("duplicate names roll back the rename without changing walks", async () => {
      await client.query("INSERT INTO places VALUES ($1, $2, $3, $4, 'У леса', 'у леса')", [randomUUID(), ...Object.values(location)]);
      assert.equal((await PATCH(request("PATCH", { ...target, name: "У ЛЕСА" }))).status, 409);
      assert.equal((await listing()).places.find((place: { id: string }) => place.id === id).name, "У озера");
      assert.equal((await client.query("SELECT place FROM walks WHERE id = $1", [walkId])).rows[0].place, "У озера");
    });
    await t.test("invalid names, IDs and mismatched parents cannot change records", async () => {
      for (const name of ["", "123", "я".repeat(41), `ß${"x".repeat(39)}`]) {
        assert.equal((await PATCH(request("PATCH", { ...target, name }))).status, 400);
      }
      assert.equal((await PATCH(request("PATCH", { ...target, id: "invalid", name: "У ворот" }))).status, 400);
      assert.equal((await PATCH(request("PATCH", { ...target, id: randomUUID(), name: "У ворот" }))).status, 404);
      assert.equal((await PATCH(request("PATCH", { ...target, complex: "Москвичка", name: "У ворот" }))).status, 404);
    });
    await t.test("deletion requires a password proof and refuses linked places without deleting walks", async () => {
      assert.equal((await DELETE(request("DELETE", target))).status, 400);
      assert.equal((await DELETE(request("DELETE", { ...target, proof: "a".repeat(43) }))).status, 403);
      const response = await remove();
      assert.equal(response.status, 409);
      assert.match((await response.json()).error, /используется в прогулках/);
      assert.equal((await client.query("SELECT place FROM walks WHERE id = $1", [walkId])).rows[0].place, "У озера");
      assert.ok((await listing()).places.some((place: { id: string }) => place.id === id));
    });
    await t.test("deleting an unused place persists without changing other places or parent locations", async () => {
      const unusedTarget = { ...target, id: otherId, complex: "Москвичка" };
      assert.equal((await remove(unusedTarget)).status, 200);
      const data = await listing();
      assert.equal(data.places.some((place: { id: string }) => place.id === otherId), false);
      assert.ok(data.places.some((place: { id: string }) => place.id === id));
      assert.equal(data.locations.length, 2);
      assert.equal((await remove(unusedTarget)).status, 404);
    });
    await t.test("revoked administrator sessions cannot mutate places", async () => {
      await revokeAdminSession(request());
      assert.equal((await PATCH(request("PATCH", { ...target, name: "У ворот" }))).status, 401);
      assert.equal((await DELETE(request("DELETE", { ...target, proof: "a".repeat(43) }))).status, 401);
    });
  } finally {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
    for (const [name, value] of Object.entries(previousEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
