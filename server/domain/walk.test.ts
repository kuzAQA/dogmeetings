import assert from "node:assert/strict";
import test from "node:test";
import { isWalkEditExpired, walkEditDeadline } from "./walk.ts";

for (const [walkTime, cutoff] of [["11:59", "12:00"], ["12:00", "18:00"], ["17:59", "18:00"]]) {
  test(`${walkTime} expires exactly at ${cutoff} Moscow time`, () => {
    const walk = { walkDate: "2026-10-10", walkTime };
    const now = new Date(`2026-10-10T${cutoff}:00+03:00`).getTime();
    assert.equal(walkEditDeadline(walk), now);
    assert.equal(isWalkEditExpired(walk, now - 1), false);
    assert.equal(isWalkEditExpired(walk, now), true);
    assert.equal(isWalkEditExpired({ ...walk, walkDate: "2026-10-11" }, now), false);
  });
}

test("18:00 has no edit cutoff before midnight", () => {
  const walk = { walkDate: "2026-10-10", walkTime: "18:00" };
  assert.equal(walkEditDeadline(walk), Infinity);
  assert.equal(isWalkEditExpired(walk, new Date("2026-10-10T23:59:59.999+03:00").getTime()), false);
});
