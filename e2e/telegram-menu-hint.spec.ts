import { expect, test } from "@playwright/test";
import { mockApp, openNearby } from "./fixtures";

const seenKey = "dogmeet.telegramMenuHintSeen.v2";
const hintText = "Вы можете получать уведомления о прогулках ваших друзей в Telegram";

test("Telegram hint grows from its pointer without covering navigation", async ({ page }) => {
  await openNearby(page);
  const hint = page.getByRole("status").filter({ hasText: hintText });
  await expect(hint).toBeVisible();
  const frames = await hint.evaluate((element) => {
    const animation = element.getAnimations()[0];
    if (!animation) throw new Error("Telegram hint has no entrance animation");
    animation.pause();
    const duration = Number(animation.effect!.getTiming().duration);
    const navigationTop = element.closest("nav")!.getBoundingClientRect().top;
    const samples = Array.from({ length: 32 }, (_, index) => {
      animation.currentTime = duration * index / 31;
      const bounds = element.getBoundingClientRect();
      const scale = new DOMMatrix(getComputedStyle(element).transform).a;
      return { left: bounds.left, right: bounds.right, top: bounds.top, tip: bounds.bottom + 12 * scale, navigationTop, viewportWidth: innerWidth, scale };
    });
    animation.finish();
    return samples;
  });
  expect(frames[0].scale).toBeCloseTo(0.35);
  expect(frames.at(-1)!.scale).toBeCloseTo(1);
  for (const frame of frames) {
    expect(frame.left).toBeGreaterThanOrEqual(0);
    expect(frame.right).toBeLessThanOrEqual(frame.viewportWidth);
    expect(frame.top).toBeGreaterThanOrEqual(0);
    expect(frame.tip).toBeLessThanOrEqual(frame.navigationTop);
    expect(Math.abs(frame.tip - frames[0].tip)).toBeLessThan(1);
  }
});

test("Telegram hint respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openNearby(page);
  const hint = page.getByRole("status").filter({ hasText: hintText });
  await expect(hint).toBeVisible();
  await expect(hint).toHaveCSS("animation-name", "none");
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
});

test("Telegram hint points at the button and is remembered on display", async ({ page, context }, testInfo) => {
  await openNearby(page);
  const hint = page.getByRole("status").filter({ hasText: hintText });
  await expect(hint).toBeVisible();
  await expect.poll(() => page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
  await hint.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const bubble = (await hint.boundingBox())!;
  const telegram = (await page.getByRole("button", { name: "Telegram", exact: true }).boundingBox())!;
  const navigation = (await page.getByRole("navigation", { name: "Основная навигация" }).boundingBox())!;
  const viewport = page.viewportSize()!;
  expect(bubble.x).toBeGreaterThanOrEqual(0);
  expect(bubble.x + bubble.width).toBeLessThanOrEqual(viewport.width);
  expect(bubble.y).toBeGreaterThanOrEqual(0);
  expect(bubble.y + bubble.height + 12).toBeLessThanOrEqual(navigation.y);
  const pointerX = await hint.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const pointer = getComputedStyle(element, "::before");
    return bounds.right - parseFloat(pointer.right) - parseFloat(pointer.borderRightWidth);
  });
  expect(Math.abs(pointerX - (telegram.x + telegram.width / 2))).toBeLessThanOrEqual(2);
  await page.screenshot({ path: testInfo.outputPath("telegram-hint.png") });

  // Reload without closing: remember display, not dismissal.
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await expect(hint).toHaveCount(0);
  await page.getByRole("button", { name: "Планы", exact: true }).click();
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await page.waitForTimeout(3_500);
  await expect(hint).toHaveCount(0);
  const reopened = await context.newPage();
  await mockApp(reopened);
  await reopened.goto("/");
  await expect(reopened.locator(".walks-screen")).toBeVisible();
  await reopened.waitForTimeout(3_500);
  await expect(reopened.getByText(hintText)).toHaveCount(0);
});

test("Telegram hint closes and does not return after navigation", async ({ page }) => {
  await openNearby(page);
  const hint = page.getByRole("status").filter({ hasText: hintText });
  await expect(hint).toBeVisible();
  await hint.getByRole("button", { name: "Закрыть подсказку", exact: true }).click();
  await expect(hint).toHaveCount(0);
  await page.getByRole("button", { name: "Планы", exact: true }).click();
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await page.waitForTimeout(3_500);
  await expect(hint).toHaveCount(0);
});

test("previously seen Telegram hints stay hidden", async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: seenKey, value: "1", url: baseURL! }]);
  await openNearby(page);
  await page.waitForTimeout(3_500);
  await expect(page.getByText(hintText)).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), seenKey)).toBe("1");
  await context.clearCookies();
  await page.reload();
  await expect(page.locator(".walks-screen")).toBeVisible();
  await page.waitForTimeout(3_500);
  await expect(page.getByText(hintText)).toHaveCount(0);
});
