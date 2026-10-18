import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Client } from "pg";

test("production cleanup preserves the square and rolls back unsafe deletions", {
  skip: !process.env.MY_PLACES_TEST_DATABASE_URL && "Set MY_PLACES_TEST_DATABASE_URL to a local test database.",
}, async () => {
  const client = new Client({ connectionString: process.env.MY_PLACES_TEST_DATABASE_URL });
  const schema = `prune_places_test_${randomUUID().replaceAll("-", "")}`;
  const sql = await readFile(new URL("./production-prune-places.sql", import.meta.url), "utf8");
  await client.connect();
  try {
    await client.query(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await client.query("CREATE TABLE places (id integer PRIMARY KEY, name text NOT NULL); CREATE TABLE walks (place_id integer REFERENCES places(id) ON DELETE RESTRICT)");
    const reset = async (names) => {
      await client.query("TRUNCATE walks, places");
      for (const [index, name] of names.entries()) {
        await client.query("INSERT INTO places VALUES ($1, $2)", [index + 1, name]);
      }
    };
    const names = async () => (await client.query("SELECT name FROM places ORDER BY id")).rows.map(row => row.name);
    const square = "Сквер между домов";
    for (const input of [["Парк"], [square, square, "Парк"]]) {
      await reset(input);
      await assert.rejects(client.query(sql), /Expected exactly one place/);
      await client.query("ROLLBACK");
      assert.deepEqual(await names(), input);
    }
    await reset([square, "Парк"]);
    await client.query("INSERT INTO walks VALUES (2)");
    await assert.rejects(client.query(sql), { code: "23503" });
    await client.query("ROLLBACK");
    assert.deepEqual(await names(), [square, "Парк"]);
    await client.query("UPDATE walks SET place_id = 1");
    await client.query(sql);
    await client.query(sql);
    assert.deepEqual(await names(), [square]);
    assert.equal((await client.query("SELECT count(*)::int AS count FROM walks")).rows[0].count, 1);
  } finally {
    await client.query("ROLLBACK");
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.end();
  }
});
