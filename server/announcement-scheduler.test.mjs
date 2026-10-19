import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

test("existing scheduler retains banner data on startup and wakes at the next database deadline", async () => {
  const source = (await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8"))
    .replace(/^import .*;\n/gm, "")
    .replace(/^export /gm, "")
    .replace("import.meta.url", '"file:///mock-scheduler.mjs"');
  const timers = [];
  let deletions = 0;
  runInNewContext(source, {
    pg: { Client: class {
      async connect() {}
      async end() {}
      async query(sql) {
        if (sql.includes("DELETE FROM announcement_campaigns")) deletions++;
        return { rows: sql.includes("MIN(ends_at)") ? [{ delay: 2500 }] : [] };
      }
    } },
    Date, Intl, console: { info() {}, error() {} },
    process: { argv: ["node", "/mock-scheduler.mjs"], env: { DATABASE_URL: "mock" }, on() {} },
    setTimeout: (callback, delay) => { timers.push({ callback, delay }); return 1; }, clearTimeout() {},
    pathToFileURL: () => ({ href: "file:///mock-scheduler.mjs" })
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(deletions, 0);
  const next = timers.find((timer) => timer.callback.name === "runBannerCleanup");
  assert.equal(next?.delay, 2500);
  await next.callback();
  assert.equal(deletions, 0);
});
