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

const databaseUrl = process.env.MY_PLACES_TEST_DATABASE_URL;
test("my places: ownership, profile filters, creation and linked walks", {
  skip: !databaseUrl && "Set MY_PLACES_TEST_DATABASE_URL to a local test database."
}, async (t) => {
  const schema = `my_places_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl });
  const previousUrl = process.env.DATABASE_URL;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`CREATE TABLE places (
      id uuid PRIMARY KEY, city varchar(80), district varchar(80), residential_complex varchar(120),
      name varchar(100), normalized_name varchar(100), created_at timestamptz DEFAULT now(),
      UNIQUE (city, district, residential_complex, normalized_name));
      CREATE TABLE walks (id uuid PRIMARY KEY, place_id uuid REFERENCES places(id) ON DELETE RESTRICT,
        place varchar(100), updated_at timestamptz DEFAULT now());`);
    await client.query(await readFile(new URL("../drizzle/0011_colossal_wallflower.sql", import.meta.url), "utf8"));
    await client.query(await readFile(new URL("../drizzle/0026_place_creators.sql", import.meta.url), "utf8"));
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    await client.query("ALTER TABLE client_sessions ADD COLUMN has_added_pet boolean DEFAULT false");
    process.env.DATABASE_URL = isolatedUrl.href;
    const { GET, PATCH, DELETE } = await import("../app/api/places/route");
    const { createClientSession, sessionCookie } = await import("./session");
    const { withDb } = await import("../db/index");
    const { findOrCreateSharedPlace } = await import("../server/infrastructure/walk-repository");
    const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
    const owner = randomUUID(), stranger = randomUUID();
    const session = await createClientSession({ clientId: owner, location, hasLocation: true });
    const other = await createClientSession({ clientId: stranger, location, hasLocation: true });
    const url = "http://localhost:3000/api/places";
    const cookie = sessionCookie(new Request(url), session).split(";")[0];
    const otherCookie = sessionCookie(new Request(url), other).split(";")[0];
    const request = (method = "GET", payload?: object, cookies = cookie, query = "?scope=mine") => new Request(url + query, {
      method, headers: { cookie: cookies, origin: "http://localhost:3000", "content-type": "application/json" },
      ...(payload && { body: JSON.stringify(payload) })
    });
    const create = (name: string, clientId = owner) => withDb(db => db.transaction(tx => findOrCreateSharedPlace(tx,
      { city: location.city, district: location.district, residentialComplex: location.complex }, name, name.toLocaleLowerCase("ru-RU"), clientId)));
    const place = await create("У парка");
    await t.test("creation records the server client; reuse never transfers ownership", async () => {
      assert.equal((await create("У парка", stranger)).id, place.id);
      assert.equal((await client.query("SELECT created_by FROM places WHERE id = $1", [place.id])).rows[0].created_by, owner);
      await client.query("INSERT INTO places (id, city, district, residential_complex, name, normalized_name) VALUES ($1, $2, $3, $4, 'старое место', 'старое место')", [randomUUID(), ...Object.values(location)]);
      await create("Старое место");
      assert.equal((await client.query("SELECT created_by FROM places WHERE name = 'старое место'")).rows[0].created_by, null);
      assert.equal((await client.query("SELECT name FROM places WHERE normalized_name = 'старое место'")).rows[0].name, "старое место");
    });
    await t.test("anonymous, cross origin and foreign mutations are denied", async () => {
      assert.equal((await GET(request("GET", undefined, ""))).status, 401);
      for (const handler of [PATCH, DELETE]) {
        assert.equal((await handler(request(handler === PATCH ? "PATCH" : "DELETE", { id: place.id, name: "Чужое" }, otherCookie))).status, 404);
      }
      assert.equal((await PATCH(new Request(url, { method: "PATCH", headers: { cookie, origin: "https://example.org" }, body: JSON.stringify({ id: place.id, name: "Чужое" }) }))).status, 403);
    });
    await t.test("mine uses profile geography and excludes foreign and legacy places", async () => {
      await create("Чужой парк", stranger);
      await client.query("INSERT INTO places (id, city, district, residential_complex, name, normalized_name, created_by) VALUES ($1, 'Москва', 'Другой район', 'Другой ЖК', 'Далеко', 'далеко', $2), ($3, 'Казань', 'Район', 'ЖК', 'Казань', 'казань', $2)", [randomUUID(), owner, randomUUID()]);
      const listing = async () => (await (await GET(request("GET", undefined, cookie, "?scope=mine&city=Казань"))).json()).places;
      assert.deepEqual((await listing()).map((p: { name: string }) => p.name), ["У парка"]);
      await client.query("UPDATE client_sessions SET district = '', residential_complex = '' WHERE client_id = $1", [owner]);
      assert.equal((await listing()).length, 2);
      await client.query("UPDATE client_sessions SET district = $2 WHERE client_id = $1", [owner, location.district]);
      assert.equal((await listing()).length, 1);
      await client.query("UPDATE client_sessions SET residential_complex = $2 WHERE client_id = $1", [owner, location.complex]);
    });
    await t.test("rename validates and updates linked walks; linked deletion is refused", async () => {
      const walkId = randomUUID();
      await client.query("INSERT INTO walks (id, place_id, place) VALUES ($1, $2, $3)", [walkId, place.id, place.name]);
      assert.equal((await PATCH(request("PATCH", { id: place.id, name: "123" }))).status, 400);
      assert.equal((await PATCH(request("PATCH", { id: place.id, name: " у  озера ", createdBy: stranger }))).status, 200);
      assert.equal((await client.query("SELECT place FROM walks WHERE id = $1", [walkId])).rows[0].place, "У озера");
      assert.equal((await DELETE(request("DELETE", { id: place.id }))).status, 409);
      assert.equal((await client.query("SELECT count(*) FROM walks WHERE id = $1", [walkId])).rows[0].count, "1");
      await create("Дубликат");
      assert.equal((await PATCH(request("PATCH", { id: place.id, name: "Дубликат" }))).status, 409);
    });
    await t.test("unused place deletion succeeds without touching walks", async () => {
      const unused = await create("У леса");
      assert.equal((await DELETE(request("DELETE", { id: unused.id }))).status, 200);
      assert.equal((await client.query("SELECT count(*) FROM walks")).rows[0].count, "1");
    });
    await t.test("a missing profile never exposes owned places from other cities", async () => {
      await client.query("UPDATE client_sessions SET has_location = false WHERE client_id = $1", [owner]);
      assert.deepEqual((await (await GET(request())).json()).places, []);
      await client.query("UPDATE client_sessions SET has_location = true WHERE client_id = $1", [owner]);
    });
    await t.test("mine lists every place while the public list keeps its existing limit", async () => {
      await client.query(`INSERT INTO places (id, city, district, residential_complex, name, normalized_name, created_by)
        SELECT gen_random_uuid(), $1, $2, $3, 'Место ' || n, 'место ' || n, $4 FROM generate_series(1, 105) n`, [...Object.values(location), owner]);
      assert.equal((await (await GET(request())).json()).places.length, 107);
      const publicResponse = await GET(request("GET", undefined, "", "?" + new URLSearchParams(location)));
      assert.equal(publicResponse.status, 200);
      assert.equal((await publicResponse.json()).places.length, 100);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
