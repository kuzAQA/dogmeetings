import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { ChatEvents, chatEventStream, parseChatChange } from "./chat-events.ts";

const a = "10000000-0000-4000-8000-000000000001";
const b = "10000000-0000-4000-8000-000000000002";
const dialogId = "20000000-0000-4000-8000-000000000001";
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

class Listener extends EventEmitter {
  connects = 0;
  listens = 0;
  ends = 0;
  async connect() { this.connects++; }
  async query() { this.listens++; }
  async end() { this.ends++; }
}

test("NOTIFY validates identifiers, types and sequences", () => {
  assert.equal(parseChatChange("broken"), null);
  assert.equal(parseChatChange(JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: -1 })), null);
  assert.equal(parseChatChange(JSON.stringify({ type: "read", userIds: ["bad"], dialogId })), null);
  assert.equal(parseChatChange(JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: 1, text: "private" })), null);
  assert.deepEqual(parseChatChange(JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: 1 })),
    { type: "message", userIds: [a], dialogId, messageSeq: 1 });
});

test("concurrent subscribers share LISTEN and count queries; private messages only reach recipients", async () => {
  const listener = new Listener();
  let queries = 0;
  const hub = new ChatEvents(() => listener, async () => { queries++; return { unreadCount: 0, expiresInMs: null }; });
  const received: unknown[][] = [[], [], []];
  const close = [0, 0, 0];
  const unsub = await Promise.all([a, a, b].map((user, i) => hub.subscribe(user, {
    send: (event, data) => { received[i].push({ event, data }); }, close: () => { close[i]++; }
  })));
  await tick();
  assert.equal(listener.connects, 1);
  assert.equal(listener.listens, 1);
  assert.equal(queries, 2);
  listener.emit("notification", { channel: "dogmeet_chat", payload: JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: 1 }) });
  await tick();
  assert.equal(queries, 3);
  assert.equal(received[0].length, 3);
  assert.equal(received[1].length, 3);
  assert.equal(received[2].length, 1);
  listener.emit("error", new Error("connection lost"));
  assert.deepEqual(close, [1, 1, 1]);
  unsub.forEach(fn => fn());
  await tick();
  assert.equal(listener.ends, 1);
  assert.equal(listener.listenerCount("notification"), 0);
});

test("a change during the snapshot discards the stale count; expiration refreshes without polling", async () => {
  const listener = new Listener();
  let release!: (value: { unreadCount: number; expiresInMs: number | null }) => void;
  let queries = 0;
  const hub = new ChatEvents(() => listener, async () => {
    queries++;
    if (queries === 1) return new Promise(resolve => { release = resolve; });
    return { unreadCount: queries === 2 ? 1 : 0, expiresInMs: queries === 2 ? 10 : null };
  });
  const counts: number[] = [];
  const unsub = await hub.subscribe(a, { send: (event, data) => { if (event === "unread") counts.push(data.unreadCount as number); }, close() {} });
  listener.emit("notification", { channel: "dogmeet_chat", payload: JSON.stringify({ type: "read", userIds: [a], dialogId }) });
  release({ unreadCount: 99, expiresInMs: null });
  await tick();
  assert.deepEqual(counts, [1]);
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.deepEqual(counts, [1, 0]);
  assert.equal(queries, 3);
  unsub();
  await tick();
  assert.equal(listener.ends, 1);
});

test("heartbeat reads no SQL; cancellation, expired sessions and lifetime release resources", async t => {
  t.mock.timers.enable({ apis: ["Date", "setInterval", "setTimeout"], now: Date.now() });
  const listener = new Listener();
  let queries = 0;
  const hub = new ChatEvents(() => listener, async () => { queries++; return { unreadCount: 2, expiresInMs: null }; });
  const request = new Request("http://localhost/api/dialogs/events");
  const response = chatEventStream(request, { clientId: a, expiresAt: new Date(Date.now() + 60000) }, hub);
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  assert.match(decoder.decode((await reader.read()).value), /retry: 5000/);
  assert.match(decoder.decode((await reader.read()).value), /"unreadCount":2/);
  t.mock.timers.tick(25000);
  assert.match(decoder.decode((await reader.read()).value), /heartbeat/);
  assert.equal(queries, 1);
  await reader.cancel();
  assert.equal(listener.ends, 1);
  const next = chatEventStream(request, { clientId: a, expiresAt: new Date(Date.now() + 1000) }, hub).body!.getReader();
  await next.read(); await next.read();
  t.mock.timers.tick(1000);
  assert.equal((await next.read()).done, true);
  assert.equal(listener.ends, 2);
  const capped = chatEventStream(request, { clientId: a, expiresAt: new Date(Date.now() + 3600000) }, hub).body!.getReader();
  await capped.read(); await capped.read();
  t.mock.timers.tick(300000);
  while (!(await capped.read()).done) { /* Drain bounded heartbeat frames. */ }
  assert.equal(listener.ends, 3);
});

