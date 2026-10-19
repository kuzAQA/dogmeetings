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

const databaseUrl = process.env.PET_SHARES_TEST_DATABASE_URL;
test("pet invitations persist location, preserve previews and accept only once", {
  skip: !databaseUrl && "Set PET_SHARES_TEST_DATABASE_URL to a local test database."
}, async (t) => {
  const schema = `pet_shares_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const previousUrl = process.env.DATABASE_URL;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE locations (city text, district text, residential_complex text);
      CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid, name text, breed text, owner_name text,
        photo_type text, updated_at timestamptz DEFAULT now());
      CREATE TABLE pet_share_links (token varchar(64) PRIMARY KEY, pet_id uuid UNIQUE REFERENCES pets(id),
        created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
      CREATE TABLE pet_collaborators (pet_id uuid REFERENCES pets(id), client_id uuid,
        granted_by_client_id uuid, created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(),
        PRIMARY KEY(pet_id, client_id));
    `);
    for (const file of ["0011_colossal_wallflower.sql", "0034_pet_share_location.sql", "0044_pet_description.sql"]) {
      await client.query(await readFile(new URL(`../drizzle/${file}`, import.meta.url), "utf8"));
    }
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    process.env.DATABASE_URL = isolatedUrl.href;
    const { createClientSession, sessionCookie } = await import("./session.ts");
    const sessions = await import("../app/api/session/route.ts");
    const shares = await import("../app/api/pet-shares/route.ts");
    const invitation = await import("../app/api/pet-shares/[token]/route.ts");
    const origin = "http://localhost:3000";
    const request = (path: string, method = "GET", payload?: unknown, cookie = "") => new Request(`${origin}${path}`, {
      method, headers: { origin, cookie, "content-type": "application/json" },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
    const otherLocation = { ...location, complex: "Другой ЖК" };
    for (const item of [location, otherLocation]) await client.query("INSERT INTO locations VALUES ($1,$2,$3)", [item.city, item.district, item.complex]);
    const owner = await createClientSession({ clientId: randomUUID(), location, hasLocation: true });
    const cookieFor = (session: Parameters<typeof sessionCookie>[1]) => sessionCookie(request("/"), session).split(";")[0];
    const ownerCookie = cookieFor(owner);
    const petId = randomUUID();
    await client.query("INSERT INTO pets (id,client_id,name,breed,owner_name) VALUES ($1,$2,'Луна','Корги','Анна')", [petId, owner.clientId]);
    const issue = async (method = "POST") => {
      const response = await shares[method === "POST" ? "POST" : "PATCH"](request("/api/pet-shares", method, { petId }, ownerCookie));
      assert.ok(response.ok, await response.clone().text());
      const { link } = await response.json();
      assert.match(link, /^https?:\/\/[^/]+\/share\/[0-9a-f]{20}$/);
      return link.split("/").at(-1) as string;
    };
    let token = await issue();
    const context = (value = token) => ({ params: Promise.resolve({ token: value }) });
    const preview = () => invitation.GET(request(`/api/pet-shares/${token}`), context());
    const start = (value = token, cookie = "") => sessions.POST(request("/api/session", "POST", { shareToken: value }, cookie));
    let guestCookie = "";
    await t.test("GET previews do not consume; clean session inherits server location and survives reload", async () => {
      assert.equal((await preview()).status, 200);
      assert.equal((await preview()).status, 200);
      await sessions.PATCH(request("/api/session", "PATCH", { location: otherLocation }, ownerCookie));
      const response = await start();
      assert.equal(response.status, 201);
      guestCookie = response.headers.get("set-cookie")!.split(";")[0];
      const data = await response.json();
      assert.deepEqual(data.location, location);
      assert.equal(data.hasLocation, true);
      const restored = await sessions.GET(request("/api/session", "GET", undefined, guestCookie));
      assert.deepEqual((await restored.json()).location, location);
      assert.equal((await preview()).status, 200);
    });
    await t.test("existing selected location is preserved; unselected session receives invitation location", async () => {
      const existing = await createClientSession({ clientId: randomUUID(), location: otherLocation, hasLocation: true });
      assert.deepEqual((await (await start(token, cookieFor(existing))).json()).location, otherLocation);
      const unselected = await createClientSession({ clientId: randomUUID() });
      assert.deepEqual((await (await start(token, cookieFor(unselected))).json()).location, location);
    });
    await t.test("only owner can rotate; rotation invalidates the previous URL", async () => {
      assert.equal((await shares.PATCH(request("/api/pet-shares", "PATCH", { petId }, guestCookie))).status, 403);
      const oldToken = token;
      token = await issue("PATCH");
      assert.notEqual(token, oldToken);
      assert.equal((await invitation.GET(request("/"), context(oldToken))).status, 410);
      assert.equal((await start(oldToken)).status, 410);
      assert.equal((await start("invalid")).status, 404);
    });
    await t.test("failed addition rolls back token consumption", async () => {
      await client.query(`CREATE FUNCTION reject_collaboration() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'test insertion failure'; END $$;
        CREATE TRIGGER reject_collaboration BEFORE INSERT ON pet_collaborators
        FOR EACH ROW EXECUTE FUNCTION reject_collaboration()`);
      try {
        const response = await invitation.POST(request("/", "POST", undefined, guestCookie), context());
        assert.equal(response.status, 500);
        assert.equal((await preview()).status, 200);
      } finally {
        await client.query("DROP TRIGGER reject_collaboration ON pet_collaborators");
      }
    });
    await t.test("concurrent acceptance has exactly one winner and rejects reuse", async () => {
      const second = await start();
      const secondCookie = second.headers.get("set-cookie")!.split(";")[0];
      const accept = (cookie: string) => invitation.POST(request(`/api/pet-shares/${token}`, "POST", undefined, cookie), context());
      const results = await Promise.all([accept(guestCookie), accept(secondCookie)]);
      assert.deepEqual(results.map(r => r.status).sort(), [200, 410]);
      assert.equal((await client.query("SELECT * FROM pet_collaborators")).rowCount, 1);
      assert.equal((await accept(guestCookie)).status, 410);
      assert.equal((await preview()).status, 410);
    });
    await t.test("existing collaborator does not consume a fresh invitation", async () => {
      token = await issue("PATCH");
      const [{ client_id: clientId }] = (await client.query("SELECT client_id FROM pet_collaborators")).rows;
      const collaborator = await createClientSession({ clientId, replaceExisting: true });
      const response = await invitation.POST(request("/", "POST", undefined, cookieFor(collaborator)), context());
      assert.equal((await response.json()).alreadyAdded, true);
      const seen = await invitation.GET(request("/", "GET", undefined, cookieFor(collaborator)), context());
      assert.equal((await seen.json()).alreadyAdded, true);
      assert.equal((await preview()).status, 200);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.end();
  }
});
