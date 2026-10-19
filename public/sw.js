/* Push only: private pages and API responses are never cached. */
self.addEventListener("install", event => event.waitUntil(self.skipWaiting()));
self.addEventListener("activate", event => event.waitUntil(self.clients.claim()));

function openStore() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("dogmeet-push", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("events");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function seenEvent(id, write = false) {
  const db = await openStore();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction("events", write ? "readwrite" : "readonly");
      const store = tx.objectStore("events");
      let seen = false;
      if (write) {
        store.put(Date.now(), id);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (!row) return;
          if (row.value < Date.now() - 72 * 3600000) row.delete();
          row.continue();
        };
      } else {
        const request = store.get(id);
        request.onsuccess = () => { seen = Boolean(request.result); };
      }
      tx.oncomplete = () => resolve(seen);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

const dialogPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
let pushChain = Promise.resolve();
self.addEventListener("push", event => {
  pushChain = pushChain.catch(() => {}).then(async () => {
    let payload;
    try { payload = event.data?.json(); } catch { return; }
    if (!dialogPattern.test(payload?.dialogId) || typeof payload?.eventId !== "string"
      || !payload.eventId.startsWith(payload.dialogId + ":") || !/^\d+$/.test(payload.eventId.slice(37))) return;
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clients) client.postMessage({ type: "dogmeet-chat-push" });
    if (await seenEvent(payload.eventId).catch(() => false)) return;
    await self.registration.showNotification("Новое сообщение в Диалогах", {
      icon: "/icons/dogmeet-192.png", badge: "/icons/dogmeet-192.png",
      tag: payload.eventId, renotify: false,
      data: { dialogId: payload.dialogId, eventId: payload.eventId }
    });
    await seenEvent(payload.eventId, true).catch(() => {});
  });
  event.waitUntil(pushChain);
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const id = event.notification.data?.dialogId;
  if (!dialogPattern.test(id)) return;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = clients.find(client => {
      const url = new URL(client.url);
      return url.origin === self.location.origin && url.pathname === "/";
    });
    if (existing) {
      await existing.focus();
      const channel = new MessageChannel();
      let timer;
      const opened = await new Promise(resolve => {
        channel.port1.onmessage = event => resolve(event.data === "opened");
        timer = setTimeout(() => resolve(false), 1000);
        existing.postMessage({ type: "dogmeet-open-dialog", dialogId: id }, [channel.port2]);
      });
      clearTimeout(timer); channel.port1.close(); channel.port2.close();
      // A loading tab may not have installed the application listener yet.
      if (!opened) await existing.navigate(new URL(`/?dialog=${encodeURIComponent(id)}`, self.location.origin).href);
    } else await self.clients.openWindow(new URL(`/?dialog=${encodeURIComponent(id)}`, self.location.origin).href);
  })());
});
