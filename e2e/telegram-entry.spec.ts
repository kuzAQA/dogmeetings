import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test("Telegram in the bottom panel opens the subscription link directly", async ({ page }) => {
  await mockApp(page);
  await page.route("**/api/telegram/subscription-link", (route) => route.fulfill({ json: { link: "https://t.me/dogmeet_test_bot?start=subscription" } }));
  await page.route("https://t.me/**", (route) => route.fulfill({ contentType: "text/html", body: "<h1>Telegram subscription</h1>" }));
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Основная навигация" });
  const telegram = navigation.getByRole("button", { name: "Telegram", exact: true });
  await expect(telegram.locator("svg")).toBeVisible();
  await telegram.click();
  await expect(page).toHaveURL("https://t.me/dogmeet_test_bot?start=subscription");
});

test("Telegram disables repeat clicks while loading and allows retry after an error", async ({ page }) => {
  await mockApp(page);
  let finishRequest!: () => void;
  const pending = new Promise<void>((resolve) => { finishRequest = resolve; });
  await page.route("**/api/telegram/subscription-link", async (route) => {
    await pending;
    await route.fulfill({ status: 500, json: { error: "Временная ошибка." } });
  });
  await page.goto("/");
  const telegram = page.getByRole("button", { name: "Telegram", exact: true });
  await telegram.click();
  await expect(telegram).toBeDisabled();
  await expect(telegram).toHaveAttribute("aria-busy", "true");
  finishRequest();
  await expect(page.getByRole("alert").filter({ hasText: "Временная ошибка." })).toBeVisible();
  await expect(telegram).toBeEnabled();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.route("**/api/telegram/subscription-link", (route) => route.fulfill({ json: { link: "https://t.me/dogmeet_test_bot?start=retry" } }));
  await page.route("https://t.me/**", (route) => route.fulfill({ body: "Telegram" }));
  await telegram.click();
  await expect(page).toHaveURL("https://t.me/dogmeet_test_bot?start=retry");
});

test("notification settings no longer contain the old Telegram entry", async ({ page }) => {
  await mockApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Мой район.*настройки/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Получать уведомления в Telegram/ })).toHaveCount(0);
});

test("Telegram link opens nearby without a spotlight or settings focus", async ({ page }) => {
  await mockApp(page);
  await page.goto("/?telegram=notifications");
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Основная навигация" })).toBeVisible();
  await expect(page.locator(".telegram-spotlight")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /Мой район.*настройки/ })).toHaveCount(0);
});

test("Telegram link keeps a new visitor on the welcome screen", async ({ page }) => {
  await mockApp(page, { hasLocation: false });
  await page.goto("/?telegram=notifications");
  await expect(page.getByRole("heading", { name: /Хорошая прогулка/ })).toBeVisible();
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.locator(".location-screen")).toBeVisible();
});
