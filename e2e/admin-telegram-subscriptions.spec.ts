import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [] } }));
});

test("Telegram section loads zero and fetches current counts on refresh and reopening", async ({ page }) => {
  let count = 0;
  let requests = 0;
  let releaseResponse!: () => void;
  const responseGate = new Promise<void>((resolve) => { releaseResponse = resolve; });
  await page.route("**/api/dogsfather/telegram-subscriptions", async (route) => {
    requests += 1;
    if (requests === 1) await responseGate;
    await route.fulfill({ json: { activeSubscriptions: count } });
  });
  await page.goto("/dogsfather");
  await expect(page.getByRole("heading", { name: "Управление", exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Уведомления в Telegram/ }).click();
  await expect(page.getByRole("heading", { name: "Уведомления в Telegram", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".section-line .count")).toHaveCount(0);
  releaseResponse();
  await expect(page.locator(".section-line .count")).toHaveText("0");
  count = 3;
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.locator(".section-line .count")).toHaveText("3");
  count = 2;
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: /Уведомления в Telegram/ }).click();
  await expect(page.locator(".section-line .count")).toHaveText("2");
  expect(requests).toBe(3);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const failure of ["server", "missing count"]) {
  test(`Telegram ${failure} error hides the count and allows retry`, async ({ page }) => {
    let fail = true;
    await page.route("**/api/dogsfather/telegram-subscriptions", (route) => route.fulfill(fail
      ? failure === "server" ? { status: 500, json: { error: "Не удалось загрузить подписки Telegram." } } : { json: {} }
      : { json: { activeSubscriptions: 1 } }));
    await page.goto("/dogsfather");
    await page.getByRole("button", { name: /Уведомления в Telegram/ }).click();
    await expect(page.getByRole("alert")).toContainText("Не удалось загрузить подписки Telegram.");
    await expect(page.locator(".section-line .count")).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Повторить", exact: true }).click();
    await expect(page.locator(".section-line .count")).toHaveText("1");
    fail = true;
    await page.getByRole("button", { name: "Обновить", exact: true }).click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.locator(".section-line .count")).toHaveCount(0);
  });
}

test("Telegram section returns to login when the administrator session expires", async ({ page }) => {
  await page.route("**/api/dogsfather/telegram-subscriptions", (route) => route.fulfill({ status: 401, json: { error: "Требуется вход." } }));
  await page.goto("/dogsfather");
  await page.getByRole("button", { name: /Уведомления в Telegram/ }).click();
  await expect(page.getByRole("heading", { name: "Вход администратора", exact: true })).toBeVisible();
  await expect(page.locator(".section-line .count")).toHaveCount(0);
});

test("ordinary users cannot access the Telegram admin endpoint", async ({ request }) => {
  const response = await request.get("/api/dogsfather/telegram-subscriptions", { headers: { cookie: "dogmeet_session=ordinary-user" } });
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "Требуется вход." });
});
