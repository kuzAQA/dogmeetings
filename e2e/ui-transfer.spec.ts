import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { location, mockApp, openNearby, pet, walk } from "./fixtures";

async function capture(page: Page, info: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  const dialog = page.locator("[data-app-bottom-sheet]");
  if (await dialog.count()) {
    const bounds = await dialog.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height + 1);
  }
  await page.screenshot({ path: `.impeccable/review/transfer/${info.project.name}-${name}.png`, fullPage: !(await dialog.count()), animations: "disabled" });
}

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

test("place picker confirms only its selected shared place", async ({ page }) => {
  await mockApp(page);
  await page.unroute("**/api/places?*");
  await page.route("**/api/places?*", (route) => route.fulfill({ json: { places: [{ id: walk.placeId, name: walk.point }, { id: "place-2", name: "У детской площадки" }] } }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await page.getByRole("button", { name: /^Место встречи/ }).click();

  const dialog = page.getByRole("dialog", { name: "Место встречи" });
  const confirm = dialog.getByRole("button", { name: "Выбрать место" });
  const firstPlace = dialog.getByRole("button", { name: walk.point, exact: true });
  const secondPlace = dialog.getByRole("button", { name: "У детской площадки", exact: true });
  await expect(confirm).toBeDisabled();
  await firstPlace.click();
  await expect(dialog).toBeVisible();
  await expect(firstPlace).toHaveAttribute("aria-pressed", "true");
  await expect(firstPlace.locator("svg")).toHaveCount(1);
  await secondPlace.click();
  await expect(firstPlace).toHaveAttribute("aria-pressed", "false");
  await expect(secondPlace).toHaveAttribute("aria-pressed", "true");
  await expect(confirm).toBeEnabled();
  await confirm.click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Место встречи/ })).toContainText("У детской площадки");
});

test("location uses reference fields and preserves dependent options and submission", async ({ page }, info) => {
  await openNearby(page);
  await page.getByRole("button", { name: location.complex, exact: true }).click();
  const city = page.getByRole("combobox", { name: "Город", exact: true });
  await expect(city).toBeVisible();
  expect(await city.evaluate((element) => {
    const style = getComputedStyle(element);
    return { height: element.getBoundingClientRect().height, radius: style.borderRadius, background: style.backgroundColor, font: style.fontFamily };
  })).toEqual({ height: 54, radius: "10px", background: "rgb(255, 253, 248)", font: "Manrope, Arial, sans-serif" });
  await capture(page, info, "location");
  const request = page.waitForRequest((request) => request.url().endsWith("/api/session") && request.method() === "PATCH");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  expect((await request).postDataJSON()).toEqual({ location });
  await expect(page.getByRole("heading", { name: "Район выбран" })).toBeVisible();
  await capture(page, info, "location-success");
});

test("location request fields, loading, error, retry and success", async ({ page }, info) => {
  await openNearby(page);
  await page.getByRole("button", { name: location.complex, exact: true }).click();
  await page.getByRole("button", { name: "Предложить новую локацию" }).click();
  await page.getByLabel("Город", { exact: true }).fill("Москва");
  await page.getByLabel("Район", { exact: true }).fill("Коммунарка");
  await page.getByLabel("Жилой комплекс", { exact: true }).fill("Скандинавия");
  await capture(page, info, "request");
  await page.route("**/api/location-requests", (route) => route.fulfill({ status: 503, json: { error: "Проверка ошибки заявки" } }));
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByRole("alert")).toContainText("Проверка ошибки заявки");
  await expect(page.getByLabel("Жилой комплекс", { exact: true })).toHaveValue("Скандинавия");
  await capture(page, info, "request-error");
  await page.route("**/api/location-requests", (route) => route.fulfill({ json: { request: { id: "request-1" } } }));
  await page.getByRole("button", { name: "Отправить заявку" }).click();
  await expect(page.getByRole("heading", { name: "Заявка отправлена" })).toBeVisible();
  await capture(page, info, "request-success");
});

