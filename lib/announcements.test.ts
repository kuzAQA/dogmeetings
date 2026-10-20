import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { registerHooks } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "pg";
import type { AnnouncementExclusions } from "./announcement-types";

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && context.parentURL) {
    for (const suffix of [".ts", "/index.ts"]) {
      const url = new URL(specifier + suffix, context.parentURL);
      if (existsSync(fileURLToPath(url))) return nextResolve(url.href, context);
    }
  }
  return nextResolve(specifier, context);
} });

const databaseUrl = process.env.ANNOUNCEMENTS_TEST_DATABASE_URL;
test("announcements use server time and session identity in isolated PostgreSQL", {
  skip: !databaseUrl && "Set ANNOUNCEMENTS_TEST_DATABASE_URL to a local test database."
}, async (t) => {
  const schema = `announcements_test_${randomUUID().replaceAll("-", "")}`;
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
  const previousUrl = process.env.DATABASE_URL;
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    for (const migration of ["0006_shocking_kree.sql", "0011_colossal_wallflower.sql", "0018_admin_sessions.sql", "0028_announcements.sql", "0033_announcement_exclusions.sql"]) {
      const source = await readFile(new URL(`../drizzle/${migration}`, import.meta.url), "utf8");
      // Keep the seed test deterministic after the real campaign has ended.
      await client.query(source.replace("WHERE CURRENT_TIMESTAMP <", "WHERE TIMESTAMPTZ '2026-10-19T00:00:00+03:00' <"));
    }
    await t.test("lifecycle migration preserves existing content, settings and dates and defaults new campaigns to temporary", async () => {
      const before = (await client.query("SELECT * FROM announcement_campaigns ORDER BY id")).rows;
      await client.query(await readFile(new URL("../drizzle/0041_announcement_lifecycle.sql", import.meta.url), "utf8"));
      const after = (await client.query("SELECT * FROM announcement_campaigns ORDER BY id")).rows;
      assert.deepEqual(after.map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => key !== "permanent"))), before);
      assert.ok(after.every((row) => row.permanent === true));
      await client.query("INSERT INTO announcement_campaigns (id, pages) VALUES ('default-test', '[{\"title\":\"Test\",\"text\":\"Test\"}]')");
      const row = (await client.query("SELECT * FROM announcement_campaigns WHERE id = 'default-test'")).rows[0];
      assert.equal(row.permanent, false);
      assert.equal(row.starts_at, null);
      assert.equal(row.ends_at, null);
      await client.query("DELETE FROM announcement_campaigns WHERE id = 'default-test'");
    });
    await t.test("status migration preserves campaigns and defaults to active", async () => {
      const before = (await client.query("SELECT * FROM announcement_campaigns ORDER BY id")).rows;
      await client.query(await readFile(new URL("../drizzle/0043_announcement_status.sql", import.meta.url), "utf8"));
      const after = (await client.query("SELECT * FROM announcement_campaigns ORDER BY id")).rows;
      assert.deepEqual(after.map(({ status, ...row }) => { assert.equal(status, "active"); return row; }), before);
      await assert.rejects(client.query("UPDATE announcement_campaigns SET status = 'unknown'"), /announcement_campaigns_status_check/);
    });
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.searchParams.set("options", `-c search_path=${schema}`);
    await t.test("release gives every current banner seven days and keeps content and receipts", async () => {
      const before = (await client.query("SELECT id, pages, exclusions FROM announcement_campaigns ORDER BY id")).rows;
      const clientId = randomUUID();
      await client.query("INSERT INTO announcement_receipts (client_id, banner_id) SELECT $1, id FROM announcement_campaigns", [clientId]);
      await client.query(await readFile(new URL("../drizzle/0042_release_announcements.sql", import.meta.url), "utf8"));
      const after = (await client.query("SELECT * FROM announcement_campaigns ORDER BY id")).rows;
      assert.deepEqual(after.map(({ id, pages, exclusions }) => ({ id, pages, exclusions })), before);
      assert.ok(after.every((row) => row.permanent && +row.ends_at - +row.starts_at === 7 * 24 * 60 * 60 * 1000));
      assert.ok(after.every((row) => Math.abs(+row.starts_at - Date.now()) < 5000));
      assert.equal((await client.query("SELECT * FROM announcement_receipts WHERE client_id = $1", [clientId])).rowCount, before.length);
      await client.query("DELETE FROM announcement_receipts WHERE client_id = $1", [clientId]);
    });

    await client.query("ALTER TABLE client_sessions ADD COLUMN has_added_pet boolean DEFAULT false");
    process.env.DATABASE_URL = isolatedUrl.href;
    const { GET, POST } = await import("../app/api/announcements/route");
    const { createClientSession, sessionCookie } = await import("./session");
    const { cleanupExpiredBanners } = await import("../scripts/cleanup-expired-walks.mjs");
    const endpoint = "http://localhost:3000/api/announcements";
    const first = await createClientSession({ clientId: randomUUID() });
    const second = await createClientSession({ clientId: randomUUID() });
    const cookie = (session: typeof first) => sessionCookie(new Request(endpoint), session).split(";")[0];
    const request = (session = first, body?: unknown) => new Request(endpoint, {
      method: body ? "POST" : "GET",
      headers: { cookie: cookie(session), origin: "http://localhost:3000", "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const list = async (session = first) => {
      const response = await GET(request(session));
      assert.equal(response.status, 200);
      assert.equal(response.headers.get("cache-control"), "no-store, private");
      return response.json();
    };
    const id = "pet-owner-contact-2026-10";

    await t.test("first campaign has a fixed common seven-day lifetime", async () => {
      const { rows: [row] } = await client.query("SELECT starts_at, ends_at FROM announcement_campaigns");
      assert.ok(Math.abs(+row.starts_at - Date.now()) < 5000);
      assert.equal(row.ends_at - row.starts_at, 7 * 24 * 60 * 60 * 1000);
      await client.query("UPDATE announcement_campaigns SET starts_at = CURRENT_TIMESTAMP - interval '1 hour', ends_at = CURRENT_TIMESTAMP + interval '1 hour'");
    });
    await t.test("guests cannot load content or acknowledge", async () => {
      assert.equal((await GET(new Request(endpoint))).status, 401);
      assert.equal((await POST(new Request(endpoint, { method: "POST", headers: { origin: "http://localhost:3000" }, body: JSON.stringify({ id }) }))).status, 401);
      assert.equal((await POST(new Request(endpoint, { method: "POST", headers: { origin: "https://foreign.test", cookie: cookie(first) }, body: JSON.stringify({ id }) }))).status, 403);
    });
    await t.test("verified sessions receive active content", async () => {
      const data = await list();
      assert.equal(data.banners[0].id, id);
      assert.equal(data.banners[0].pages[0].example, "pet-contact");
      assert.ok(Date.parse(data.serverTime));
    });
    await t.test("exclusions veto each geographical level in normal and preview delivery and acknowledgement", async () => {
      const home = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
      const resident = await createClientSession({ clientId: randomUUID(), location: home, hasLocation: true });
      const empty = { cities: [], districts: [], complexes: [] };
      const previousPreview = process.env.ANNOUNCEMENT_PREVIEW;
      process.env.ANNOUNCEMENT_PREVIEW = "1";
      try {
        for (const exclusions of [
          { ...empty, cities: [home.city] },
          { ...empty, districts: [{ city: home.city, district: home.district }] },
          { ...empty, complexes: [home] },
          { cities: ["Казань"], districts: [{ city: home.city, district: home.district }], complexes: [] }
        ]) {
          await client.query("UPDATE announcement_campaigns SET exclusions = $1", [exclusions]);
          assert.deepEqual((await list(resident)).banners, []);
          const preview = await GET(new Request(`${endpoint}?preview=1`, { headers: { cookie: cookie(resident) } }));
          assert.deepEqual((await preview.json()).banners, []);
          assert.equal((await POST(request(resident, { id }))).status, 410);
          assert.equal((await list(second)).banners.length, 1, "unknown geography retains the previous policy");
        }
        await client.query("UPDATE announcement_campaigns SET exclusions = $1", [{ cities: ["Казань"], districts: [{ city: "Казань", district: home.district }], complexes: [{ ...home, district: "Другой район" }] }]);
        assert.equal((await list(resident)).banners.length, 1);
      } finally {
        await client.query("UPDATE announcement_campaigns SET exclusions = $1", [empty]);
        if (previousPreview === undefined) delete process.env.ANNOUNCEMENT_PREVIEW;
        else process.env.ANNOUNCEMENT_PREVIEW = previousPreview;
      }
    });
    await t.test("admin authorization, geographical validation and atomic parallel extensions", async () => {
      const admin = await import("../app/api/dogsfather/announcements/route");
      const adminEndpoint = "http://localhost:3000/api/dogsfather/announcements";
      const { createAdminSessionCookie } = await import("./admin-auth");
      const oldSecret = process.env.ADMIN_SESSION_SECRET;
      process.env.ADMIN_SESSION_SECRET = "isolated-announcement-test-secret-12345";
      try {
        const adminCookie = (await createAdminSessionCookie(new Request(adminEndpoint))).split(";")[0];
        const patch = (body: unknown, auth = true, origin = "http://localhost:3000") => admin.PATCH(new Request(adminEndpoint, {
          method: "PATCH", headers: { cookie: auth ? adminCookie : cookie(first), origin, "content-type": "application/json" }, body: JSON.stringify(body)
        }));
        assert.equal((await admin.GET(new Request(adminEndpoint))).status, 401);
        for (const action of ["extend", "exclusions"]) assert.equal((await patch({ id, action, days: 1, exclusions: { cities: [], districts: [], complexes: [] } }, false)).status, 401);
        assert.equal((await patch({ id, action: "extend", days: 1 }, true, "https://foreign.test")).status, 401);
        for (const days of [null, "", "1", 0, -1, 1.5, 1e100, undefined]) assert.equal((await patch({ id, action: "extend", days })).status, 400);
        assert.equal((await patch({ id: "bad id", action: "extend", days: 1 })).status, 400);
        const information = async () => {
          const response = await GET(new Request(`${endpoint}?information=1`, { headers: { cookie: cookie(second) } }));
          assert.equal(response.status, 200);
          return (await response.json()).banners;
        };
        const future = new Date(Date.now() + 3_600_000).toISOString();
        const past = new Date(Date.now() - 3_600_000).toISOString();
        const end = new Date(Date.now() + 7_200_000).toISOString();
        const schedule = (startsAt: string | null, endsAt: string | null = end, permanent = true) => patch({ id, action: "schedule", startsAt, endsAt, permanent });
        for (const invalid of ["false", null, 1]) assert.equal((await patch({ id, action: "schedule", startsAt: null, endsAt: null, permanent: invalid })).status, 400);
        assert.equal((await schedule(end, future)).status, 400);
        assert.equal((await schedule(future)).status, 200);
        assert.deepEqual((await list(second)).banners, []);
        assert.deepEqual(await information(), []);
        await client.query("UPDATE announcement_campaigns SET starts_at = clock_timestamp() + interval '500 milliseconds' WHERE id = $1", [id]);
        assert.deepEqual((await list(second)).banners, []);
        assert.deepEqual(await information(), []);
        await client.query("SELECT pg_sleep(0.55)");
        assert.equal((await list(second)).banners.length, 1);
        assert.equal((await information()).length, 1);
        assert.equal((await schedule(past)).status, 200);
        assert.equal((await list(second)).banners.length, 1);
        assert.equal((await information()).length, 1);
        assert.equal((await schedule(future)).status, 200);
        assert.deepEqual(await information(), []);
        assert.equal((await patch({ id, action: "start-now" })).status, 200);
        const started = (await client.query("SELECT starts_at, ends_at FROM announcement_campaigns WHERE id = $1", [id])).rows[0];
        assert.ok(Math.abs(+started.starts_at - Date.now()) < 5000);
        assert.equal(started.ends_at.toISOString(), end);
        assert.equal((await list(second)).banners.length, 1);
        assert.equal((await information()).length, 1);
        await client.query("INSERT INTO announcement_receipts (client_id, banner_id) VALUES ($1, $2)", [second.clientId, id]);
        assert.equal((await patch({ id, action: "start-now" })).status, 200);
        assert.deepEqual((await list(second)).banners, []);
        assert.equal((await information()).length, 1);
        await client.query("DELETE FROM announcement_receipts WHERE client_id = $1", [second.clientId]);
        assert.equal((await schedule(null, past)).status, 200);
        assert.deepEqual((await list(second)).banners, []);
        assert.equal((await information()).length, 1);
        assert.equal((await patch({ id, action: "start-now" })).status, 409);
        assert.equal((await schedule(null, past, false)).status, 200);
        assert.deepEqual(await information(), []);
        assert.deepEqual((await list(second)).banners, []);
        assert.equal((await client.query("SELECT * FROM announcement_campaigns WHERE id = $1", [id])).rowCount, 1);
        assert.equal((await schedule(null, null, false)).status, 200);
        assert.equal((await list(second)).banners.length, 1);
        assert.deepEqual(await information(), []);
        assert.equal((await schedule(past, end)).status, 200);
        const create = (body: unknown, auth = true) => admin.POST(new Request(adminEndpoint, {
          method: "POST", headers: { cookie: auth ? adminCookie : cookie(first), origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body)
        }));
        assert.equal((await create({}, false)).status, 401);
        assert.equal((await create({ title: "New", text: "Content", startsAt: future, endsAt: past })).status, 400);
        assert.equal((await create({ title: "New", text: "Content", startsAt: null, endsAt: past })).status, 400);
        const created = await create({ title: "New", text: "Content", startsAt: future, endsAt: end });
        assert.equal(created.status, 201);
        const newBanner = (await created.json()).banner;
      assert.equal(newBanner.status, "active");
        assert.equal(newBanner.permanent, false);
        assert.equal(newBanner.startsAt, future);
        assert.deepEqual(newBanner.pages, [{ title: "New", text: "Content" }]);
        await client.query("DELETE FROM announcement_campaigns WHERE id = $1", [newBanner.id]);
        const exclusions = { cities: ["Москва"], districts: [], complexes: [] };
        assert.equal((await patch({ id, action: "exclusions", exclusions })).status, 200);
        for (const invalid of [
          { cities: ["Нет такого города"], districts: [], complexes: [] },
          { cities: [], districts: [{ city: "Казань", district: "Коммунарка" }], complexes: [] },
          { cities: [], districts: [], complexes: [{ city: "Москва", district: "Другой район", complex: "Москвичка" }] }
        ]) assert.equal((await patch({ id, action: "exclusions", exclusions: invalid })).status, 400);
        const before = (await client.query("SELECT * FROM announcement_campaigns WHERE id = $1", [id])).rows[0];
        const responses = await Promise.all([patch({ id, action: "extend", days: 2 }), patch({ id, action: "extend", days: 3 })]);
        assert.deepEqual(responses.map((response) => response.status), [200, 200]);
        const after = (await client.query("SELECT * FROM announcement_campaigns WHERE id = $1", [id])).rows[0];
        assert.equal(after.ends_at - before.ends_at, 5 * 86_400_000);
        assert.equal(+after.starts_at, +before.starts_at);
        assert.deepEqual(after.pages, before.pages);
        assert.deepEqual(after.exclusions, exclusions);
        await client.query("INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages) VALUES ('future-admin', CURRENT_TIMESTAMP + interval '1 day', CURRENT_TIMESTAMP + interval '2 days', '[{\"title\":\"Future\",\"text\":\"Future\"}]')");
        const listing = await admin.GET(new Request(adminEndpoint, { headers: { cookie: adminCookie } }));
        const data = await listing.json();
        assert.equal(listing.status, 200);
        assert.deepEqual(data.banners.map((banner: { id: string }) => banner.id), [id, "future-admin"]);
        assert.equal(data.locations[0].city, "Москва");
        assert.ok(Date.parse(data.serverTime));
        assert.equal((await patch({ id: "future-admin", action: "extend", days: 1 })).status, 200);
        await client.query("DELETE FROM announcement_campaigns WHERE id = 'future-admin'");
        await client.query("UPDATE announcement_campaigns SET ends_at = '9999-12-31T00:00:00Z' WHERE id = $1", [id]);
        assert.equal((await patch({ id, action: "extend", days: 1 })).status, 409);
        await client.query("UPDATE announcement_campaigns SET ends_at = CURRENT_TIMESTAMP WHERE id = $1", [id]);
        assert.equal((await patch({ id, action: "extend", days: 1 })).status, 200);
      // Exercise all lifecycle actions without changing the campaign used by later tests.
      {
        const target = "admin-actions-test";
        await client.query("INSERT INTO announcement_campaigns (id, pages, permanent) VALUES ($1, '[{\"title\":\"Actions\",\"text\":\"Content\"}]', true)", [target]);
        const visible = async (information = false) => {
          const response = await GET(new Request(`${endpoint}${information ? "?information=1" : ""}`, { headers: { cookie: cookie(second) } }));
          return (await response.json()).banners.some((banner: { id: string }) => banner.id === target);
        };
        const action = (name: string, auth = true, origin = "http://localhost:3000") => patch({ id: target, action: name }, auth, origin);
        try {
          for (const name of ["pause", "resume", "disable", "information", "delete"]) {
            assert.equal((await action(name, false)).status, 401);
            assert.equal((await action(name, true, "https://foreign.test")).status, 401);
          }
          assert.equal(await visible(), true);
          assert.equal((await action("pause")).status, 200);
          assert.equal(await visible(), false);
          const { listAnnouncements } = await import("./announcements");
          assert.equal((await listAnnouncements(second.clientId, true)).banners.some((banner) => banner.id === target), false);
          assert.equal(await visible(true), false);
          assert.equal((await POST(request(second, { id: target }))).status, 410);
          assert.equal((await action("resume")).status, 200);
          assert.equal(await visible(), true);
          assert.equal((await POST(request(second, { id: target }))).status, 200);
          await action("pause");
          await action("resume");
          assert.equal(await visible(), false);
          assert.equal(await visible(true), true);
          assert.equal((await client.query("SELECT * FROM announcement_receipts WHERE banner_id = $1", [target])).rowCount, 1);
          assert.equal((await action("disable")).status, 200);
          assert.equal(await visible(true), false);
          assert.equal((await listAnnouncements(second.clientId, true)).banners.some((banner) => banner.id === target), false);
          assert.equal((await action("resume")).status, 409);
          assert.equal((await patch({ id: target, action: "schedule", startsAt: null, endsAt: null, permanent: true })).status, 200);
          assert.equal(await visible(true), false);
          assert.equal((await action("start-now")).status, 200);
          assert.equal(await visible(true), true);
          await action("pause");
          await client.query("UPDATE announcement_campaigns SET starts_at = CURRENT_TIMESTAMP - interval '2 hours', ends_at = CURRENT_TIMESTAMP - interval '1 hour' WHERE id = $1", [target]);
          assert.equal((await action("resume")).status, 409);
          assert.equal((await action("information")).status, 200);
          assert.equal(await visible(true), true);
          await client.query("UPDATE announcement_campaigns SET starts_at = CURRENT_TIMESTAMP + interval '1 day', ends_at = NULL, permanent = false WHERE id = $1", [target]);
          assert.equal(await visible(), false);
          assert.equal(await visible(true), true);
          assert.equal((await listAnnouncements(second.clientId, true)).banners.some((banner) => banner.id === target), false);
          assert.equal((await POST(request(second, { id: target }))).status, 410);
          assert.equal((await action("delete")).status, 200);
          assert.equal(await visible(true), false);
          assert.equal((await client.query("SELECT * FROM announcement_campaigns WHERE id = $1", [target])).rowCount, 0);
          assert.equal((await client.query("SELECT * FROM announcement_receipts WHERE banner_id = $1", [target])).rowCount, 0);
          for (const name of ["pause", "resume", "disable", "information", "delete"]) assert.equal((await action(name)).status, 404);
        } finally {
          await client.query("DELETE FROM announcement_receipts WHERE banner_id = $1", [target]);
          await client.query("DELETE FROM announcement_campaigns WHERE id = $1", [target]);
        }
      }
      } finally {
        await client.query("UPDATE announcement_campaigns SET ends_at = CURRENT_TIMESTAMP + interval '1 hour', exclusions = '{\"cities\":[],\"districts\":[],\"complexes\":[]}' WHERE id = $1", [id]);
        if (oldSecret === undefined) delete process.env.ADMIN_SESSION_SECRET;
        else process.env.ADMIN_SESSION_SECRET = oldSecret;
      }
    });
    await t.test("geographical renames preserve exclusions and deletion prunes obsolete compound keys", async () => {
      const { withDb } = await import("../db");
      const { sql } = await import("drizzle-orm");
      const { syncAnnouncementLocations } = await import("./announcements");
      const rollback = new Error("rollback-geographical-test");
      await assert.rejects(withDb((db) => db.transaction(async (tx) => {
        const original = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
        await tx.execute(sql`UPDATE announcement_campaigns SET exclusions = ${JSON.stringify({ cities: [original.city], districts: [{ city: original.city, district: original.district }], complexes: [original] })}::jsonb WHERE id = ${id}`);
        await tx.execute(sql`UPDATE locations SET city = 'Новая Москва'`);
        await syncAnnouncementLocations(tx, { ...original, level: "city" }, "Новая Москва");
        await tx.execute(sql`UPDATE locations SET district = 'Новый район'`);
        await syncAnnouncementLocations(tx, { ...original, city: "Новая Москва", level: "district" }, "Новый район");
        await tx.execute(sql`UPDATE locations SET residential_complex = 'Новый ЖК' WHERE residential_complex = ${original.complex}`);
        const target = { city: "Новая Москва", district: "Новый район", complex: original.complex, level: "complex" as const };
        await syncAnnouncementLocations(tx, target, "Новый ЖК");
        const saved = await tx.execute(sql`SELECT exclusions FROM announcement_campaigns WHERE id = ${id}`);
        assert.deepEqual(saved.rows[0].exclusions, {
          cities: ["Новая Москва"], districts: [{ city: "Новая Москва", district: "Новый район" }],
          complexes: [{ city: "Новая Москва", district: "Новый район", complex: "Новый ЖК" }]
        });
        await tx.execute(sql`DELETE FROM locations WHERE residential_complex = 'Новый ЖК'`);
        await syncAnnouncementLocations(tx, { ...target, complex: "Новый ЖК" });
        const partial = await tx.execute(sql`SELECT exclusions FROM announcement_campaigns WHERE id = ${id}`);
        assert.deepEqual((partial.rows[0].exclusions as AnnouncementExclusions).complexes, []);
        assert.deepEqual((partial.rows[0].exclusions as AnnouncementExclusions).cities, ["Новая Москва"]);
        await tx.execute(sql`DELETE FROM locations WHERE city = 'Новая Москва'`);
        await syncAnnouncementLocations(tx, { ...target, level: "city" });
        const cleared = await tx.execute(sql`SELECT exclusions FROM announcement_campaigns WHERE id = ${id}`);
        assert.deepEqual(cleared.rows[0].exclusions, { cities: [], districts: [], complexes: [] });
        throw rollback;
      })), (error) => error === rollback);
    });
    await t.test("acknowledgement is idempotent, persists across new sessions, and cannot target another user", async () => {
      for (let n = 0; n < 2; n++) assert.equal((await POST(request(first, { id, clientId: second.clientId }))).status, 200);
      assert.deepEqual((await list()).banners, []);
      assert.equal((await list(second)).banners.length, 1);
      const replacement = await createClientSession({ clientId: first.clientId, replaceExisting: true });
      assert.deepEqual((await list(replacement)).banners, []);
      assert.equal((await client.query("SELECT * FROM announcement_receipts")).rowCount, 1);
    });
    await t.test("preview is gated and can retrieve acknowledged active content", async () => {
      const previous = process.env.ANNOUNCEMENT_PREVIEW;
      const previewSession = await createClientSession({ clientId: first.clientId, replaceExisting: true });
      const previewRequest = () => new Request(`${endpoint}?preview=1`, { headers: { cookie: cookie(previewSession) } });
      try {
        delete process.env.ANNOUNCEMENT_PREVIEW;
        assert.equal((await GET(previewRequest())).status, 404);
        process.env.ANNOUNCEMENT_PREVIEW = "1";
        const response = await GET(previewRequest());
        assert.equal(response.status, 200);
        assert.equal((await response.json()).banners[0].id, id);
        assert.deepEqual((await list(previewSession)).banners, []);
        assert.equal((await GET(new Request("https://dogmeet.ru/api/announcements?preview=1", { headers: { cookie: cookie(previewSession) } }))).status, 404);
        assert.equal((await GET(new Request(`${endpoint}?preview=1`))).status, 401);
      } finally {
        if (previous === undefined) delete process.env.ANNOUNCEMENT_PREVIEW;
        else process.env.ANNOUNCEMENT_PREVIEW = previous;
      }
    });
    await t.test("future content is excluded; expiry boundary hides automatic content and forbids acknowledgement", async () => {
      await client.query("UPDATE announcement_campaigns SET starts_at = CURRENT_TIMESTAMP + interval '30 minutes'");
      assert.deepEqual((await list(second)).banners, []);
      await client.query("UPDATE announcement_campaigns SET starts_at = CURRENT_TIMESTAMP - interval '1 hour', ends_at = CURRENT_TIMESTAMP");
      assert.deepEqual((await list(second)).banners, []);
      assert.equal((await client.query("SELECT * FROM announcement_campaigns")).rowCount, 1);
      assert.equal((await POST(request(second, { id }))).status, 410);
      assert.equal((await POST(request(second, { id: "unknown" }))).status, 410);
    });
    await t.test("scheduler retains expired content and receipts", async () => {
      await client.query("INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages) VALUES ('expired', CURRENT_TIMESTAMP - interval '2 hours', CURRENT_TIMESTAMP - interval '1 hour', '[{\"title\":\"Old\",\"text\":\"Old content\"}]')");
      assert.equal(await cleanupExpiredBanners(client), 60000);
      assert.equal((await client.query("SELECT * FROM announcement_campaigns")).rowCount, 2);
      assert.equal((await client.query("SELECT * FROM announcement_receipts")).rowCount, 1);
      assert.deepEqual((await list(second)).banners, []);
    });
    await t.test("cleanup retains the exact expiry instant and schedules the next live deadline", async () => {
      await client.query("BEGIN");
      try {
        await client.query("INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages) VALUES ('boundary', CURRENT_TIMESTAMP - interval '1 hour', CURRENT_TIMESTAMP, '[{\"title\":\"Boundary\",\"text\":\"Content\"}]')");
        assert.equal(await cleanupExpiredBanners(client), 60000);
        assert.equal((await client.query("SELECT * FROM announcement_campaigns")).rowCount, 3);
      } finally {
        await client.query("ROLLBACK");
      }
      await client.query("INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages) VALUES ('upcoming', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '30 seconds', '[{\"title\":\"Next\",\"text\":\"Content\"}]')");
      const delay = await cleanupExpiredBanners(client);
      assert.ok(delay > 0 && delay <= 30000);
      await client.query("DELETE FROM announcement_campaigns WHERE id = 'upcoming'");
    });
    await t.test("Telegram campaign runs for seven days and includes a static dock example", async () => {
      await client.query(await readFile(new URL("../drizzle/0029_telegram_announcement.sql", import.meta.url), "utf8"));
      const { rows: [row] } = await client.query("SELECT starts_at, ends_at, pages FROM announcement_campaigns WHERE id = 'telegram-notifications-2026-10'");
      assert.equal(row.ends_at - row.starts_at, 7 * 24 * 60 * 60 * 1000);
      assert.equal(row.pages[0].example, "telegram-dock");
    });
    await t.test("storage failures are errors, never successful acknowledgements", async () => {
      await client.query("INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages) VALUES ('new', CURRENT_TIMESTAMP - interval '1 hour', CURRENT_TIMESTAMP + interval '1 hour', '[{\"title\":\"New\",\"text\":\"New content\"}]')");
      await client.query("ALTER TABLE announcement_receipts RENAME TO unavailable_receipts");
      const response = await POST(request(second, { id: "new" }));
      assert.equal(response.status, 500);
      assert.ok((await response.json()).error);
    });
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
