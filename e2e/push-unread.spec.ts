import { expect, test } from "@playwright/test";
import { location, mockApp, pet } from "./fixtures";
import { pushMock } from "./push-fixtures";

const id = "30000000-0000-4000-8000-000000000001";

test("HTTP LAN addresses explain the HTTPS requirement without requesting permission", async ({ page }) => {
  await pushMock(page);
  await page.addInitScript(() => Object.defineProperty(window, "isSecureContext", { value: false }));
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.locator("button.menu-row").filter({ hasText: "Уведомления" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  const alert = page.getByRole("alert");
  await expect(alert).toContainText("Этот адрес открыт по HTTP");
  await expect(alert).toContainText("Откройте сайт по HTTPS");
  await expect(alert).not.toContainText("iPhone");
  await expect(alert).toBeInViewport();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(alert).toBeInViewport();
  expect(await page.evaluate(() => window.dogmeetPushTest.calls)).not.toContain("permission");
});

test("push needs server confirmation, handles refusal, confirms disable and enables again", async ({ page }) => {
  await pushMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  const setting = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
  await expect(setting).toContainText("Отключено");
  await expect(setting.locator(".push-disabled")).toHaveCSS("color", "rgb(161, 41, 41)");
  await page.evaluate(() => { window.dogmeetPushTest.permission = "denied"; });
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("настройках браузера");
  await page.evaluate(() => { window.dogmeetPushTest.permission = "granted"; window.dogmeetPushTest.failSubscribe = true; });
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Сервер недоступен");
  await expect(setting).toContainText("Отключено");
  await page.evaluate(() => { window.dogmeetPushTest.failSubscribe = false; });
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(setting).toContainText("Включено");
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Вы точно хотите отключить push-уведомления?");
  await expect(page.getByRole("dialog")).toContainText("Сообщения останутся доступны на сайте");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(setting).toContainText("Включено");
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(setting).toContainText("Отключено");
  const calls = await page.evaluate(() => window.dogmeetPushTest.calls);
  expect(calls.indexOf("server-disable")).toBeLessThan(calls.indexOf("unsubscribe"));
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(setting).toContainText("Включено");
});

test("choosing a location does not open the push prompt", async ({ page }) => {
  await pushMock(page, false);
  await page.goto("/");
  await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мой район", exact: true })).toBeVisible();
  await page.getByLabel("Город", { exact: true }).selectOption(location.city);
  await page.getByLabel("Район", { exact: true }).selectOption(location.district);
  await page.getByLabel("Жилой комплекс", { exact: true }).selectOption(location.complex);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.locator(".walks-screen h1")).toBeVisible();
  await expect(page.locator("main")).not.toHaveAttribute("inert", "");
  await expect(page.getByRole("dialog", { name: "Получайте сообщения" })).toHaveCount(0);
});

test("only the first successfully added own pet opens the blocking prompt, even with shared pets", async ({ page }, testInfo) => {
  await pushMock(page);
  const shared = { ...pet, id: "00000000-0000-4000-8000-000000000003", name: "Общий", isOwner: false, isShared: true };
  let pets = [shared];
  let fail = true;
  await page.route("**/api/pets", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { pets } });
    if (fail) return route.fulfill({ status: 503, json: { error: "Не сохранено" } });
    pets = [{ ...pet, name: "Луна" }, shared];
    return route.fulfill({ json: { pet: pets[0] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Получайте сообщения" })).toHaveCount(0);
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).last().click();
  await page.getByLabel("Имя питомца", { exact: true }).fill(pet.name);
  await page.getByLabel("Порода", { exact: true }).fill(pet.breed);
  await page.getByLabel("Имя хозяина", { exact: true }).fill(pet.ownerName);
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Не сохранено" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Получайте сообщения" })).toHaveCount(0);
  fail = false;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Получайте сообщения" });
  await expect(dialog).toBeVisible();
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await page.keyboard.press("Escape");
  await page.locator(".sheet-backdrop").click({ position: { x: 5, y: 5 }, force: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button")).toHaveCount(1);
  const before = await page.evaluate(() => window.scrollY);
  await page.mouse.wheel(0, 600);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Разрешение не получено");
  await page.screenshot({ path: testInfo.outputPath("push-prompt.png"), fullPage: true });
  await page.evaluate(() => { window.dogmeetPushTest.permission = "granted"; });
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Deleting all owned pets and reloading must not reset the first-show marker.
  pets = [shared];
  await page.reload();
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).last().click();
  await page.getByLabel("Имя питомца", { exact: true }).fill(pet.name);
  await page.getByLabel("Порода", { exact: true }).fill(pet.breed);
  await page.getByLabel("Имя хозяина", { exact: true }).fill(pet.ownerName);
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Получайте сообщения" })).toHaveCount(0);
});

test("an existing own pet is not a new first pet after it has been deleted", async ({ page }) => {
  await pushMock(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  await page.route("**/api/pets", route => route.fulfill({ json: route.request().method() === "POST" ? { pet } : { pets: [] } }));
  await page.reload();
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).last().click();
  await page.getByLabel("Имя питомца", { exact: true }).fill(pet.name);
  await page.getByLabel("Порода", { exact: true }).fill(pet.breed);
  await page.getByLabel("Имя хозяина", { exact: true }).fill(pet.ownerName);
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Получайте сообщения" })).toHaveCount(0);
});

