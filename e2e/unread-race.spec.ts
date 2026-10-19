import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test("a stale unread response cannot clear a new incoming message during a visible-read race", async ({ page }) => {
  await mockApp(page);
  const id = "30000000-0000-4000-8000-000000000001";
  const dialog = { id, peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Луна • Анна" },
    hiddenThrough: 0, expiresAt: new Date(Date.now() + 3600000).toISOString() };
  const message = { seq: 1, requestId: "50000000-0000-4000-8000-000000000001", mine: false,
    text: "Первое сообщение", createdAt: new Date().toISOString(), readAt: null };
  let unreadRequests = 0, readRequests = 0;
  let release = () => {};
  const stale = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/dialogs**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") { readRequests++; return route.fulfill({ json: { read: true } }); }
    if (url.searchParams.has("unread")) {
      unreadRequests++;
      if (unreadRequests === 2) { await stale; return route.fulfill({ json: { unreadCount: 0 } }); }
      return route.fulfill({ json: { unreadCount: 1 } });
    }
    if (url.pathname.endsWith("/messages")) return route.fulfill({ json: { dialog, messages: [message], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString() } });
    const lastMessage = readRequests ? { ...message, seq: 2, text: "Новое во время прочтения" } : message;
    return route.fulfill({ json: { dialogs: [{ ...dialog, lastMessage, unreadCount: 1 }], nextCursor: null } });
  });
  await page.goto("/");
  await expect(page.locator(".header-menu .unread-dot")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("dogmeet-chat-changed")));
  await expect.poll(() => unreadRequests).toBe(2);
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: /Диалоги Сообщите/ }).click();
  await page.locator(".chat-list-open").click();
  await expect.poll(() => readRequests).toBeGreaterThan(0);
  release();
  await expect.poll(() => unreadRequests).toBeGreaterThanOrEqual(3);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".chat-list-row")).toHaveClass(/is-unread/);
  await expect(page.locator(".chat-list-row")).toContainText("Новое во время прочтения");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".menu-row .unread-dot")).toBeVisible();
});
