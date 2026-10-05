import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("dock starts at its visible position after a busy route commit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  for (const target of ["pets", "nearby"]) {
    const frames = await page.locator(".bottom-nav").evaluate(async (dock, target) => {
      const pill = dock.querySelector<HTMLElement>(".nav-tabs")!;
      const indicator = dock.querySelector<HTMLElement>(".nav-indicator")!;
      const read = () => ({ x: pill.getBoundingClientRect().x, indicator: indicator.getBoundingClientRect().x });
      const before = read();
      dock.querySelector<HTMLButtonElement>(`.dock-item--${target}`)!.click();
      // Simulate route rendering work before the browser can paint the new tracks.
      const busyUntil = performance.now() + 100;
      while (performance.now() < busyUntil) { /* Keep this commit on the main thread. */ }
      const samples = [];
      for (let frame = 0; frame < 2; frame++) {
        await new Promise(requestAnimationFrame);
        samples.push(read());
      }
      return { before, samples };
    }, target);
    for (const frame of frames.samples) {
      expect(Math.abs(frame.x - frames.before.x), target).toBeLessThan(0.5);
      expect(Math.abs(frame.indicator - frames.before.indicator), target).toBeLessThan(0.5);
    }
    await expect(page.locator(".bottom-nav")).toHaveAttribute("data-moving", "false");
    await expect.poll(() => page.locator(".nav-indicator").evaluate((el) => el.getAnimations().length)).toBe(0);
  }
});

test.describe("mobile layout viewport", () => {
  test.use({ isMobile: true, hasTouch: true });

  test("touch transitions keep the fixed dock and viewport at the same height", async ({ page }) => {
    test.setTimeout(45_000);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    for (const [width, height] of [[375, 667], [430, 844]]) {
      await page.setViewportSize({ width, height });
      // Both shared empty panels and populated collections animate differently.
      for (const empty of [true, false]) {
        await openNearby(page, empty ? { nearby: [], mine: [], pets: [] } : undefined);
        const dock = page.locator(".bottom-nav");
        await dock.evaluate((element) => {
          const samples: { y: number; width: number; height: number; scrollWidth: number }[] = [];
          let running = true;
          const sample = () => {
            samples.push({ y: element.getBoundingClientRect().y, width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth });
            if (running) requestAnimationFrame(sample);
          };
          sample();
          Object.assign(window, { stopDockSamples: () => { running = false; return samples; } });
        });
        for (const target of ["plans", "pets", "plans", "nearby", "pets", "nearby"]) {
          await dock.locator(`.dock-item--${target}`).tap();
          await expect(dock).toHaveAttribute("data-moving", "false");
          await expect.poll(() => dock.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
        }
        for (const target of ["pets", "plans", "nearby", "pets", "nearby", "plans"]) {
          await dock.locator(`.dock-item--${target}`).tap({ force: true });
          await page.waitForTimeout(50);
        }
        await expect(dock).toHaveAttribute("data-moving", "false");
        await expect.poll(() => dock.evaluate((el) => el.getAnimations({ subtree: true }).length)).toBe(0);
        const samples = await page.evaluate(() => (window as unknown as { stopDockSamples: () => { y: number; width: number; height: number; scrollWidth: number }[] }).stopDockSamples());
        expect(samples.length).toBeGreaterThan(30);
        for (const sample of samples) {
          expect(sample.width).toBe(width);
          expect(sample.height).toBe(height);
          expect(sample.scrollWidth).toBeLessThanOrEqual(width);
          expect(Math.abs(sample.y - samples[0].y)).toBeLessThan(0.5);
        }
      }
    }
  });
});
