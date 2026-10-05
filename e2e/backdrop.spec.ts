import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

test("shared backdrop transitions during sheet open and close", async ({ page }) => {
  await openNearby(page);
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  const trigger = page.getByRole("button", { name: /^Время/ });
  await page.evaluate(() => {
    const state = window as Window & { backdropTransitions?: { property: string; opacity: unknown[] }[] };
    state.backdropTransitions = [];
    document.addEventListener("transitionrun", (event) => {
      if (!(event.target instanceof HTMLElement) || !event.target.classList.contains("sheet-backdrop")) return;
      const transition = event.target.getAnimations().find((animation) => animation instanceof CSSTransition && animation.transitionProperty === event.propertyName);
      const effect = transition?.effect;
      state.backdropTransitions!.push({ property: event.propertyName, opacity: effect instanceof KeyframeEffect ? effect.getKeyframes().map((frame) => frame.opacity) : [] });
    });
  });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Встречаемся сегодня" });
  const sheet = page.locator(".react-modal-sheet-root").filter({ has: dialog });
  const backdrop = sheet.locator(".sheet-backdrop");

  await expect(dialog).toBeVisible();
  await expect(sheet).toHaveAttribute("data-sheet-state", "open");
  await expect(backdrop).toHaveClass(/react-modal-sheet-backdrop/);
  await expect(backdrop).toHaveCSS("transition-property", "opacity");
  await expect.poll(() => page.evaluate(() => (window as Window & { backdropTransitions?: { property: string; opacity: unknown[] }[] }).backdropTransitions ?? [])).toContainEqual({ property: "opacity", opacity: ["0", "1"] });

  await backdrop.click({ force: true });
  await expect(sheet).toHaveAttribute("data-sheet-state", "closing");
  await expect.poll(() => backdrop.evaluate((element) => element.getAnimations().some((animation) => animation instanceof CSSTransition && animation.transitionProperty === "opacity"))).toBe(true);

  await expect(dialog).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await trigger.click();
  await expect(backdrop).toHaveCSS("transition-duration", "0s");
});