test("pet form retains upload, validation, multipart data and success", async ({ page }, info) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await capture(page, info, "new-pet");
  await page.getByLabel("Имя питомца").focus();
  await page.getByLabel("Имя хозяина").focus();
  await expect(page.getByLabel("Имя питомца")).toHaveAttribute("aria-invalid", "true");
  expect(await page.getByLabel("Имя питомца").evaluate((element) => getComputedStyle(element).borderTopWidth)).toBe("2px");
  await capture(page, info, "new-pet-validation");
  await page.getByRole("button", { name: "Выбрать фотографию", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Фотография" })).toBeVisible();
  await page.locator('input[type="file"]').setInputFiles("public/dog-bonya.webp");
  await capture(page, info, "photo");
  await page.getByRole("button", { name: "Использовать фото" }).click();
  await page.getByLabel("Имя питомца").fill("Боня");
  await page.getByLabel("Имя хозяина").fill("Анна");
  await page.getByLabel("Порода", { exact: true }).fill("Мальтипу");
  let multipart = "";
  await page.route("**/api/pets", async (route) => {
    if (route.request().method() === "POST") { multipart = route.request().postDataBuffer()!.toString("latin1"); await route.fulfill({ json: { pet: { ...pet, name: "Боня" } } }); }
    else await route.fallback();
  });
  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Рады знакомству!" })).toBeVisible();
  for (const name of ["petName", "ownerName", "breed", "photo"]) expect(multipart).toContain(`name="${name}"`);
  await capture(page, info, "new-pet-success");
});

test("walk deletion refreshes once after the success sheet closes", async ({ page }) => {
  const requests: string[] = [];
  let mineGets = 0;
  let nearbyGets = 0;
  await mockApp(page);
  await page.unroute("**/api/walks?*");
  await page.route("**/api/walks?*", (route) => {
    if (new URL(route.request().url()).searchParams.get("scope") === "mine") {
      mineGets += 1;
      return route.fulfill({ json: { walks: [walk] } });
    }
    nearbyGets += 1;
    requests.push("GET");
    return route.fulfill({ json: { walks: nearbyGets === 1 ? [walk] : [] } });
  });
  await page.route("**/api/walks", (route) => {
    requests.push(route.request().method());
    return route.fulfill({ json: { deleted: true } });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  await expect.poll(() => ({ mineGets, nearbyGets })).toEqual({ mineGets: 1, nearbyGets: 1 });
  requests.length = 0;

  await page.getByRole("button", { name: "Управлять", exact: true }).click();
  const walkActions = page.getByRole("dialog", { name: "Управление прогулкой" });
  await expect(walkActions.getByRole("button", { name: "Поделиться питомцем" })).toHaveCount(0);
  await expect(walkActions.getByRole("button", { name: "Изменить прогулку" }).locator("svg")).toHaveCount(1);
  await expect(walkActions.getByRole("button", { name: "Удалить прогулку" }).locator("svg")).toHaveCount(1);
  await page.getByRole("button", { name: "Удалить прогулку", exact: false }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Прогулка удалена" })).toBeVisible();
  await expect.poll(() => requests).toEqual(["DELETE", "GET"]);
  await expect(page.locator(".walks-screen")).toContainText(walk.pet);

  await page.getByRole("button", { name: "Посмотреть мои планы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  await expect(page.locator(".my-walks-screen")).not.toContainText(walk.pet);
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(page.locator(".walks-screen")).not.toContainText(walk.pet);
  expect(requests).toEqual(["DELETE", "GET"]);
});

test("walk pickers preserve payload and create, edit and delete actions", async ({ page }, info) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await capture(page, info, "announce");
  await page.getByRole("button", { name: "Питомец", exact: true }).click();
  await capture(page, info, "choose-pet");
  await page.getByRole("dialog").getByRole("button", { name: /Луна.*Корги/ }).click();
  await page.getByRole("button", { name: /^Время/ }).click();
  await page.locator('input[type="time"]').fill("18:30");
  await capture(page, info, "choose-time");
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await page.getByRole("button", { name: /^Место встречи/ }).click();
  await capture(page, info, "choose-place");
  const placeDialog = page.getByRole("dialog", { name: "Место встречи" });
  const choosePlace = placeDialog.getByRole("button", { name: "Выбрать место" });
  await expect(choosePlace).toBeDisabled();
  const firstPlace = placeDialog.getByRole("button", { name: walk.point, exact: true });
  await firstPlace.click();
  await expect(placeDialog).toBeVisible();
  await expect(firstPlace).toHaveAttribute("aria-pressed", "true");
  await expect(choosePlace).toBeEnabled();
  await page.getByLabel("Найти место").fill("Неизвестное");
  await expect(page.getByText("Совпадений нет. Укажите своё место.")).toBeVisible();
  await capture(page, info, "choose-place-empty");
  await page.getByLabel("Или своё место встречи").fill("У входа в сквер");
  await page.getByRole("button", { name: "Выбрать место" }).click();
  await expect(page.getByRole("dialog", { name: "Место встречи" })).toHaveCount(0);
  await page.getByLabel("Комментарий", { exact: false }).fill("Возьмём мячик");
  let payload: Record<string, unknown> = {};
  await page.route("**/api/walks", async (route) => { payload = route.request().postDataJSON(); await route.fulfill({ json: route.request().method() === "DELETE" ? { deleted: true } : { walk: { ...walk, point: "У входа в сквер" } } }); });
  await page.getByRole("button", { name: "Сообщить о прогулке", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Вы идёте гулять!" })).toBeVisible();
  expect(payload).toMatchObject({ petId: pet.id, place: "У входа в сквер", walkTime: "18:30", comment: "Возьмём мячик", scheduleType: "today", ...location });
  await capture(page, info, "announce-success");
  await page.getByRole("button", { name: "Посмотреть мои планы" }).click();
  await page.getByRole("button", { name: "Управлять", exact: false }).click();
  const walkActions = page.getByRole("dialog", { name: "Управление прогулкой" });
  expect(await walkActions.locator(".menu-row").first().evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(64);
  await expect(walkActions.getByRole("button", { name: "Поделиться питомцем" })).toHaveCount(0);
  await expect(walkActions.getByRole("button", { name: "Изменить прогулку" }).locator("svg")).toHaveCount(1);
  await expect(walkActions.getByRole("button", { name: "Удалить прогулку" }).locator("svg")).toHaveCount(1);
  await capture(page, info, "walk-actions");
  await page.getByRole("button", { name: "Изменить прогулку", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Изменить прогулку" })).toBeVisible();
  await capture(page, info, "edit-walk");
  await page.getByRole("button", { name: "Сохранить изменения" }).click();
  await expect(page.getByRole("heading", { name: "Планы обновлены" })).toBeVisible();
  expect(payload).toMatchObject({ walkId: walk.id });
  await page.getByRole("button", { name: "Посмотреть мои планы" }).click();
  await page.getByRole("button", { name: "Управлять", exact: false }).click();
  await page.getByRole("button", { name: "Удалить прогулку", exact: false }).click();
  await capture(page, info, "delete-walk");
  await page.getByRole("alertdialog").getByRole("button", { name: "Удалить прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Прогулка удалена" })).toBeVisible();
  expect(payload).toEqual({ walkId: walk.id });
});

test("passport, edit, share, rotate confirmation and delete preserve permissions", async ({ page }, info) => {
  await openNearby(page);
  let rotations = 0;
  await page.route("**/api/pet-shares", async (route) => { if (route.request().method() === "PATCH") rotations++; await route.fulfill({ json: { link: `http://localhost:3000/share/test-${rotations}` } }); });
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await capture(page, info, "pets");
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await capture(page, info, "pet");
  await page.getByRole("button", { name: "Изменить данные", exact: false }).click();
  await expect(page.getByLabel("Имя питомца")).toHaveValue(pet.name);
  const savePet = page.getByRole("button", { name: "Сохранить изменения", exact: true });
  await page.getByLabel("Имя питомца").fill("");
  await expect(savePet).toBeDisabled();
  await page.getByLabel("Имя питомца").fill(pet.name);
  await expect(savePet).toBeEnabled();
  await capture(page, info, "edit-pet");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await page.getByRole("button", { name: "Поделиться питомцем", exact: false }).click();
  await expect(page.getByLabel("Одноразовая ссылка")).toHaveValue(/share\/test-0/);
  await capture(page, info, "share");
  await page.getByRole("button", { name: "Получить новую ссылку", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Заменить ссылку?" })).toBeVisible();
  expect(rotations).toBe(0);
  await capture(page, info, "rotate-link");
  await page.getByRole("button", { name: "Получить новую ссылку", exact: true }).click();
  await expect(page.getByLabel("Одноразовая ссылка")).toHaveValue(/share\/test-1/);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Удалить питомца", exact: false }).click();
  await capture(page, info, "delete-pet");
  await page.getByRole("button", { name: "Оставить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Паспорт питомца" })).toBeVisible();
});

test("profile, contact, walk detail and browser history", async ({ page }, info) => {
  await openNearby(page);
  await capture(page, info, "nearby");
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await expect(page.getByRole("heading", { name: "Встреча на прогулке" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toHaveCount(0);
  await capture(page, info, "walk");
  await page.getByRole("button", { name: "Изменить мою прогулку" }).click();
  await expect(page.getByRole("heading", { name: "Изменить прогулку", exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Встреча на прогулке" })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?" })).toBeVisible();
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await capture(page, info, "profile");
  await page.getByRole("button", { name: "Связь с разработчиком", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Есть идея или вопрос?" })).toBeVisible();
  await capture(page, info, "contact");
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Мой район и настройки" })).toBeVisible();
});

test("welcome and both browser guides", async ({ page }, info) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "userAgent", { configurable: true, get: () => "Telegram Android WebView" }));
  await mockApp(page, { hasLocation: false, pets: [], nearby: [], mine: [] });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeVisible();
  await capture(page, info, "welcome");
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await capture(page, info, "guide-android");
  await page.getByRole("button", { name: "iPhone", exact: true }).click();
  await capture(page, info, "guide-iphone");
});

test("collections expose empty and error states with working retry", async ({ page }, info) => {
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  await capture(page, info, "nearby-empty");
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пока ни одного питомца" })).toBeVisible();
  await capture(page, info, "pets-empty");
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await capture(page, info, "plans-empty");
  await page.route("**/api/walks?*", (route) => route.fulfill({ status: 503, json: { error: "Проверка недоступного расписания" } }));
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Проверка недоступного расписания");
  await capture(page, info, "walks-error");
  await page.unroute("**/api/walks?*");
  await mockApp(page);
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("admin lists, search, edit and confirmation sheets", async ({ page }, info) => {
  await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [{ id: "r1", city: "Москва", district: "Коммунарка", complex: "Скандинавия", createdAt: "2026-09-14T07:42:00Z" }] } }));
  await page.route("**/api/dogsfather/pets", (route) => route.fulfill({ json: { pets: [pet] } }));
  await page.goto("/dogsfather");
  await expect(page.getByRole("heading", { name: "Управление", exact: true })).toBeVisible();
  await capture(page, info, "admin");
  await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  await expect(page.getByRole("heading", { name: "Скандинавия", exact: true })).toBeVisible();
  await capture(page, info, "requests");
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await capture(page, info, "approve");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Отклонить", exact: true }).click();
  await capture(page, info, "reject");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Все питомцы", exact: false }).click();
  await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  await capture(page, info, "admin-pets");
  await page.getByLabel("Найти питомца").fill("Нет такого");
  await expect(page.getByRole("status")).toContainText("Никого не нашли");
  await capture(page, info, "admin-pets-search-empty");
  await page.getByLabel("Найти питомца").fill("");
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await capture(page, info, "admin-edit");
  await page.getByRole("button", { name: "Удалить питомца", exact: true }).click();
  await capture(page, info, "admin-delete");
  await page.getByRole("button", { name: "Оставить" }).click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Уведомления", exact: false }).click();
  await capture(page, info, "notifications");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Выйти", exact: true }).click();
  await capture(page, info, "admin-logout");
});

test("share invitation, already added, expired and accepted states", async ({ page }, info) => {
  await mockApp(page);
  await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: route.request().method() === "POST" ? { petId: pet.id } : { pet } }));
  await page.goto("/share/invitation");
  await expect(page.getByRole("heading", { name: "Приглашение" })).toBeVisible();
  await capture(page, info, "accept");
  await page.getByRole("button", { name: "Добавить к моим питомцам" }).click();
  await expect(page.getByRole("heading", { name: "Теперь вы гуляете вместе" })).toBeVisible();
  await capture(page, info, "accept-success");
  await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ json: { pet, alreadyAdded: true } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Вы уже знакомы" })).toBeVisible();
  await capture(page, info, "already-added");
  await page.route("**/api/pet-shares/invitation", (route) => route.fulfill({ status: 410, json: { inactive: true } }));
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ссылка уже использована" })).toBeVisible();
  await capture(page, info, "accept-used");
});

test("motion, interruption, keyboard focus and compact viewport", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page);
  expect(await page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return ["--motion-screen", "--motion-sheet-in", "--motion-sheet-out", "--motion-shared"].map((token) => style.getPropertyValue(token).trim());
  })).toEqual(["180ms", "260ms", "200ms", "240ms"]);
  await expect(page.locator(".page-header")).toHaveCSS("view-transition-name", "dogmeet-header");
  await expect(page.locator("main")).toHaveCSS("view-transition-name", "dogmeet-production-page");
  expect(await page.evaluate(() => getComputedStyle(document.documentElement, "::view-transition-old(dogmeet-header)").opacity)).toBe("0");
  const filter = page.getByRole("button", { name: "Весь день", exact: true });
  await filter.click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Весь день", exact: true })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(filter).toBeFocused();
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: page.viewportSize()!.width, height: 430 });
  await filter.click();
  await capture(page, info, "filters-compact");
  await page.getByRole("button", { name: "Показать прогулки" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("admin mutations retain methods and request bodies", async ({ page }) => {
  await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  let requestAction: unknown;
  await page.route("**/api/dogsfather/location-requests", async (route) => {
    if (route.request().method() !== "GET") requestAction = { method: route.request().method(), body: route.request().postDataJSON() };
    await route.fulfill({ json: { requests: [{ id: "r1", ...location, createdAt: "2026-09-14T07:42:00Z" }] } });
  });
  await page.goto("/dogsfather");
  await page.getByRole("button", { name: "Заявки жителей", exact: false }).click();
  await page.getByRole("button", { name: "Добавить", exact: true }).click();
  await page.getByRole("button", { name: "Добавить локацию", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Локация добавлена" })).toBeVisible();
  expect(requestAction).toEqual({ method: "PATCH", body: { id: "r1" } });
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Все заявки разобраны" })).toBeVisible();
});
