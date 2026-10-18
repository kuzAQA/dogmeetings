import { expect, test, type Page } from "@playwright/test";
import { openNearby, walk } from "./fixtures";
import { moscowDate } from "../server/domain/walk";

test.beforeEach(async ({ page }) => { await page.emulateMedia({ reducedMotion: "reduce" }); });

for (const mode of ["menu", "create", "edit", "dock"] as const) {
  test(`${mode}: silently requests owned places without blocking the screen`, async ({ page }) => {
    await openNearby(page, { mine: mode === "edit" ? [{ ...walk, walkDate: moscowDate(1), scheduleType: "tomorrow" }] : [] });
    let requests = 0;
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/places?scope=mine", async route => {
      requests++;
      await pending;
      await route.fulfill({ status: 500, json: { error: "Фоновый запрос не удался" } });
    });
    if (mode === "menu") {
      await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
    } else {
      await page.getByRole("button", { name: "Планы", exact: true }).click();
      if (mode === "edit") {
        await page.getByRole("button", { name: "Управлять", exact: true }).click();
        await page.getByRole("button", { name: "Изменить прогулку", exact: true }).click();
      } else if (mode === "dock") {
        await page.locator(".dock-add").click();
      } else {
        await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
      }
    }
    const screen = mode === "menu" ? page.getByRole("heading", { name: "Мой район и настройки", exact: true }) : page.locator(".announce-form");
    const response = page.waitForResponse("**/api/places?scope=mine");
    try {
      await expect(screen).toBeVisible();
      await expect.poll(() => requests).toBe(1);
      if (mode !== "menu") await page.getByLabel("Комментарий", { exact: false }).fill("Можно редактировать во время запроса");
    } finally {
      release();
    }
    await response;
    await expect(screen).toBeVisible();
    await expect(page.getByText("Фоновый запрос не удался", { exact: true })).toHaveCount(0);
  });
}

async function setupPlaces(page: Page) {
  let places = [{ id: walk.placeId, name: walk.point }];
  let saves = 0;
  let reads = 0;
  await page.route("**/api/places?*", async route => {
    reads++;
    await route.fulfill({ json: { places } });
  });
  await page.route("**/api/places", async route => {
    const body = route.request().postDataJSON();
    if (route.request().method() === "DELETE") {
      places = places.filter(place => place.id !== body.id);
      await route.fulfill({ json: { deleted: true } });
    } else {
      const place = { id: body.id, name: body.name.trim() };
      places = places.map(row => row.id === place.id ? place : row);
      await route.fulfill({ json: { place } });
    }
  });
  await page.route("**/api/walks", async route => { saves++; await route.fulfill({ status: 500, json: { error: "Unexpected walk save" } }); });
  return { saves: () => saves, reads: () => reads };
}

