import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("liquid dock keeps its width, gap and clear content on mobile", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  for (const width of [320, 375, 430]) {
    await page.setViewportSize({ width, height: 844 });
    await openNearby(page);
    const dock = page.locator(".bottom-nav");
    const pill = dock.locator(".nav-tabs");
    const before = (await pill.boundingBox())!;
    await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
    await expect(dock).toHaveAttribute("data-moving", "true");
    const frames = await dock.evaluate(async (element) => {
      const samples = [];
      while (element.getAttribute("data-moving") === "true") {
        const pill = element.querySelector<HTMLElement>(".nav-tabs")!;
        const bounds = pill.getBoundingClientRect();
        const matrix = new DOMMatrixReadOnly(getComputedStyle(pill).transform);
        const drop = element.querySelector<HTMLElement>(".dock-drop-shape")!.getBoundingClientRect();
        samples.push({ width: bounds.width, y: bounds.y, scaleX: matrix.a, scaleY: matrix.d, x: bounds.x, dropLeft: drop.left, dropRight: drop.right, filter: getComputedStyle(pill).filter });
        await new Promise(requestAnimationFrame);
      }
      return samples;
    });
    expect(frames.length).toBeGreaterThan(2);
    for (const frame of frames) {
      expect(Math.abs(frame.width - before.width)).toBeLessThanOrEqual(0.5);
      expect(frame.y).toBe(before.y);
      expect(frame.scaleX).toBe(1);
      expect(frame.scaleY).toBe(1);
      expect(frame.filter).toBe("none");
      expect(frame.dropLeft).toBeGreaterThanOrEqual(0);
      expect(frame.dropRight).toBeLessThanOrEqual(width);
    }
    const after = (await pill.boundingBox())!;
    const add = (await dock.locator(".dock-add").boundingBox())!;
    expect(after.width).toBe(before.width);
    expect(after.x - before.x).toBeCloseTo((add.width + 12) / 2, 1);
    expect(after.x - add.x - add.width).toBeCloseTo(12, 1);
    expect((add.x + after.x + after.width) / 2).toBeCloseTo(width / 2, 1);
    await expect(dock.locator(".dock-goo")).toHaveCSS("filter", "none");
    await expect(dock.locator(".dock-bridge")).toHaveCSS("visibility", "hidden");
    await expect(dock.locator(".dock-add")).toBeEnabled();
    await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
    await expect(dock.locator(".dock-add")).toBeEnabled();
    await expect(dock.locator(".dock-add")).toHaveCSS("opacity", "1");
    await expect(dock.locator(".dock-add")).toHaveAttribute("aria-label", "Добавить питомца");
    expect((await pill.boundingBox())!.x).toBeCloseTo(after.x, 1);
    expect((await dock.locator(".dock-add").boundingBox())!.x).toBeCloseTo(add.x, 1);
    expect(await dock.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    await dock.getByRole("button", { name: "Рядом", exact: true }).click();
    await expect(dock.locator(".dock-add")).toBeDisabled();
    await expect(dock).toHaveAttribute("data-moving", "false");
    await expect(dock.locator(".dock-add")).toHaveCSS("opacity", "0");
    expect((await pill.boundingBox())!.x).toBeCloseTo(before.x, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  }
});

test("liquid dock preserves durations when production CSS uses seconds", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page);
  const dock = page.locator(".bottom-nav");
  await dock.evaluate((element) => {
    const style = (element as HTMLElement).style;
    style.setProperty("--dock-enter", ".3472s");
    style.setProperty("--dock-exit", ".2688s");
  });
  for (const [tab, duration] of [["Мои планы", 347.2], ["Рядом", 268.8]] as const) {
    await dock.getByRole("button", { name: tab, exact: true }).click();
    const durations = await dock.evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => animation.effect!.getTiming().duration));
    expect(durations).toHaveLength(5);
    for (const actual of durations) expect(Number(actual)).toBeCloseTo(duration, 4);
    await expect(dock).toHaveAttribute("data-moving", "false");
  }
});

test("nearby to pets reveals the same liquid action and opens the pet form", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page);
  const dock = page.locator(".bottom-nav");
  const add = dock.locator(".dock-add");
  await dock.locator(".dock-item--pets").click();
  await expect(dock).toHaveAttribute("data-moving", "true");
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute("aria-label", "Добавить питомца");
  await expect(add).toBeEnabled();
  await expect(dock).toHaveAttribute("data-moving", "false");
  await add.click();
  await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
});

