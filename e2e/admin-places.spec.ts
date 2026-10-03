import { expect, test } from "@playwright/test";

test("admin manages places below their complex, preserves failed edits and protects linked walks", async ({ page }) => {
  test.setTimeout(40_000);
  const location = { city: "Москва", district: "Коммунарка", complex: "Скандинавия" };
  const locations = [location, { ...location, complex: "Москвичка" }, { ...location, complex: "Пустой ЖК" }];
  let places = [
    { ...location, id: "11111111-1111-4111-8111-111111111111", name: "У парка" },
    { ...location, id: "22222222-2222-4222-8222-222222222222", name: "У площадки" },
    { ...location, complex: "Москвичка", id: "33333333-3333-4333-8333-333333333333", name: "У другого парка" }
  ];
  let failRename = true;
  let deleteRequests = 0;
  await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [] } }));
  await page.route("**/api/dogsfather/challenge", (route) => route.fulfill({ json: { challenge: "a".repeat(43), salt: "c2FsdA", iterations: 1 } }));
  await page.route("**/api/dogsfather/locations", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { locations, places } });
    const payload = route.request().postDataJSON();
    expect(payload).toMatchObject({ level: "place", ...location });
    if (route.request().method() === "PATCH") {
      if (failRename) {
        failRename = false;
        return route.fulfill({ status: 500, json: { error: "Не удалось сохранить место. Повторите попытку." } });
      }
      places = places.map((place) => place.id === payload.id ? { ...place, name: payload.name } : place);
      return route.fulfill({ json: { updated: true } });
    }
    deleteRequests++;
    expect(payload.proof).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify(payload)).not.toContain("test-password");
    if (payload.id === places[0].id) return route.fulfill({ status: 409, json: { error: "Нельзя удалить место: оно используется в прогулках." } });
    places = places.filter((place) => place.id !== payload.id);
    return route.fulfill({ json: { deleted: true } });
  });

  const openPlaces = async () => {
    await page.getByRole("button", { name: "Локации", exact: false }).click();
    await page.getByRole("button", { name: "Открыть Москва" }).click();
    await page.getByRole("button", { name: "Открыть Коммунарка" }).click();
    await page.getByRole("button", { name: "Открыть Скандинавия" }).click();
    await expect(page.getByRole("heading", { name: "Места для прогулок", exact: true })).toBeVisible();
  };
  await page.goto("/dogsfather");
  await openPlaces();
  await expect(page.getByRole("heading", { name: "У парка", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "У другого парка", exact: true })).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("admin-places.png"), fullPage: true });

  await page.getByRole("button", { name: "Редактировать У парка" }).click();
  await page.getByLabel("Новое название").fill("У озера");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Не удалось сохранить место. Повторите попытку.");
  await expect(page.getByLabel("Новое название")).toHaveValue("У озера");
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Изменения сохранены", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "У озера", exact: true })).toBeVisible();
  await page.reload();
  await openPlaces();
  await expect(page.getByRole("heading", { name: "У озера", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Удалить У площадки" }).click();
  await expect(page.getByRole("heading", { name: "Удалить У площадки?", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Удалить место", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Оставить", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(deleteRequests).toBe(0);
  await expect(page.getByRole("heading", { name: "У площадки", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Удалить У озера" }).click();
  await page.getByLabel("Пароль администратора").fill("test-password");
  await page.getByRole("button", { name: "Удалить место", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText("Нельзя удалить место: оно используется в прогулках.");
  await page.screenshot({ path: test.info().outputPath("admin-place-linked-error.png"), fullPage: true });
  await page.getByRole("button", { name: "Оставить", exact: true }).click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "У озера", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Удалить У площадки" }).click();
  await page.getByLabel("Пароль администратора").fill("test-password");
  await page.getByRole("button", { name: "Удалить место", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Место удалено", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("heading", { name: "У площадки", exact: true })).toHaveCount(0);
  await page.reload();
  await openPlaces();
  await expect(page.getByRole("heading", { name: "У площадки", exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "У озера", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Жилые комплексы", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Открыть Пустой ЖК" }).click();
  await expect(page.getByRole("heading", { name: "Мест пока нет", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "К жилым комплексам", exact: true }).click();
  await page.getByRole("button", { name: "Открыть Москвичка" }).click();
  await expect(page.getByRole("heading", { name: "У другого парка", exact: true })).toBeVisible();
});