test("startup reconciles server subscription, disable errors preserve delivery and local unsubscribe errors are honest", async ({ page }) => {
  await pushMock(page, true, { permission: "granted", browser: true, server: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  const setting = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
  await expect(setting).toContainText("Включено");
  await page.evaluate(() => { window.dogmeetPushTest.failDisable = true; });
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Подписка сохранена");
  expect(await page.evaluate(() => window.dogmeetPushTest.calls.includes("unsubscribe"))).toBe(false);
  await page.evaluate(() => { window.dogmeetPushTest.failDisable = false; window.dogmeetPushTest.failUnsubscribe = true; });
  await page.getByRole("button", { name: "Отключить", exact: true }).click();
  await expect(setting).toContainText("Отключено");
  await expect(page.getByRole("status")).toContainText("Браузер не удалил подписку");
  await page.evaluate(() => { window.dogmeetPushTest.failUnsubscribe = false; });
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(setting).toContainText("Включено");
  await page.evaluate(() => { window.dogmeetPushTest.server = false; window.dispatchEvent(new Event("focus")); });
  await expect(setting).toContainText("Отключено");
});

test("registration failures retry and repeated clicks create only one subscribe request", async ({ page }) => {
  await pushMock(page, true, { permission: "granted", failRegister: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  const setting = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Регистрация не удалась");
  await page.evaluate(() => { window.dogmeetPushTest.failRegister = false; });
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  let requests = 0;
  await page.route("**/api/push", async route => {
    if (route.request().method() !== "POST" || route.request().postDataJSON().action !== "subscribe") return route.fallback();
    requests++; await gate;
    await page.evaluate(() => { window.dogmeetPushTest.server = true; });
    await route.fulfill({ json: { enabled: true } });
  });
  await page.getByRole("button", { name: "Подключить", exact: true }).dblclick();
  await expect.poll(() => requests).toBe(1);
  await expect(page.getByRole("button", { name: "Подождите…", exact: true })).toBeDisabled();
  release();
  await expect(setting).toContainText("Включено");
});

test("a new session recreates the browser subscription without taking over another client's endpoint", async ({ page }) => {
  await pushMock(page, true, { permission: "granted", browser: true, ownerConflict: true });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  const setting = page.locator("button.menu-row").filter({ hasText: "Уведомления" });
  await expect(setting).toContainText("Отключено");
  await setting.click();
  await page.getByRole("dialog").getByRole("button", { name: /Push-уведомления/ }).click();
  await page.getByRole("button", { name: "Подключить", exact: true }).click();
  await expect(setting).toContainText("Включено");
  const calls = await page.evaluate(() => window.dogmeetPushTest.calls);
  expect(calls).toContain("unsubscribe");
  expect(calls.indexOf("unsubscribe")).toBeLessThan(calls.indexOf("server-subscribe"));
});

test("both menu dots, the full unread row and dot below time clear only after visible reading", async ({ page }, testInfo) => {
  await mockApp(page);
  let unread = true;
  const message = { seq: 1, requestId: "40000000-0000-4000-8000-000000000001", mine: false, text: "Привет", createdAt: new Date().toISOString(), readAt: null as string | null };
  const dialog = { id, peer: { clientId: "40000000-0000-4000-8000-000000000002", name: "Луна • Анна" }, expiresAt: new Date(Date.now() + 7200000).toISOString(), hiddenThrough: 0 };
  await page.route("**/api/dialogs**", async route => {
    const url = new URL(route.request().url());
    if (route.request().method() === "PATCH") { unread = false; message.readAt = new Date().toISOString(); return route.fulfill({ json: { read: true } }); }
    if (url.pathname.endsWith("/messages")) return route.fulfill({ json: { dialog, messages: [message], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString() } });
    if (url.searchParams.has("unread")) return route.fulfill({ json: { unreadCount: unread ? 1 : 0 } });
    return route.fulfill({ json: { dialogs: [{ ...dialog, lastMessage: message, unreadCount: unread ? 1 : 0 }], nextCursor: null } });
  });
  await page.goto("/");
  await expect(page.locator(".header-menu .unread-dot")).toBeVisible();
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await expect(page.locator(".menu-row .unread-dot")).toBeVisible();
  expect(unread).toBe(true);
  await page.getByRole("button", { name: /Диалоги Сообщите/ }).click();
  const row = page.locator(".chat-list-row");
  await expect(row).toHaveClass(/is-unread/);
  await expect(row.locator(".chat-list-time .unread-dot")).toBeVisible();
  expect(await row.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  expect(unread).toBe(true);
  await page.evaluate(() => Promise.allSettled(document.getAnimations().map(animation => animation.finished)));
  await page.screenshot({ path: testInfo.outputPath("unread-list.png"), fullPage: true, animations: "disabled" });
  await row.getByRole("button").click();
  await expect.poll(() => unread).toBe(false);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(row).not.toHaveClass(/is-unread/);
  await expect(row.locator(".unread-dot")).toHaveCount(0);
});
