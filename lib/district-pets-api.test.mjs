import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";

const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
function fixture(session = { hasLocation: true, location }, fail = false, empty = false) {
  const exports = {}, queries = [];
  const tables = Object.fromEntries(["pets", "clientSessions", "locations"].map((name) => [name, new Proxy({}, { get: (_, field) => `${name}.${String(field)}` })]));
  const rows = [
    [{ ...location }, { ...location, complex: "Пустой ЖК" }],
    [{ id: "pet-id", name: "Луна", breed: "Корги", ownerName: "Анна", description: "Любим парк", photoType: null, updatedAt: new Date("2026-01-01"), complex: location.complex, clientId: "secret", contact: "secret", tokenHash: "secret" }]
  ];
  const db = { select(selection) {
    const query = { selection, joins: [], where: null };
    queries.push(query);
    const chain = {
      from: () => chain,
      innerJoin: (table, condition) => { query.joins.push(condition); return chain; },
      where: (condition) => { query.where = condition; return chain; },
      orderBy: async () => { if (fail) throw new Error("database unavailable"); return empty ? [] : rows[queries.indexOf(query)]; }
    };
    return chain;
  } };
  const source = readFileSync(new URL("../app/api/district-pets/route.ts", import.meta.url), "utf8");
  runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, Response, Date,
    require(name) {
      if (name === "drizzle-orm") return { eq: (...args) => ["eq", ...args], and: (...args) => ["and", ...args], asc: (value) => value };
      if (name.endsWith("/db/schema")) return tables;
      if (name.endsWith("/db")) return { withDb: (fn) => fn(db) };
      if (name.endsWith("/session")) return { getClientSession: async () => session, privateJson: Response.json };
      if (name.endsWith("/domain/pet")) return { petPhotoUrl: (id) => `/api/pet-photo?id=${id}` };
      assert.fail(name);
    }
  });
  return { queries, get: () => exports.GET(new Request("https://dogmeet.ru/api/district-pets?city=foreign&district=foreign&clientId=foreign")) };
}

test("district directory requires a session and a saved complete location", async () => {
  for (const [session, status] of [[null, 401], [{ hasLocation: false, location: null }, 400]]) {
    const f = fixture(session);
    assert.equal((await f.get()).status, status);
    assert.equal(f.queries.length, 0);
  }
});

test("directory uses the saved district, joins pets to owners and returns only public preview fields", async () => {
  const f = fixture();
  const response = await f.get();
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.complexes[0].location.complex, location.complex);
  const pet = body.complexes[0].pets[0];
  assert.deepEqual(Object.keys(pet).sort(), ["id", "name", "breed", "ownerName", "description", "photoUrl"].sort());
  assert.equal(pet.name, "Луна");
  assert.deepEqual(body.complexes[1].pets, []);
  const predicates = JSON.stringify(f.queries);
  assert.ok(predicates.includes('"pets.clientId","clientSessions.clientId"'));
  assert.ok(predicates.includes('"clientSessions.city","Москва"'));
  assert.ok(predicates.includes('"clientSessions.district","Коммунарка"'));
  assert.ok(predicates.includes('"clientSessions.hasLocation",true'));
  assert.ok(predicates.includes('"locations.city","Москва"'));
  assert.ok(predicates.includes('"locations.district","Коммунарка"'));
  assert.ok(!predicates.includes("foreign"));
  assert.ok(!predicates.includes("tokenHash"));
});

test("a district without complexes returns an empty list", async () => {
  const response = await fixture(undefined, false, true).get();
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { complexes: [] });
});

test("database failures return a safe retryable error", async () => {
  const response = await fixture(undefined, true).get();
  assert.equal(response.status, 500);
  assert.deepEqual(await response.json(), { error: "Не удалось загрузить питомцев района." });
});
