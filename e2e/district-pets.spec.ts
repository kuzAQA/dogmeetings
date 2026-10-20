import { expect, test } from "@playwright/test";
import { location, mockApp, pet } from "./fixtures";

test("district pets opens a keyboard accordion and a read-only passport", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApp(page);
  const neighbor = { id: "00000000-0000-4000-8000-000000000099", name: "Барни", breed: "Бигль", ownerName: "Ирина", photoUrl: pet.photoUrl, description: "Любим парк" };
  const neighborLocation = { ...location, complex: "Скандинавия" };
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() !== "GET" && /\/api\/(pets|pet-shares|dogsfather)/.test(request.url())) mutations.push(request.url());
  });
  await page.route("**/api/district-pets", (route) => route.fulfill({ json: {
    complexes: [
      { location: neighborLocation, pets: [neighbor] },
      { location: { ...location, complex: "Пустой ЖК" }, pets: [] }
    ]
  } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: "Питомцы твоего района", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Питомцы твоего района" })).toBeVisible();
  const summary = page.locator("summary").filter({ hasText: neighborLocation.complex });
  await expect(page.getByRole("button", { name: /Собака Барни/ })).toBeHidden();
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: /Собака Барни/ })).toBeVisible();
  await page.keyboard.press("Space");
  await expect(page.getByRole("button", { name: /Собака Барни/ })).toBeHidden();
  await page.keyboard.press("Space");
  await page.screenshot({ path: test.info().outputPath("district-pets.png"), fullPage: true });
  await page.getByRole("button", { name: /Собака Барни/ }).click();
  await expect(page.getByRole("heading", { name: "Паспорт питомца" })).toBeVisible();
  await expect(page.getByText("Любим парк", { exact: true })).toBeVisible();
  await expect(page.getByText("Хозяин: Ирина", { exact: true })).toBeVisible();
  await expect(page.locator(".place-detail")).toContainText(neighborLocation.complex);
  await expect(page.getByRole("button", { name: /Изменить|Удалить|Добавить|Поделиться|Сохранить/ })).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Питомцы твоего района" })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Паспорт питомца" })).toBeVisible();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.locator("summary").filter({ hasText: "Пустой ЖК" }).click();
  await expect(page.getByText("В этом ЖК пока нет питомцев.")).toBeVisible();
  await summary.click();
  await page.getByRole("button", { name: /Собака Барни/ }).click();
  await page.goBack();
  await page.reload();
  await expect(page.getByRole("button", { name: "Мой район и настройки", exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole("heading", { name: "Питомцы твоего района" })).toBeVisible();
  expect(mutations).toEqual([]);
});

test("district pets handles loading, error, retry and an empty district", async ({ page }) => {
  await mockApp(page);
  let respond: (() => void) | undefined;
  await page.route("**/api/district-pets", async (route) => {
    await new Promise<void>((resolve) => { respond = resolve; });
    await route.fulfill({ status: 500, json: { error: "Не удалось загрузить питомцев района." } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await page.getByRole("button", { name: "Питомцы твоего района", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Загружаем");
  await expect.poll(() => Boolean(respond)).toBe(true);
  respond!();
  await expect(page.getByRole("alert")).toContainText("Не удалось загрузить питомцев района.");
  await page.route("**/api/district-pets", (route) => route.fulfill({ json: { complexes: [] } }));
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByText("В вашем районе пока нет ЖК.")).toBeVisible();
});