test("slow consumers have a bounded queue; already aborted streams never connect", async () => {
  const listener = new Listener();
  const hub = new ChatEvents(() => listener, async () => ({ unreadCount: 0, expiresInMs: null }));
  const request = new Request("http://localhost/api/dialogs/events");
  const stream = chatEventStream(request, { clientId: a, expiresAt: new Date(Date.now() + 3600000) }, hub);
  await tick();
  for (let i = 1; i < 40; i++) listener.emit("notification", { channel: "dogmeet_chat", payload: JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: i }) });
  await tick();
  assert.equal(listener.ends, 1);
  const reader = stream.body!.getReader();
  let frames = 0;
  while (!(await reader.read()).done) frames++;
  assert.ok(frames <= 16);
  const abort = new AbortController(); abort.abort();
  const ended = chatEventStream(new Request(request, { signal: abort.signal }), { clientId: a, expiresAt: new Date() }, hub);
  assert.equal((await ended.body!.getReader().read()).done, true);
  assert.equal(listener.connects, 1);
});

test("listener failure throttles retries and every reconnection reads a fresh snapshot", async t => {
  t.mock.timers.enable({ apis: ["Date"], now: Date.now() });
  const listeners: Listener[] = [];
  let queries = 0;
  const hub = new ChatEvents(() => { const listener = new Listener(); listeners.push(listener); return listener; },
    async () => ({ unreadCount: ++queries, expiresInMs: null }));
  let closed = 0;
  const sink = { send() {}, close() { closed++; } };
  const remove = await hub.subscribe(a, sink);
  listeners[0].emit("error", new Error("DB lost"));
  assert.equal(closed, 1);
  await assert.rejects(hub.subscribe(a, sink), /reconnecting/);
  assert.equal(listeners.length, 1);
  t.mock.timers.tick(5000);
  const next = await hub.subscribe(a, sink);
  assert.equal(listeners.length, 2);
  assert.equal(queries, 2);
  remove(); next();
  assert.equal(listeners[1].ends, 1);
});

test("remount waits for the old listener to finish closing before opening its replacement", async () => {
  let finishClosing!: () => void;
  let created = 0;
  const listener = new Listener();
  listener.end = async () => { listener.ends++; await new Promise<void>(resolve => { finishClosing = resolve; }); };
  const hub = new ChatEvents(() => { created++; return created === 1 ? listener : new Listener(); },
    async () => ({ unreadCount: 0, expiresInMs: null }));
  const sink = { send() {}, close() {} };
  const remove = await hub.subscribe(a, sink);
  remove();
  const replacement = hub.subscribe(a, sink);
  await tick();
  try { assert.equal(created, 1); } finally { finishClosing(); }
  const stop = await replacement;
  assert.equal(created, 2);
  stop();
});

test("handoff from the last subscriber preserves LISTEN while the new subscriber is registering", async () => {
  const listener = new Listener();
  const hub = new ChatEvents(() => listener, async () => ({ unreadCount: 0, expiresInMs: null }));
  const remove = await hub.subscribe(a, { send() {}, close() {} });
  let incoming = 0;
  const pending = hub.subscribe(a, { send(event) { if (event === "message") incoming++; }, close() {} });
  remove();
  const next = await pending;
  listener.emit("notification", { channel: "dogmeet_chat", payload: JSON.stringify({ type: "message", userIds: [a], dialogId, messageSeq: 1 }) });
  assert.equal(incoming, 1);
  assert.equal(listener.ends, 0);
  next();
  assert.equal(listener.ends, 1);
});
