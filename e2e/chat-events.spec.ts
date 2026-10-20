import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test("home receives notifications without polling the unread counter for 31 seconds", async ({ page }) => {
  test.setTimeout(45000);
  let unreadRequests = 0;
  let eventRequests = 0;
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
  await mockApp(page);
  await page.route("**/api/dialogs/events", route => {
    eventRequests++;
    return route.fulfill({ contentType: "text/event-stream", body: 'retry: 60000\n\nevent: unread\ndata: {"unreadCount":2}\n\n' });
  });
  await page.route("**/api/dialogs?unread=1", route => {
    unreadRequests++;
    return route.fulfill({ json: { unreadCount: 0 } });
  });
  await page.goto("/");
  await expect(page.locator(".walk-summary").first()).toBeVisible();
  await page.waitForTimeout(31000);
  console.log(`Unread counter HTTP requests in 31 seconds: ${unreadRequests}`);
  expect(unreadRequests).toBe(0);
  expect(eventRequests).toBe(1);
});

const dialogId = "30000000-0000-4000-8000-000000000001";
declare global {
  interface Window { chatSources: Array<EventTarget & { closed: boolean; url: string }>; }
}

async function notifications(page: import("@playwright/test").Page) {
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
  await page.addInitScript(() => {
    window.chatSources = [];
    class Source extends EventTarget {
      closed = false;
      url: string;
      constructor(url: string) {
        super(); this.url = url; window.chatSources.push(this);
      }
      close() { this.closed = true; }
    }
    window.EventSource = Source as unknown as typeof EventSource;
  });
  await mockApp(page);
  await page.route(`**/api/dialogs/${dialogId}/messages?*`, route => route.fulfill({ json: {
    dialog: { id: dialogId, peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Луна • Анна", photoUrl: "/dog-luna.webp" }, expiresAt: null, hiddenThrough: 0 },
    messages: [], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString()
  } }));
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.chatSources.length)).toBe(1);
}

test("snapshot is quiet; incoming banner opens its dialog once and preserves focus", async ({ page }, testInfo) => {
  await notifications(page);
  const banner = page.locator(".chat-notification");
  await page.evaluate(() => window.chatSources[0].dispatchEvent(new MessageEvent("unread", { data: '{"unreadCount":2}' })));
  await expect(banner).toBeEmpty();
  const menu = page.getByRole("button", { name: "Мой район и настройки" });
  await menu.focus();
  const incoming = async (seq: number) => page.evaluate(({ dialogId, seq }) => {
    window.chatSources.at(-1)!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ dialogId, messageSeq: seq }) }));
  }, { dialogId, seq });
  await incoming(1);
  await expect(banner).toContainText("Новое сообщение");
  await expect(menu).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("chat-notification.png") });
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await incoming(1);
  await expect(banner).toBeEmpty();
  await incoming(2);
  await page.getByRole("button", { name: "Открыть диалог", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение", exact: true })).toBeVisible();
  await incoming(3);
  await expect(banner).toBeEmpty();
  expect(await page.evaluate(() => window.chatSources.length)).toBe(1);
});

test("hidden tabs close SSE; return opens exactly one fresh stream without polling", async ({ page }) => {
  let unreadRequests = 0;
  await page.route("**/api/dialogs?unread=1", route => { unreadRequests++; return route.fulfill({ json: { unreadCount: 0 } }); });
  await notifications(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => window.chatSources.filter(source => !source.closed).length)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => window.chatSources.length)).toBe(2);
  await page.evaluate(() => {
    window.chatSources[1].dispatchEvent(new MessageEvent("unread", { data: '{"unreadCount":3}' }));
    window.chatSources[1].dispatchEvent(new Event("error"));
    window.dispatchEvent(new Event("dogmeet-chat-changed"));
  });
  await page.clock.fastForward(31000);
  expect(unreadRequests).toBe(0);
  expect(await page.evaluate(() => window.chatSources.length)).toBe(2);
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await expect(page.getByRole("button", { name: /Диалоги/ }).getByRole("img", { name: "Есть непрочитанные сообщения" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("dogmeet-session-changed")));
  expect(await page.evaluate(() => window.chatSources.length)).toBe(3);
  expect(await page.evaluate(() => window.chatSources.filter(source => !source.closed).length)).toBe(1);
});
