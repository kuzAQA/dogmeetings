import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
const worker = source.slice(source.indexOf("async function runNotificationRetry()"), source.indexOf("async function runTelegramCallbackPolling()"));

function fixture({ locationRetry = async () => {}, walkRetry = async () => {}, connectError = false } = {}) {
  const clients = [], timers = [], cleared = [], errors = [];
  class Client {
    handlers = {};
    queries = [];
    constructor() { clients.push(this); }
    on(event, callback) { this.handlers[event] = callback; }
    async connect() { if (connectError) throw new Error("offline"); }
    async end() { this.ended = true; this.handlers.end?.(); }
    async query(sql) { this.queries.push(sql); }
  }
  const context = runInNewContext(`
    let notificationTimer, notificationListener, notificationListenerTimer;
    let notificationRetryRunning = false, notificationRetryRequested = false;
    const NOTIFICATION_RETRY_DELAY_MS = 60000;
    let notificationRetryAt = Infinity;
    ${worker}
    ({ startTelegramQueueListener, runNotificationRetry, setRetryAt: time => { notificationRetryAt = time; } });
  `, {
    Client, Date, connectionString: () => "mock", retryLocationRequestNotifications: locationRetry,
    retryWalkTelegramNotifications: walkRetry,
    setTimeout: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; },
    clearTimeout: timer => cleared.push(timer),
    console: { info() {}, error: (...args) => errors.push(args) }
  });
  return { ...context, clients, timers, cleared, errors };
}

const flush = () => new Promise(resolve => setImmediate(resolve));

test("committed queue signal starts processing immediately and clears the fallback timer", async () => {
  let runs = 0;
  const f = fixture({ walkRetry: async () => runs++ });
  await f.startTelegramQueueListener();
  await flush();
  assert.deepEqual(f.clients[0].queries, ["LISTEN dogmeet_walk_telegram"]);
  assert.equal(runs, 1);
  f.clients[0].handlers.notification({ channel: "unrelated" });
  await flush();
  assert.equal(runs, 1);
  f.clients[0].handlers.notification({ channel: "dogmeet_walk_telegram" });
  await flush();
  assert.equal(runs, 2);
  assert.equal(f.cleared.length, 1);
  assert.equal(f.timers.at(-1).delay, 60000);
});

test("bursts during delivery queue one immediate rerun without overlapping workers", async () => {
  let release, runs = 0, active = 0;
  const f = fixture({ walkRetry: async () => {
    runs++;
    assert.equal(++active, 1);
    if (runs === 1) await new Promise(resolve => { release = resolve; });
    active--;
  } });
  await f.startTelegramQueueListener();
  await flush();
  for (let i = 0; i < 10; i++) f.clients[0].handlers.notification({ channel: "dogmeet_walk_telegram" });
  await flush();
  assert.equal(runs, 1);
  release();
  await flush();
  assert.equal(f.timers.at(-1).delay, 0);
  await f.timers.at(-1).callback();
  assert.equal(runs, 2);
  assert.equal(f.timers.at(-1).delay, 60000);
});

test("listener disconnect schedules reconnection and drains missed jobs after reconnect", async () => {
  let runs = 0;
  const f = fixture({ walkRetry: async () => runs++ });
  await f.startTelegramQueueListener();
  await flush();
  f.clients[0].handlers.error(new Error("connection lost"));
  assert.equal(f.clients[0].ended, true);
  assert.equal(f.errors.length, 1);
  assert.equal(f.timers.at(-1).delay, 5000);
  await f.timers.at(-1).callback();
  await flush();
  assert.equal(f.clients.length, 2);
  assert.equal(runs, 2);
});

test("connection and delivery failures leave periodic recovery enabled", async () => {
  const f = fixture({ connectError: true, walkRetry: async () => { throw new Error("Telegram unavailable"); } });
  await f.startTelegramQueueListener();
  assert.equal(f.timers.at(-1).delay, 5000);
  await f.runNotificationRetry();
  assert.equal(f.timers.at(-1).delay, 60000);
  assert.equal(f.errors.length, 2);
});

test("a new wakeup preserves the absolute retry_after deadline", async t => {
  let now = 1000;
  t.mock.method(Date, "now", () => now);
  const f = fixture();
  f.setRetryAt(11_000);
  await f.startTelegramQueueListener();
  await flush();
  assert.equal(f.timers.at(-1).delay, 10_000);
  now = 6000;
  f.clients[0].handlers.notification({ channel: "dogmeet_walk_telegram" });
  await flush();
  assert.equal(f.timers.at(-1).delay, 5000);
});
