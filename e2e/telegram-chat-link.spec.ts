import { expect, test } from "@playwright/test";
import { location, mockApp } from "./fixtures";

const dialogId = "30000000-0000-4000-8000-000000000001";

for (const restoreSession of [false, true]) {
  test(`Telegram link opens the requested dialog after session readiness: restore=${restoreSession}`, async ({ page }) => {
    await mockApp(page);
    let ready = !restoreSession;
    let release!: () => void;
    const sessionGate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/session", async route => {
      if (route.request().method() === "POST") {
        await sessionGate;
        ready = true;
      }
      return route.fulfill({ status: ready ? 200 : 401, json: ready ? { hasLocation: true, location } : { error: "Нет сессии" } });
    });
    const requested: string[] = [];
    await page.route("**/api/dialogs**", route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.endsWith("/messages")) return route.fulfill({ json: { unreadCount: 0 } });
      requested.push(path);
      return route.fulfill({ json: {
        dialog: { id: dialogId, peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Луна • Анна", photoUrl: null }, hiddenThrough: 0, expiresAt: null },
        messages: [], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString()
      } });
    });
    await page.goto(`/?dialog=${dialogId}`);
    if (restoreSession) {
      await expect(page).toHaveURL(new RegExp(`dialog=${dialogId}`));
      expect(requested).toEqual([]);
      release();
    }
    await expect(page.getByRole("heading", { name: "Луна • Анна", exact: true })).toBeVisible();
    expect(requested.length).toBeGreaterThan(0);
    expect(requested.every(path => path === `/api/dialogs/${dialogId}/messages`)).toBe(true);
    await expect(page).not.toHaveURL(/dialog=/);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Луна • Анна", exact: true })).toBeVisible();
  });
}

test("a Telegram link to someone else's dialog stays unavailable without messages", async ({ page }) => {
  await mockApp(page);
  await page.route("**/api/dialogs**", route => route.fulfill(
    new URL(route.request().url()).pathname.endsWith("/messages")
      ? { status: 404, json: { error: "Диалог не найден или уже удалён." } }
      : { json: { unreadCount: 0 } }
  ));
  await page.goto(`/?dialog=${dialogId}`);
  await expect(page.getByRole("status")).toContainText("Переписка удалена у обоих участников.");
  await expect(page.getByRole("textbox", { name: "Сообщение", exact: true })).toBeDisabled();
  await expect(page.locator(".chat-message")).toHaveCount(0);
});
