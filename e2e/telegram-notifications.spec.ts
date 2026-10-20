import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockApp(page);
  await page.route("**/api/dialogs**", route => route.fulfill({ json: { dialogs: [], unreadCount: 0, nextCursor: null } }));
});

for (const [status, label, action, purpose] of [
  ["unknown", "Неизвестна", "Проверить", "messages-check"],
  ["active", "Активна", "Отписаться", "messages-unsubscribe"],
  ["inactive", "Неактивна", "Подключить", "messages-subscribe"],
] as const) {
  test(`Telegram status ${status} opens the matching bot scenario without PATCH`, async ({ page }) => {
    const methods: string[] = [];
    let requested = "";
    await page.route("**/api/telegram/notifications", route => {
      methods.push(route.request().method());
      return route.fulfill({ json: { status, enabled: status === "active", subscribed: status === "active" } });
    });
    await page.route("**/api/telegram/subscription-link", route => {
      requested = route.request().postDataJSON().purpose;
      return route.fulfill({ json: { link: "https://t.me/DogmeetBot?start=test" } });
    });
    await page.route("https://t.me/**", route => route.fulfill({ body: "Telegram test destination" }));
    await page.goto("/");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
    const row = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
    await expect(row.locator(":scope > small")).toHaveText(label);
    await row.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toContainText("Текст сообщения останется на сайте");
    await dialog.getByRole("button", { name: action, exact: true }).click();
    await expect(page).toHaveURL(/t\.me/);
    expect(requested).toBe(purpose);
    expect(methods.every(method => method === "GET")).toBe(true);
  });
}

test("returning from Telegram refreshes closed menu, open dialog and reload without polling", async ({ page }) => {
  let status = "unknown";
  let reads = 0;
  await page.route("**/api/telegram/notifications", route => {
    reads++;
    return route.fulfill({ json: { status, enabled: status === "active", subscribed: status === "active" } });
  });
  await page.goto("/");
  await expect.poll(() => reads).toBeGreaterThan(0);
  status = "active";
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  const row = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
  await expect(row.locator(":scope > small")).toHaveText("Активна");
  await row.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Отписаться", exact: true })).toBeVisible();
  status = "inactive";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(dialog.getByRole("button", { name: "Подключить", exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(row.locator(":scope > small")).toHaveText("Неактивна");
  await page.reload();
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await expect(page.locator("button.menu-row").filter({ hasText: "Уведомления" }).locator(":scope > small")).toHaveText("Неактивна");
});

test("status request failure offers a non-mutating check", async ({ page }) => {
  await page.route("**/api/telegram/notifications", route => route.fulfill({ status: 503, json: { error: "Недоступно" } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.locator("button.menu-row").filter({ hasText: "Уведомления" }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Проверить", exact: true })).toBeEnabled();
});
