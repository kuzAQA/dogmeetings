import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test.use({ viewport: { width: 390, height: 844 } });

test("viewport exposes the iPhone safe area on first load", async ({ page }) => {
  await openNearby(page);
  await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /viewport-fit=cover/);
});

test("installed app reserves space even before iOS reports its safe area", async ({ page }) => {
  await openNearby(page);
  const browserGap = await page.locator(".bottom-nav").evaluate((dock) => parseFloat(getComputedStyle(dock).bottom));
  expect(browserGap).toBeGreaterThan(0);
  // Simulate standalone mode with the desktop engine's zero safe-area insets.
  const activated = await page.evaluate(() => {
    let count = 0;
    for (const sheet of document.styleSheets) {
      for (const rule of sheet.cssRules) {
        if (rule instanceof CSSMediaRule && rule.conditionText.includes("display-mode: standalone")) {
          rule.media.mediaText = "(max-width: 899px)";
          count++;
        }
      }
    }
    return count;
  });
  expect(activated).toBeGreaterThan(0);
  await expect(page.locator(".bottom-nav")).toHaveCSS("bottom", "50px");
  const gap = await page.locator(".bottom-nav").evaluate((dock) => innerHeight - dock.getBoundingClientRect().bottom);
  expect(gap).toBeGreaterThanOrEqual(50);
});
