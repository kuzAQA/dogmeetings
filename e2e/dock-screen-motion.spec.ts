import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("empty walk action does not restart its fade when leaving plans", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  const dock = page.locator(".bottom-nav");
  for (const target of ["pets", "nearby"]) {
    await dock.locator(".dock-item--plans").click();
    await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
    await expect(page.locator("main .my-walks-screen .state-block")).toBeVisible();
    const sample = await dock.evaluate((element, target) => {
      element.querySelector<HTMLButtonElement>(`.dock-item--${target}`)!.click();
      const states = document.querySelectorAll("main [data-dock-panel] .state-block, .dock-screen-exit .state-block");
      return Array.from(states, (state) => ({
        opacity: getComputedStyle(state).opacity,
        transitions: state.getAnimations().filter((animation) => animation instanceof CSSTransition).length,
      }));
    }, target);
    expect(sample.length).toBeGreaterThan(0);
    for (const state of sample) expect(state).toEqual({ opacity: "1", transitions: 0 });
    await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  }
});

test("screen choreography shares the + clock and keeps the action between plans and pets", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  const dock = page.locator(".bottom-nav");
  const result = await dock.evaluate((element) => {
    element.querySelector<HTMLButtonElement>(".dock-item--plans")!.click();
    const action = element.querySelector(".dock-add");
    const plus = element.getAnimations({ subtree: true }).find((animation) => (animation.effect as KeyframeEffect).target === action)!;
    const panel = document.querySelector("main [data-dock-panel]")!;
    const panelMove = panel.getAnimations().find((animation) => "transform" in (animation.effect as KeyframeEffect).getKeyframes()[0])!;
    const title = document.querySelector("main .my-walks-screen h1")!;
    const titleMove = title.getAnimations().find((animation) => "transform" in (animation.effect as KeyframeEffect).getKeyframes()[0])!;
    return {
      plusStart: Number(plus.startTime), panelStart: Number(panelMove.startTime), titleStart: Number(titleMove.startTime),
      plusDuration: Number(plus.effect!.getTiming().duration), panelDuration: Number(panelMove.effect!.getTiming().duration),
      titleDuration: Number(titleMove.effect!.getTiming().duration), titleDelay: titleMove.effect!.getTiming().delay,
      ghostHidden: document.querySelector<HTMLElement>(".dock-screen-exit")!.inert,
      titleEntry: (titleMove.effect as KeyframeEffect).getKeyframes()[0].transform,
    };
  });
  expect(result.panelStart).toBe(result.plusStart);
  expect(result.plusDuration).toBeCloseTo(451.36, 3);
  expect(result.titleStart).toBe(result.plusStart);
  expect(result.panelDuration).toBeCloseTo(result.plusDuration, 3);
  expect(result.titleDuration).toBeCloseTo(result.plusDuration * 500 / 640, 3);
  expect(result.titleDelay).toBeCloseTo(result.plusDuration * 95 / 640, 3);
  expect(result.titleEntry).toBe("translateY(24px) scale(0.975)");
  expect(result.ghostHidden).toBe(true);
  await expect(dock.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  const position = await dock.locator(".dock-add").boundingBox();
  await dock.locator(".dock-item--pets").click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  expect(await dock.getAttribute("data-moving")).toBe("false");
  expect(await dock.locator(".dock-add").boundingBox()).toEqual(position);
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  const reverse = await dock.evaluate((element) => {
    element.querySelector<HTMLButtonElement>(".dock-item--plans")!.click();
    const firstTransform = (selector: string, last: boolean) => {
      const animation = document.querySelector(selector)!.getAnimations().find((animation) => "transform" in (animation.effect as KeyframeEffect).getKeyframes()[0])!;
      const frames = (animation.effect as KeyframeEffect).getKeyframes();
      return frames[last ? frames.length - 1 : 0].transform;
    };
    return { entry: firstTransform("main .my-walks-screen h1", false), exit: firstTransform(".dock-screen-exit h1", true) };
  });
  expect(reverse.entry).toBe("translateX(-30px) scale(0.98)");
  expect(reverse.exit).toBe("translateX(30px) scale(0.98)");
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  await dock.locator(".dock-item--nearby").click();
  await expect(dock).toHaveAttribute("data-moving", "false");
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  await expect(dock.locator(".dock-add")).toHaveCSS("opacity", "0");
});

