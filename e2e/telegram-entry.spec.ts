import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test("Telegram link keeps a new visitor on the welcome screen", async ({ page }) => {
  await mockApp(page, { hasLocation: false });
  let hasSession = false;
  await page.route("**/api/session", (route) => {
    if (route.request().method() === "GET" && !hasSession) {
      return route.fulfill({ status: 401, contentType: "application/json", body: '{"error":"Сессия не найдена."}' });
    }
    if (route.request().method() === "POST") hasSession = true;
    return route.fulfill({ contentType: "application/json", body: '{"hasLocation":false,"location":null}' });
  });

  await page.goto("/?telegram=notifications");
  await expect(page.getByRole("heading", { name: /Хорошая прогулка/ })).toBeVisible();
  await expect(page.locator(".telegram-spotlight")).toHaveCount(0);
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.locator(".location-screen")).toBeVisible();
});

test("Telegram link highlights a working subscription button only on entry", async ({ page }) => {
  await mockApp(page);
  let subscriptionRequests = 0;
  await page.route("**/api/telegram/subscription-link", (route) => {
    subscriptionRequests += 1;
    return route.fulfill({ status: 500, contentType: "application/json", body: '{"error":"Временная ошибка."}' });
  });

  await page.goto("/?telegram=notifications");
  await expect(page.getByRole("heading", { name: /Мой район.*настройки/ })).toBeVisible();
  await expect(page.locator(".telegram-spotlight")).toBeVisible();
  const button = page.getByRole("button", { name: /Получать уведомления в Telegram/ });
  await expect(button).toBeVisible();
  await expect(button).toBeEnabled();
  await button.click();
  await expect(page.getByRole("alert", { name: "" }).filter({ hasText: "Временная ошибка." })).toBeVisible();
  expect(subscriptionRequests).toBe(1);

  await page.goto("/");
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(page.locator(".telegram-spotlight")).toHaveCount(0);
});
