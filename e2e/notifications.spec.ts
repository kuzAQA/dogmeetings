import { expect, test } from "@playwright/test";
import { pushMock } from "./push-fixtures";

test("notification menu opens both channels without changing delivery; Push needs confirmation", async ({ page }) => {
  await pushMock(page, true, { permission: "granted" });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.locator("button.menu-row").filter({ hasText: "Уведомления" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("Telegram");
  await expect(dialog).toContainText("Push-уведомления");
  expect(await page.evaluate(() => window.dogmeetPushTest.calls)).toEqual([]);
  await dialog.getByRole("button", { name: /Push-уведомления/ }).click();
  expect(await page.evaluate(() => window.dogmeetPushTest.calls)).toEqual([]);
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.dogmeetPushTest.calls)).toContain("server-subscribe");
});

for (const subscribed of [true, false]) {
  test(`Telegram requires dialog confirmation and active walks subscription: ${subscribed}`, async ({ page }) => {
    await pushMock(page);
    let enabled = false;
    let updates = 0;
    await page.route("**/api/telegram/notifications", async route => {
      if (route.request().method() === "PATCH") { enabled = route.request().postDataJSON().enabled; updates++; }
      await route.fulfill({ json: { enabled, subscribed } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
    await page.locator("button.menu-row").filter({ hasText: "Уведомления" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Telegram/ }).click();
    expect(updates).toBe(0);
    await expect(dialog).toContainText("Текст сообщения останется на сайте");
    if (!subscribed) {
      await expect(dialog.getByRole("button", { name: "Открыть Telegram-бота", exact: true })).toBeEnabled();
      await expect(dialog.getByRole("button", { name: "Подключить Telegram", exact: true })).toHaveCount(0);
      return;
    }
    await dialog.getByRole("button", { name: "Подключить Telegram", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /^Telegram/ })).toContainText("Включено");
    expect(updates).toBe(1);
    await dialog.getByRole("button", { name: /^Telegram/ }).click();
    expect(updates).toBe(1);
    await dialog.getByRole("button", { name: "Отключить Telegram", exact: true }).click();
    await expect(dialog.getByRole("button", { name: /^Telegram/ })).toContainText("Отключено");
    expect(updates).toBe(2);
  });
}