async function openPlaces(page: Page) {
  if (!await page.getByRole("link", { name: "здесь", exact: true }).isVisible()) {
    await page.getByRole("button", { name: /^Место встречи/ }).click();
  }
  await page.getByRole("link", { name: "здесь", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои места", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: `Изменить место «${walk.point}»`, exact: true })).toBeVisible();
}

test("menu returns to menu; rename and confirmed deletion update without reload", async ({ page }, testInfo) => {
  await openNearby(page);
  const state = await setupPlaces(page);
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: /^Мои места/ }).click();
  await expect(page.locator(".my-places-list")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `/private/tmp/dogmeet-my-places-${testInfo.project.name}.png`, fullPage: true });
  await page.getByRole("button", { name: /^Изменить место/ }).click();
  await page.getByLabel("Название места", { exact: true }).fill("У озера");
  const placeName = page.getByLabel("Название места", { exact: true });
  await expect(placeName).toBeFocused();
  expect(await placeName.evaluate(input => {
    const bounds = input.getBoundingClientRect();
    const style = getComputedStyle(input);
    const ring = parseFloat(style.outlineWidth) + parseFloat(style.outlineOffset);
    for (let parent = input.parentElement; parent; parent = parent.parentElement) {
      if (!/(auto|scroll|hidden|clip)/.test(getComputedStyle(parent).overflowX)) continue;
      const clip = parent.getBoundingClientRect();
      if (bounds.left - ring < clip.left || bounds.right + ring > clip.right) return false;
    }
    return ring > 0;
  })).toBe(true);
  await page.screenshot({ path: `/private/tmp/dogmeet-place-focus-${testInfo.project.name}.png` });
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await expect(page.getByRole("button", { name: "Изменить место «У озера»", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Удалить место «У озера»", exact: true }).click();
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(page.getByText("У озера", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Удалить место «У озера»", exact: true }).click();
  await page.getByRole("button", { name: "Удалить место", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пока нет своих мест" })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мой район и настройки", exact: true })).toBeVisible();
  expect(state.saves()).toBe(0);
});

for (const mode of ["create", "edit", "dock"] as const) {
  for (const change of ["keep", "rename", "delete"] as const) {
    test(`${mode}: return preserves draft after ${change}, without submitting`, async ({ page }) => {
      await openNearby(page, { mine: mode === "edit" ? [{ ...walk, walkDate: moscowDate(1), scheduleType: "tomorrow" }] : [] });
      const state = await setupPlaces(page);
      if (mode === "dock") {
        await page.getByRole("button", { name: "Планы", exact: true }).click();
        await page.locator(".dock-add").click();
      }
      else {
        await page.getByRole("button", { name: "Планы", exact: true }).click();
        if (mode === "edit") {
          await page.getByRole("button", { name: "Управлять", exact: true }).click();
          await page.getByRole("button", { name: "Изменить прогулку", exact: true }).click();
        } else await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
      }
      if (mode !== "edit") {
        await page.getByRole("button", { name: "Завтра", exact: true }).click();
        await page.getByRole("button", { name: /^Время/ }).click();
        await page.getByRole("button", { name: "Готово", exact: true }).click();
        await page.getByRole("button", { name: /^Место встречи/ }).click();
        await page.getByRole("dialog", { name: "Место встречи" }).getByRole("button", { name: walk.point, exact: true }).click();
        await page.getByRole("button", { name: "Выбрать место", exact: true }).click();
      }
      await page.getByLabel("Комментарий", { exact: false }).fill("Черновик не теряется");
      await page.getByRole("checkbox").setChecked(false);
      const originalTime = await page.locator('input[name="walkTime"]').inputValue();
      const originalPet = await page.locator('input[name="pet"]').inputValue();
      await openPlaces(page);
      if (change === "rename") {
        await page.getByRole("button", { name: /^Изменить место/ }).click();
        await page.getByLabel("Название места", { exact: true }).fill("У озера");
        await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
        await expect(page.getByText("У озера", { exact: true })).toBeVisible();
      }
      if (change === "delete") {
        await page.getByRole("button", { name: /^Удалить место «/ }).click();
        await page.getByRole("button", { name: "Удалить место", exact: true }).click();
        await expect(page.getByRole("heading", { name: "Пока нет своих мест" })).toBeVisible();
      }
      const reads = state.reads();
      if (change === "keep") await page.goBack();
      else await page.getByRole("button", { name: "Назад", exact: true }).click();
      await expect(page.getByRole("heading", { name: mode === "edit" ? "Изменить прогулку" : "Сообщить о прогулке", exact: true })).toBeVisible();
      await expect(page.locator('input[name="place"]')).toHaveValue(change === "delete" ? "" : change === "rename" ? "У озера" : walk.point);
      await expect(page.locator('input[name="walkTime"]')).toHaveValue(originalTime);
      await expect(page.locator('input[name="pet"]')).toHaveValue(originalPet);
      await expect(page.getByRole("button", { name: "Завтра", exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByLabel("Комментарий", { exact: false })).toHaveValue("Черновик не теряется");
      await expect(page.getByRole("checkbox")).not.toBeChecked();
      if (change === "delete") await expect(page.getByRole("status").filter({ hasText: "Выбранное место больше недоступно" })).toBeVisible();
      await expect.poll(state.reads).toBeGreaterThan(reads);
      expect(state.saves()).toBe(0);
    });
  }
}

test("places shows loading, recoverable error and empty state", async ({ page }) => {
  await openNearby(page);
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/places?scope=mine", async route => {
    await pending;
    await route.fulfill({ status: 500, json: { error: "Не удалось загрузить места." } });
  });
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: /^Мои места/ }).click();
  await expect(page.getByRole("heading", { name: "Загружаем места…" })).toBeVisible();
  release();
  await expect(page.getByRole("alert")).toContainText("Не удалось загрузить места.");
  await page.route("**/api/places?scope=mine", route => route.fulfill({ json: { places: [] } }));
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пока нет своих мест" })).toBeVisible();
});

test("linked-place deletion and duplicate rename errors preserve the list and draft", async ({ page }) => {
  await openNearby(page);
  await setupPlaces(page);
  await page.route("**/api/places", route => route.fulfill({ status: 409, json: { error: route.request().method() === "DELETE" ? "Оно используется в текущих прогулках на сегодня." : "Место с таким названием уже есть." } }));
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: /^Мои места/ }).click();
  await page.getByRole("button", { name: /^Удалить место «/ }).click();
  await page.getByRole("button", { name: "Удалить место", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Оно используется в текущих прогулках на сегодня.");
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await page.getByRole("button", { name: /^Изменить место/ }).click();
  await page.getByLabel("Название места", { exact: true }).fill("123");
  await expect(page.getByRole("button", { name: "Сохранить изменения", exact: true })).toBeDisabled();
  await page.getByLabel("Название места", { exact: true }).fill("Дубликат");
  await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("уже есть");
  await expect(page.getByLabel("Название места", { exact: true })).toHaveValue("Дубликат");
  await expect(page.locator(".my-places-list")).toContainText(walk.point);
});

test("edit in another location keeps its available meeting place after returning", async ({ page }) => {
  const requestedComplexes: string[] = [];
  const edited = { ...walk, complex: "Другой ЖК", walkDate: moscowDate(1), scheduleType: "tomorrow" };
  await openNearby(page, { mine: [edited] });
  await page.route("**/api/places?*", route => {
    const params = new URL(route.request().url()).searchParams;
    requestedComplexes.push(params.get("complex") ?? "");
    return route.fulfill({ json: { places: params.get("complex") === edited.complex ? [{ id: edited.placeId, name: edited.point }] : [] } });
  });
  await page.getByRole("button", { name: "Планы", exact: true }).click();
  await page.getByRole("button", { name: "Управлять", exact: true }).click();
  await page.getByRole("button", { name: "Изменить прогулку", exact: true }).click();
  await page.getByLabel("Комментарий", { exact: false }).fill("Другой район, тот же черновик");
  await page.getByRole("button", { name: /^Место встречи/ }).click();
  await page.getByRole("link", { name: "здесь", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Пока нет своих мест" })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect.poll(() => requestedComplexes.includes(edited.complex)).toBe(true);
  await expect(page.locator('input[name="place"]')).toHaveValue(edited.point);
  await expect(page.getByLabel("Комментарий", { exact: false })).toHaveValue("Другой район, тот же черновик");
  await expect(page.getByText("Выбранное место больше недоступно", { exact: false })).toHaveCount(0);
});
