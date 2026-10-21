import { expect, test, type Page } from "@playwright/test";
import { mockApp } from "./fixtures";

const campaignId = "telegram-reconnect-2026-10-21";
const banner = {
  id: campaignId, startsAt: new Date(Date.now() - 1000).toISOString(),
  endsAt: new Date(Date.now() + 48 * 3600_000).toISOString(), permanent: false,
  pages: [{ title: "Подключите уведомления заново", text: "Нажмите Telegram и подтвердите подключение в боте.", example: "telegram-dock" }]
};

async function campaign(page: Page, { firstSlide = false, failReceipt = false, noPets = false } = {}) {
  await mockApp(page, noPets ? { pets: [] } : {});
  let seen = false;
  let posts = 0;
  await page.route("**/api/announcements", async route => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postDataJSON().id).toBe(campaignId);
      if (failReceipt) return route.fulfill({ status: 500, json: { error: "Offline" } });
      seen = true;
      return route.fulfill({ json: { acknowledged: true } });
    }
    return route.fulfill({ json: { serverTime: new Date().toISOString(), banners: seen ? [] : [
      ...(firstSlide ? [{ ...banner, id: "earlier-banner", pages: [{ title: "Первый баннер", text: "Другая новость" }] }] : []), banner
    ] } });
  });
  await page.goto("/");
  return () => posts;
}

test("reconnect is remembered on display without clicking or dismissing", async ({ page }) => {
  const posts = await campaign(page);
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toBeVisible();
  await expect.poll(posts).toBe(1);
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toHaveCount(0);
});

test("a reconnect slide is not recorded until it is actually visible", async ({ page }) => {
  const posts = await campaign(page, { firstSlide: true });
  await expect(page.getByRole("heading", { name: "Первый баннер" })).toBeVisible();
  await page.waitForTimeout(200);
  expect(posts()).toBe(0);
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toBeVisible();
  await expect.poll(posts).toBe(1);
});

test("local receipt prevents a repeat when saving the server receipt fails", async ({ page }) => {
  const posts = await campaign(page, { failReceipt: true });
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toBeVisible();
  await expect.poll(posts).toBeGreaterThan(0);
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toHaveCount(0);
});

test("the server receipt prevents repeats when local storage is blocked", async ({ page }) => {
  await page.addInitScript(() => {
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  const posts = await campaign(page);
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toBeVisible();
  await expect.poll(posts).toBe(1);
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.waitForTimeout(3500);
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toHaveCount(0);
});

test("reconnect also reaches users who have not added a pet", async ({ page }) => {
  const posts = await campaign(page, { noPets: true });
  await expect(page.getByRole("heading", { name: banner.pages[0].title })).toBeVisible();
  await expect.poll(posts).toBe(1);
});
