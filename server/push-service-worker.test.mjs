import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import test from "node:test";

const source = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const id = "30000000-0000-4000-8000-000000000001";
function worker(store = new Set(), clients = []) {
  const handlers = {}, notifications = [], opened = [];
  class MessageChannel {
    port1 = { onmessage: null, close() {} };
    port2 = { postMessage: data => queueMicrotask(() => this.port1.onmessage?.({ data })), close() {} };
  }
  const context = { URL, console, MessageChannel, setTimeout, clearTimeout, self: { location: { origin: "https://dogmeet.example" },
    addEventListener: (name, handler) => { handlers[name] = handler; },
    registration: { showNotification: async (...args) => { notifications.push(args); } },
    clients: { matchAll: async () => clients, openWindow: async url => { opened.push(url); } }
  }, store };
  runInNewContext(source + "\nseenEvent = async (id, write) => { if (write) store.add(id); return store.has(id); };", context);
  return { notifications, opened,
    push: async payload => { let promise; handlers.push({ data: { json: () => payload }, waitUntil: value => { promise = value; } }); await promise; },
    click: async dialogId => { let promise; handlers.notificationclick({ notification: { close() {}, data: { dialogId } }, waitUntil: value => { promise = value; } }); await promise; }
  };
}

test("stable events deduplicate concurrent pushes and service worker restarts", async () => {
  const stored = new Set(), messages = [];
  const w = worker(stored, [{ postMessage: message => messages.push(message) }]);
  const payload = { title: "untrusted", dialogId: id, eventId: `${id}:1`, text: "private text" };
  await Promise.all([w.push(payload), w.push(payload)]);
  assert.equal(w.notifications.length, 1);
  assert.equal(w.notifications[0][0], "Новое сообщение в Диалогах");
  assert.equal(w.notifications[0][1].tag, `${id}:1`);
  assert.equal(JSON.stringify(w.notifications).includes("private text"), false);
  assert.equal(messages.length, 2);
  const restarted = worker(stored); await restarted.push(payload);
  assert.equal(restarted.notifications.length, 0);
});

test("click focuses an existing same-origin root tab or opens a validated dialog URL", async () => {
  const messages = []; let focused = false;
  const w = worker(new Set(), [{ url: "https://evil.test/", postMessage() { throw new Error("foreign tab"); } },
    { url: "https://dogmeet.example/", postMessage: (message, ports) => { messages.push(message); ports[0].postMessage("opened"); }, focus: async () => { focused = true; } }]);
  await w.click(id); assert.equal(focused, true); assert.equal(messages[0].dialogId, id); assert.equal(w.opened.length, 0);
  const fresh = worker(); await fresh.click(id);
  assert.deepEqual(fresh.opened, [`https://dogmeet.example/?dialog=${id}`]);
  await fresh.click("https://evil.test/"); assert.equal(fresh.opened.length, 1);
});

test("a loading tab without a message listener falls back to a same-origin dialog navigation", async () => {
  const navigated = [];
  const w = worker(new Set(), [{ url: "https://dogmeet.example/", postMessage() {}, focus: async () => {}, navigate: async url => navigated.push(url) }]);
  await w.click(id);
  assert.deepEqual(navigated, [`https://dogmeet.example/?dialog=${id}`]);
});

test("invalid events never create notifications", async () => {
  const w = worker();
  for (const payload of [null, {}, { dialogId: id, eventId: "foreign:1" }, { dialogId: "https://evil.test/", eventId: "event" }]) await w.push(payload);
  assert.equal(w.notifications.length, 0);
});
