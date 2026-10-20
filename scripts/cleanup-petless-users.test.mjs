import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { setTimeout } from "node:timers/promises";
import pg from "pg";
import { cleanupPetlessUsers } from "./cleanup-expired-walks.mjs";

test("cleanup only removes users who never added a pet after 72 hours", {
  skip: !process.env.DATABASE_URL && "Set DATABASE_URL to a local test database."
}, async () => {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("BEGIN");
    const schema = `cleanup_test_${randomUUID().replaceAll("-", "")}`;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET LOCAL search_path TO ${schema}`);
    await client.query(`
      CREATE TABLE client_sessions (client_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid NOT NULL);
      CREATE TABLE pet_collaborators (pet_id uuid, client_id uuid);
    `);
    const legacy = randomUUID();
    const legacyOwner = randomUUID();
    await client.query("INSERT INTO client_sessions (client_id, created_at) VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '10 days'), ($2, CURRENT_TIMESTAMP - INTERVAL '10 days')", [legacy, legacyOwner]);
    await client.query("INSERT INTO pets VALUES ($1, $2)", [randomUUID(), legacyOwner]);
    await client.query(await readFile(new URL("../drizzle/0051_petless_user_cleanup.sql", import.meta.url), "utf8"));

    const [old, boundary, recent, owner, formerOwner, collaborator, rolledBack] = Array.from({ length: 7 }, () => randomUUID());
    for (const id of [old, boundary, recent, owner, formerOwner, collaborator, rolledBack]) {
      await client.query("INSERT INTO client_sessions (client_id, created_at) VALUES ($1, CURRENT_TIMESTAMP - INTERVAL '4 days')", [id]);
    }
    await client.query("UPDATE client_sessions SET created_at = CURRENT_TIMESTAMP - INTERVAL '3 days' WHERE client_id = $1", [boundary]);
    await client.query("UPDATE client_sessions SET created_at = CURRENT_TIMESTAMP - INTERVAL '3 days' + INTERVAL '1 second' WHERE client_id = $1", [recent]);
    await client.query("INSERT INTO pets VALUES ($1, $2), ($3, $4)", [randomUUID(), owner, randomUUID(), formerOwner]);
    await client.query("DELETE FROM pets WHERE client_id IN ($1, $2)", [formerOwner, legacyOwner]);
    await client.query("INSERT INTO pet_collaborators VALUES ($1, $2)", [randomUUID(), collaborator]);
    await client.query("DELETE FROM pet_collaborators WHERE client_id = $1", [collaborator]);
    await client.query("SAVEPOINT pet_creation");
    await client.query("INSERT INTO pets VALUES ($1, $2)", [randomUUID(), rolledBack]);
    await client.query("ROLLBACK TO SAVEPOINT pet_creation");

    assert.equal((await cleanupPetlessUsers(client)).rowCount, 3);
    const { rows } = await client.query("SELECT client_id, has_added_pet FROM client_sessions");
    assert.deepEqual(rows.map((row) => row.client_id).sort(), [legacy, legacyOwner, recent, owner, formerOwner, collaborator].sort());
    assert.equal(rows.find((row) => row.client_id === legacy).has_added_pet, null);
    for (const id of [legacyOwner, owner, formerOwner, collaborator]) {
      assert.equal(rows.find((row) => row.client_id === id).has_added_pet, true);
    }
    assert.equal((await cleanupPetlessUsers(client)).rowCount, 0);
  } finally {
    await client.query("ROLLBACK");
    await client.end();
  }
});

test("pet creation and share acceptance serialize with petless session cleanup", {
  skip: !process.env.DATABASE_URL && "Set DATABASE_URL to a local test database."
}, async () => {
  const clients = Array.from({ length: 3 }, () => new pg.Client({ connectionString: process.env.DATABASE_URL }));
  const [client, cleanup, creation] = clients;
  const schema = `cleanup_race_test_${randomUUID().replaceAll("-", "")}`;
  await Promise.all(clients.map((connection) => connection.connect()));
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE client_sessions (client_id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE pets (id uuid PRIMARY KEY, client_id uuid NOT NULL);
      CREATE TABLE pet_collaborators (pet_id uuid, client_id uuid);
      CREATE TABLE pet_share_links (token text PRIMARY KEY, pet_id uuid NOT NULL);
    `);
    await client.query(await readFile(new URL("../drizzle/0051_petless_user_cleanup.sql", import.meta.url), "utf8"));
    await Promise.all([cleanup, creation].map((connection) => connection.query(`SET search_path TO ${schema}`)));

    const oldSession = async () => {
      const id = randomUUID();
      await client.query("INSERT INTO client_sessions (client_id, created_at) VALUES ($1, now() - interval '4 days')", [id]);
      return id;
    };
    const waitForBlock = async (waiting, blocking) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const { rows } = await client.query("SELECT $2::integer = ANY(pg_blocking_pids($1)) AS blocked", [waiting.processID, blocking.processID]);
        if (rows[0].blocked) return;
        await setTimeout(10);
      }
      assert.fail("expected session row lock to serialize cleanup and pet creation");
    };

    const removed = await oldSession();
    assert.equal((await cleanupPetlessUsers(client)).rowCount, 1);
    await assert.rejects(client.query("INSERT INTO pets VALUES ($1, $2)", [randomUUID(), removed]), { code: "23503" });
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM pets")).rows[0].count, 0);

    const sharedPet = randomUUID();
    await client.query("INSERT INTO pet_share_links VALUES ('share', $1)", [sharedPet]);
    await creation.query("BEGIN");
    await creation.query("DELETE FROM pet_share_links WHERE token = 'share'");
    await assert.rejects(creation.query("INSERT INTO pet_collaborators VALUES ($1, $2)", [sharedPet, removed]), { code: "23503" });
    await creation.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM pet_share_links")).rows[0].count, 1);
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM pet_collaborators")).rows[0].count, 0);

    const cleanupWins = await oldSession();
    await cleanup.query("BEGIN");
    assert.equal((await cleanupPetlessUsers(cleanup)).rowCount, 1);
    await creation.query("BEGIN");
    await creation.query("DELETE FROM pet_share_links WHERE token = 'share'");
    const rejectedInsert = assert.rejects(creation.query("INSERT INTO pet_collaborators VALUES ($1, $2)", [sharedPet, cleanupWins]), { code: "23503" });
    await waitForBlock(creation, cleanup);
    await cleanup.query("COMMIT");
    await rejectedInsert;
    await creation.query("ROLLBACK");
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM pet_collaborators")).rows[0].count, 0);
    assert.equal((await client.query("SELECT count(*)::integer AS count FROM pet_share_links")).rows[0].count, 1);

    const creationWins = await oldSession();
    await creation.query("BEGIN");
    await creation.query("INSERT INTO pets VALUES ($1, $2)", [randomUUID(), creationWins]);
    await cleanup.query("BEGIN");
    const waitingCleanup = cleanupPetlessUsers(cleanup);
    await waitForBlock(cleanup, creation);
    await creation.query("COMMIT");
    assert.equal((await waitingCleanup).rowCount, 0);
    await cleanup.query("COMMIT");
    assert.equal((await client.query("SELECT has_added_pet FROM client_sessions WHERE client_id = $1", [creationWins])).rows[0].has_added_pet, true);
    await client.query("INSERT INTO pets VALUES ($1, $2)", [randomUUID(), creationWins]);
    await client.query("INSERT INTO pet_collaborators VALUES ($1, $2)", [sharedPet, creationWins]);
  } finally {
    await Promise.all([cleanup, creation].map((connection) => connection.query("ROLLBACK")));
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await Promise.all(clients.map((connection) => connection.end()));
  }
});