test("liquid dock reverses from its current frame and follows the last route", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await openNearby(page);
  const result = await page.locator(".bottom-nav").evaluate(async (dock) => {
    const tabs = dock.querySelector<HTMLElement>(".nav-tabs")!;
    const plans = dock.querySelector<HTMLButtonElement>(".dock-item--plans")!;
    const nearby = dock.querySelector<HTMLButtonElement>(".dock-item--nearby")!;
    const movement = [];
    // Flip early, halfway, and near the end, then make ten rapid switches.
    plans.click();
    for (const delay of [50, 100, 300, 150, 550, 100, ...Array.from({ length: 10 }, (_, i) => 50 + (i % 3) * 50)]) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      const moving = dock.getAttribute("data-moving") === "true";
      for (const animation of dock.getAnimations({ subtree: true })) {
        const time = animation.currentTime;
        animation.pause();
        animation.currentTime = time;
      }
      const before = tabs.getBoundingClientRect().x;
      const drop = getComputedStyle(dock.querySelector(".dock-drop-shape")!);
      const shape = drop.transform;
      const selected = plans.getAttribute("aria-current") === "page";
      (selected ? nearby : plans).click();
      // A microtask lets React commit without advancing the animation clock.
      await Promise.resolve();
      for (const animation of dock.getAnimations({ subtree: true })) {
        animation.pause();
        animation.currentTime = 0;
      }
      movement.push({ jump: Math.abs(tabs.getBoundingClientRect().x - before), moving, shape, nextShape: getComputedStyle(dock.querySelector(".dock-drop-shape")!).transform });
      dock.getAnimations({ subtree: true }).forEach((animation) => animation.play());
    }
    plans.click();
    return movement;
  });
  for (const frame of result) {
    expect(frame.jump).toBeLessThanOrEqual(0.5);
    if (frame.moving) expect(frame.nextShape).toBe(frame.shape);
  }
  await expect(page.locator(".dock-item--plans")).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".bottom-nav")).toHaveAttribute("data-moving", "false");
  expect(await page.locator(".bottom-nav").evaluate((dock) => dock.getAnimations({ subtree: true }).length)).toBe(0);
  expect(errors).toEqual([]);
});

test("liquid dock blocks input until completion, transfers focus and cleans up on unmount", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 844 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page);
  const dock = page.locator(".bottom-nav");
  const add = dock.locator(".dock-add");
  await dock.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(add).toBeDisabled();
  await expect(add).toHaveAttribute("tabindex", "-1");
  await add.evaluate((button) => (button as HTMLButtonElement).click());
  await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  await expect(add).toBeEnabled();
  await add.focus();
  await dock.locator(".dock-item--nearby").evaluate((button) => (button as HTMLButtonElement).click());
  await expect(dock.locator(".dock-item--nearby")).toBeFocused();
  await expect(add).toBeDisabled();
  await expect.poll(() => add.evaluate((element) => parseFloat(getComputedStyle(element).opacity))).toBeLessThan(0.5);
  await dock.locator(".dock-item--plans").click();
  await expect(add).toBeEnabled();
  await add.click();
  await expect(page.getByLabel("Комментарий", { exact: false })).toBeVisible();
  await expect(dock).toHaveCount(0);
  expect(await page.evaluate(() => document.getAnimations().some((animation) => (animation.effect as KeyframeEffect).target instanceof Element && (animation.effect as KeyframeEffect).target instanceof HTMLElement && ((animation.effect as KeyframeEffect).target as HTMLElement).closest(".bottom-nav")))).toBe(false);
});

test("reduced motion settles immediately, including when enabled mid-transition", async ({ page, browserName }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page);
  await page.locator(".dock-item--plans").click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".dock-goo")).toHaveCSS("filter", "none");
  expect(await page.locator(".bottom-nav").evaluate((dock) => dock.getAnimations({ subtree: true }).length)).toBe(0);
  await page.locator(".dock-item--pets").click();
  await expect(page.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".dock-add")).toHaveCSS("opacity", "1");
  await page.locator(".dock-item--nearby").click();
  await expect(page.locator(".dock-add")).toBeDisabled();
  await expect(page.locator(".dock-add")).toHaveCSS("opacity", "0");
  await page.locator(".dock-item--plans").click();
  await expect(page.locator(".dock-add")).toBeEnabled();
  await page.locator(".dock-item--plans").focus();
  await expect(page.locator(".dock-item--plans")).toBeFocused();
  // macOS WebKit uses Option+Tab to include buttons in keyboard traversal.
  const nextControl = browserName === "webkit" ? "Alt+Tab" : "Tab";
  await page.keyboard.press(nextControl);
  await expect(page.locator(".dock-item--pets")).toBeFocused();
  await page.keyboard.press(nextControl);
  await expect(page.locator(".dock-add")).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByLabel("Комментарий", { exact: false })).toBeVisible();
});
