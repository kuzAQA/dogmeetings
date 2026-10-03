import { expect, test } from "@playwright/test";
import { openNearby, walk } from "./fixtures";

test("nearby scroll follows content height and viewport changes", async ({ page }) => {
  test.setTimeout(60_000);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const walks = Array.from({ length: 8 }, (_, index) => ({ ...walk, id: `nearby-${index}` }));

  for (const width of [320, 390, 768, 1280]) {
    const fullHeight = width === 1280 ? 720 : 667;
    for (const nearby of [[], [walk], walks]) {
      await page.setViewportSize({ width, height: fullHeight });
      await openNearby(page, { nearby, mine: [] });
      await page.evaluate(() => document.fonts.ready);

      for (const height of [fullHeight, 430, fullHeight]) {
        await page.setViewportSize({ width, height });
        const shouldScroll = nearby.length === walks.length || height === 430;
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight), `${width}×${height}, ${nearby.length} walks`).toBe(shouldScroll);
        await page.mouse.move(width / 2, 300);
        await page.mouse.wheel(0, 10000);
        await expect.poll(() => page.evaluate(() => scrollY > 0)).toBe(shouldScroll);
        if (shouldScroll) {
          await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeLessThanOrEqual(1);
        }

        const bounds = await page.evaluate(() => {
          const content = document.querySelector(".walks-screen")!.getBoundingClientRect();
          const dock = document.querySelector(".bottom-nav")!.getBoundingClientRect();
          return { contentBottom: content.bottom, dockTop: dock.top };
        });
        expect(bounds.contentBottom).toBeLessThanOrEqual(bounds.dockTop);
        await page.evaluate(() => scrollTo(0, 0));
      }
    }
  }
});

test("nearby removes overflow after filtering a long timeline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await openNearby(page, { nearby: Array.from({ length: 8 }, (_, index) => ({ ...walk, id: `nearby-${index}` })), mine: [] });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.getByRole("button", { name: "Весь день", exact: true }).click();
  await page.getByRole("dialog", { name: "Время прогулки" }).getByRole("button", { name: /^Утро/ }).click();
  await page.getByRole("button", { name: "Показать прогулки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Здесь пока тихо", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
  await page.getByRole("button", { name: "Утро", exact: true }).click();
  await page.getByRole("dialog", { name: "Время прогулки" }).getByRole("button", { name: /^Весь день/ }).click();
  await page.getByRole("button", { name: "Показать прогулки", exact: true }).click();
  await expect(page.locator(".timeline .walk-row")).toHaveCount(8);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
});

test("nearby recalculates available height when safe area insets change", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 667 });
  await openNearby(page, { nearby: [], mine: [] });
  await page.evaluate(() => document.fonts.ready);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);

  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 32, bottom: 24 } });
  await expect.poll(() => page.locator(".page-header").evaluate((element) => element.getBoundingClientRect().top)).toBe(32);
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
  const bounds = await page.evaluate(() => ({
    contentBottom: document.querySelector(".walks-screen")!.getBoundingClientRect().bottom,
    dockTop: document.querySelector(".bottom-nav")!.getBoundingClientRect().top,
    dockBottom: document.querySelector(".bottom-nav")!.getBoundingClientRect().bottom,
  }));
  expect(bounds.contentBottom).toBeLessThanOrEqual(bounds.dockTop);
  expect(bounds.dockBottom).toBeLessThanOrEqual(667 - 24);

  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { top: 0, bottom: 0 } });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(false);
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
});
