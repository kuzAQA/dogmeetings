import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("site sharing preserves the menu, fits the screen and restores keyboard focus", async ({ page }, testInfo) => {
  await openNearby(page);
  const menu = page.getByRole("button", { name: "Мой район и настройки", exact: true });
  const dialog = page.getByRole("dialog", { name: "Поделиться сайтом", exact: true });
  const share = page.getByRole("button", { name: "Поделиться сайтом QR-код для ваших друзей", exact: true });

  async function openShare() {
    if (await menu.count()) await menu.click();
    await expect(page.locator(".profile-screen .menu-row").first()).toHaveAccessibleName("Поделиться сайтом QR-код для ваших друзей");
    await share.focus();
    await page.keyboard.press("Enter");
    await expect(dialog).toBeVisible();
    await expect(page.locator(".profile-screen")).toHaveCount(1);
  }

  await openShare();
  await expect(dialog.getByRole("heading", { name: "Поделиться сайтом" })).toBeVisible();
  const qr = dialog.getByRole("img", { name: "QR-код сайта https://dogmeet.ru" });
  await expect(qr).toBeVisible();
  await qr.screenshot({ path: testInfo.outputPath("site-qr.png") });
  await page.screenshot({ path: testInfo.outputPath("site-share.png") });
  const bounds = (await dialog.boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(viewport.width);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(viewport.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);

  const close = dialog.getByRole("button", { name: "Закрыть", exact: true });
  const done = dialog.getByRole("button", { name: "Готово", exact: true });
  await close.focus();
  await page.keyboard.press("Shift+Tab");
  await expect(done).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();

  for (const method of ["done", "close", "escape", "backdrop"]) {
    if (method !== "done") await openShare();
    if (method === "done") await done.click();
    if (method === "close") await close.click();
    if (method === "escape") await page.keyboard.press("Escape");
    if (method === "backdrop") await page.locator(".sheet-backdrop").click({ position: { x: 5, y: 5 } });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Мой район и настройки" })).toBeVisible();
    await expect(share).toBeFocused();
  }
});