test("interrupted screen motion follows the remaining + duration and cleans up", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const sample = await page.locator(".bottom-nav").evaluate(async (dock) => {
    dock.querySelector<HTMLButtonElement>(".dock-item--plans")!.click();
    await new Promise((resolve) => setTimeout(resolve, 100));
    dock.querySelector<HTMLButtonElement>(".dock-item--nearby")!.click();
    const plus = dock.getAnimations({ subtree: true }).find((animation) => (animation.effect as KeyframeEffect).target === dock.querySelector(".dock-add"))!;
    const panel = document.querySelector("main [data-dock-panel]")!.getAnimations()[0];
    return { plusDuration: Number(plus.effect!.getTiming().duration), panelDuration: Number(panel.effect!.getTiming().duration), plusStart: plus.startTime, panelStart: panel.startTime };
  });
  expect(sample.panelStart).toBe(sample.plusStart);
  expect(sample.panelDuration).toBeCloseTo(sample.plusDuration, 3);
  expect(sample.plusDuration).toBeLessThan(349.44);
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  await page.locator(".dock-item--pets").click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect.poll(() => page.locator("main [data-dock-panel]").evaluate((element) => element.getAnimations().length)).toBe(0);
  expect(errors).toEqual([]);
});

test("plans and pets use matching choreography in both directions", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  const dock = page.locator(".bottom-nav");
  await dock.locator(".dock-item--plans").click();
  await expect(dock.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  const snapshots = [];
  for (const target of ["pets", "plans"]) {
    snapshots.push(await dock.evaluate((element, target) => {
      element.querySelector<HTMLButtonElement>(`.dock-item--${target}`)!.click();
      const tracks = (selector: string) => document.querySelector(selector)!.getAnimations().map((animation) => {
        const effect = animation.effect as KeyframeEffect;
        const frames = effect.getKeyframes();
        const property = ["opacity", "transform", "filter"].find((name) => name in frames[0])!;
        const normalize = (value: unknown) => String(value).replace("translateX(-", "translateX(");
        return { property, duration: Number(effect.getTiming().duration).toFixed(3), delay: Number(effect.getTiming().delay).toFixed(3), easing: effect.getTiming().easing, from: normalize(frames[0][property]), to: normalize(frames.at(-1)![property]) };
      });
      return { title: tracks("main .screen > h1"), panel: tracks("main [data-dock-panel]"), exitTitle: tracks(".dock-screen-exit > h1"), exitPanel: tracks(".dock-screen-exit [data-dock-panel]") };
    }, target));
    await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
  }
  expect(snapshots[1]).toEqual(snapshots[0]);
});

test("switching collections during + entry uses its remaining time without replaying it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await openNearby(page, { nearby: [], mine: [], pets: [] });
  const sample = await page.locator(".bottom-nav").evaluate(async (dock) => {
    const add = dock.querySelector<HTMLElement>(".dock-add")!;
    dock.querySelector<HTMLButtonElement>(".dock-item--plans")!.click();
    const plus = add.getAnimations()[0];
    await new Promise((resolve) => setTimeout(resolve, 100));
    const remaining = Number(plus.effect!.getComputedTiming().endTime) - Number(plus.currentTime);
    dock.querySelector<HTMLButtonElement>(".dock-item--pets")!.click();
    const panel = document.querySelector("main [data-dock-panel]")!.getAnimations().find((animation) => "transform" in (animation.effect as KeyframeEffect).getKeyframes()[0])!;
    const indicator = dock.querySelector(".nav-indicator")!.getAnimations()[0];
    return { samePlus: add.getAnimations()[0] === plus, remaining, panelDuration: Number(panel.effect!.getTiming().duration), indicatorDuration: Number(indicator.effect!.getTiming().duration), panelStart: panel.startTime, indicatorStart: indicator.startTime };
  });
  expect(sample.samePlus).toBe(true);
  expect(sample.panelStart).toBe(sample.indicatorStart);
  expect(sample.indicatorDuration).toBeCloseTo(sample.remaining, 3);
  expect(sample.panelDuration).toBeCloseTo(sample.remaining * 540 / 640, 3);
  await expect(page.locator(".dock-add")).toBeEnabled();
  await expect(page.locator(".dock-screen-exit")).toHaveCount(0);
});
