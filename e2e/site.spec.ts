import { expect, test } from "@playwright/test";

import { mockApp, openNearby, walk } from "./fixtures";

test("ends the timeline cleanly and aligns comment icons", async ({ page }) => {
  await openNearby(page, { nearby: [walk, { ...walk, id: "10000000-0000-4000-8000-000000000002", walkTime: "19:30" }] });
  const rows = page.locator(".timeline .walk-row");
  await expect(rows).toHaveCount(2);
  expect(await rows.evaluateAll((items) => items.map((item) => ({
    vertical: getComputedStyle(item.querySelector(".time-column")!, "::after").display,
    marker: getComputedStyle(item.querySelector(".time-column i")!).display,
    horizontal: getComputedStyle(item.querySelector(".walk-summary")!).borderBottomStyle,
    commentIcon: item.querySelectorAll(".walk-comment svg").length
  })))).toEqual([
    { vertical: "block", marker: "block", horizontal: "solid", commentIcon: 1 },
    { vertical: "none", marker: "none", horizontal: "none", commentIcon: 1 }
  ]);
});

test("matches the mobile schedule shell and stays within the viewport", async ({ page }) => {
  await openNearby(page);
  const geometry = await page.evaluate(() => {
    const phone = document.querySelector<HTMLElement>(".phone")!;
    const dock = document.querySelector<HTMLElement>(".bottom-nav")!;
    const add = dock.querySelector<HTMLElement>(".dock-add")!.getBoundingClientRect();
    const icon = dock.querySelector<HTMLElement>(".action-icon")!.getBoundingClientRect();
    return { phone: phone.getBoundingClientRect().width, dock: dock.getBoundingClientRect().width, overflow: document.documentElement.scrollWidth - innerWidth, addIconOffset: Math.abs(add.x + add.width / 2 - icon.x - icon.width / 2) };
  });
  expect(geometry.phone).toBe(Math.min(390, page.viewportSize()!.width));
  expect(geometry.dock).toBeLessThanOrEqual(312);
  expect(geometry.overflow).toBeLessThanOrEqual(0);
  expect(geometry.addIconOffset).toBeLessThan(1);
  await expect(page.locator(".status-bar")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  if (page.viewportSize()?.width === 390) await page.screenshot({ path: ".impeccable/review/mobile.png", fullPage: true });
  if (page.viewportSize()?.width === 1280) await page.screenshot({ path: ".impeccable/review/desktop.png", fullPage: true });
});

test("centers the nearby menu and keeps the add action stable between plans and pets", async ({ page }) => {
  await openNearby(page);
  const dock = page.getByRole("navigation", { name: "Основная навигация" });
  const tabs = dock.locator(".nav-tabs");
  const add = dock.locator(".dock-add");
  const centered = () => page.evaluate(() => {
    const dockRect = document.querySelector<HTMLElement>(".bottom-nav")!.getBoundingClientRect();
    const tabsRect = document.querySelector<HTMLElement>(".nav-tabs")!.getBoundingClientRect();
    return Math.abs(dockRect.x + dockRect.width / 2 - tabsRect.x - tabsRect.width / 2);
  });

  await expect(add).toHaveCSS("opacity", "0");
  await expect.poll(centered).toBeLessThan(1);

  await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(add).toHaveCSS("opacity", "1");
  await expect.poll(() => add.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(0);
  const plansX = await add.evaluate((element) => element.getBoundingClientRect().x);

  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect.poll(() => add.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).m41)).toBe(0);
  expect(await add.evaluate((element) => element.getBoundingClientRect().x)).toBeCloseTo(plansX, 0);

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(add).toHaveCSS("opacity", "0");
  await expect.poll(centered).toBeLessThan(1);
  await expect(tabs).not.toHaveCSS("transform", "none");
});

test("keeps the active dock tab inert", async ({ page }) => {
  await openNearby(page);
  await expect(page.locator(".nearby-toolbar")).toHaveCSS("view-transition-name", "dogmeet-header");
  await page.evaluate(() => {
    const state = window as Window & { transitionStarts?: number };
    const start = document.startViewTransition?.bind(document);
    state.transitionStarts = 0;
    if (start) document.startViewTransition = (callback) => {
      state.transitionStarts = (state.transitionStarts ?? 0) + 1;
      return start(callback);
    };
  });

  const dock = page.getByRole("navigation", { name: "Основная навигация" });
  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(0);

  await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  const transitions = await page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts);
  await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { transitionStarts?: number }).transitionStarts)).toBe(transitions);
  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
});

test("filters the timeline through the mockup bottom sheet", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Весь день" }).click();
  const dialog = page.getByRole("dialog", { name: "Время прогулки" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: /Вечер/ }).click();
  await dialog.getByRole("button", { name: "Показать прогулки" }).click();
  await expect(page.getByRole("button", { name: "Вечер", exact: true })).toBeVisible();
});

test("opens plans and pets from the new dock", async ({ page }) => {
  await openNearby(page);
  const dock = page.getByRole("navigation", { name: "Основная навигация" });
  await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  await expect(dock.getByRole("button", { name: "Мои планы", exact: true })).toHaveAttribute("aria-current", "page");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(0);
});

test("opens the pet passport and preserves its actions", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Изменить данные", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Поделиться питомцем", exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: "Удалить питомца", exact: false })).toBeVisible();
});

test("opens the walk form with native time and preserved fields", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();
  await expect(page.getByLabel("Питомец")).toBeVisible();
  await page.getByRole("button", { name: /^Время/ }).click();
  await expect(page.locator('input[type="time"]')).toHaveAttribute("type", "time");
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  await expect(page.getByLabel("Комментарий", { exact: false })).toHaveAttribute("maxlength", "40");
});

test("blocks a walk until a pet is added", async ({ page }) => {
  await openNearby(page, { pets: [], mine: [] });
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Сначала питомец" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
});

test("shows the browser guide only inside an in-app browser", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  await page.goto("/");
  await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Открыть в браузере", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Android", exact: true })).toHaveAttribute("aria-pressed", "true");
});

test("renders invalid share links in the transferred state", async ({ page }) => {
  await page.goto("/share/invalid-token");
  await expect(page.getByRole("heading", { name: "Ссылка недействительна", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "К прогулкам", exact: true })).toBeVisible();
});

test("keeps admin authentication and its transferred form", async ({ page }) => {
  await page.goto("/dogsfather");
  await expect(page.getByRole("heading", { name: "Для тех, кто заботится о дворе", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Логин", exact: true }).fill("qa-wrong");
  await page.getByRole("textbox", { name: "Пароль", exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(/Неверный логин или пароль|Слишком много попыток/);
});
