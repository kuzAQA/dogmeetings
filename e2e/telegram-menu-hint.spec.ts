import { expect, test } from "@playwright/test";
import { mockApp, openNearby } from "./fixtures";

const seenKey = "dogmeet.telegramMenuHintSeen";
const hintText = "Откройте меню, чтобы получать уведомления о прогулках в Telegram";

test("keeps the hint across dock tabs and closes ten seconds after the first display", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.clock.install();
  await openNearby(page);
  const hint = page.locator(".telegram-menu-hint");
  await expect(hint).toBeVisible();
  await expect(hint.locator("span")).toHaveText(hintText);
  expect((await page.context().cookies()).find((cookie) => cookie.name === seenKey)).toMatchObject({ value: "1", expires: -1 });
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe("BODY");

  await page.clock.pauseAt(new Date(Date.now() + 100));
  await page.clock.runFor(5_000);
  for (const tab of ["Мои планы", "Питомцы", "Рядом"]) {
    await page.getByRole("navigation", { name: "Основная навигация" }).getByRole("button", { name: tab, exact: true }).click();
    await page.clock.runFor(200);
    await expect(hint).toBeVisible();
  }
  await page.clock.runFor(3_500);
  await expect(hint).toBeVisible();
  await page.clock.runFor(1_000);
  await expect(hint).toHaveCount(0);

  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.clock.runFor(100);
  await expect(hint).toHaveCount(0);
});

test("close button works from the keyboard and does not show again on reload", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  const close = page.getByRole("button", { name: "Закрыть подсказку", exact: true });
  await expect(close).toBeVisible();
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).focus();
  await page.keyboard.press("Tab");
  await expect(close).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await expect(page.locator(".my-walks-screen")).toBeVisible();
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(close).toHaveCount(0);
});

test("opening the menu dismisses the hint and preserves the menu action", async ({ page }) => {
  await page.clock.install();
  await openNearby(page);
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Мой район.*настройки/ })).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
});

test("opening a pet card dismisses the hint permanently for the session", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".pets-screen")).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
});

for (const screen of ["nearby", "plans"]) {
  test(`manage dismisses the hint on ${screen} without reopening it on close`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNearby(page);
    if (screen === "plans") await page.getByRole("button", { name: "Мои планы", exact: true }).click();
    await expect(page.locator(".telegram-menu-hint")).toBeVisible();
    await page.getByRole("button", { name: "Управлять", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Управление прогулкой" })).toBeVisible();
    await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
    await page.getByRole("dialog", { name: "Управление прогулкой" }).getByRole("button", { name: "Закрыть", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  });
}

test("opening a walk dismisses the hint without reopening it on return", async ({ page }) => {
  await openNearby(page);
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.locator(".walk-summary[role=button]").click();
  await expect(page.getByRole("heading", { name: "Встреча на прогулке", exact: true })).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
});

test("opening the walk form dismisses the hint without reopening it on return", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(page.getByLabel("Комментарий", { exact: false })).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".my-walks-screen")).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
});

test("an already open menu does not consume the first display", async ({ page }) => {
  await mockApp(page);
  await page.goto("/?telegram=notifications");
  await expect(page.locator(".profile-screen")).toBeVisible();
  expect((await page.context().cookies()).some((cookie) => cookie.name === seenKey)).toBe(false);
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  expect((await page.context().cookies()).find((cookie) => cookie.name === seenKey)?.value).toBe("1");
});

test("a new private browser session gets its own first display", async ({ page, browser }) => {
  await openNearby(page);
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  const privateSession = await browser.newContext({ baseURL: new URL(page.url()).origin });
  try {
    expect((await privateSession.cookies()).some((cookie) => cookie.name === seenKey)).toBe(false);
    const privatePage = await privateSession.newPage();
    await openNearby(privatePage);
    await expect(privatePage.locator(".telegram-menu-hint")).toBeVisible();
    expect((await privateSession.cookies()).find((cookie) => cookie.name === seenKey)).toMatchObject({ value: "1", expires: -1 });
  } finally {
    await privateSession.close();
  }
});

test("blocked cookies do not break the page or repeat the hint within the page session", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => {
    Object.defineProperty(document, "cookie", {
      get() { throw new DOMException("Blocked", "SecurityError"); },
      set() { throw new DOMException("Blocked", "SecurityError"); }
    });
  });
  await openNearby(page);
  await expect(page.locator(".telegram-menu-hint")).toBeVisible();
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await expect(page.locator(".profile-screen")).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(page.locator(".telegram-menu-hint")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("matches the reference at 320, 375 and 1440 px without covering the menu or text", async ({ page }) => {
  for (const width of [320, 375, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await mockApp(page);
    await page.goto("/");
    await page.context().clearCookies({ name: seenKey });
    await page.reload();
    const hint = page.locator(".telegram-menu-hint");
    await expect(hint).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const geometry = await hint.evaluate((element) => {
      const bubble = element.getBoundingClientRect();
      const menu = document.querySelector(".header-menu > button")!.getBoundingClientRect();
      const text = element.querySelector("span")!.getBoundingClientRect();
      const close = element.querySelector("button")!.getBoundingClientRect();
      const pointer = getComputedStyle(element, "::before");
      return {
        left: bubble.left,
        right: bubble.right,
        top: bubble.top,
        menuBottom: menu.bottom,
        textRight: text.right,
        closeLeft: close.left,
        pointerCenter: bubble.right - parseFloat(pointer.right) - parseFloat(pointer.borderLeftWidth),
        menuCenter: menu.left + menu.width / 2,
        overflow: document.documentElement.scrollWidth - innerWidth,
        accent: getComputedStyle(element.querySelector("em")!).color,
        bell: getComputedStyle(element.querySelector("svg")!).color
      };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.top).toBeGreaterThan(geometry.menuBottom);
    expect(geometry.textRight).toBeLessThanOrEqual(geometry.closeLeft);
    expect(Math.abs(geometry.pointerCenter - geometry.menuCenter)).toBeLessThanOrEqual(1);
    expect(geometry.overflow).toBeLessThanOrEqual(0);
    expect(geometry.accent).toBe(geometry.bell);
    await page.screenshot({ path: `.impeccable/review/telegram-menu-hint-${width}.png`, animations: "disabled" });
    await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
    await expect(page.locator(".profile-screen")).toBeVisible();
  }
});
