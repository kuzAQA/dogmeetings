import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

for (const mode of ["create", "edit"]) {
  test(`notification hint opens and dismisses in the ${mode} walk form`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await openNearby(page);
    const menuHint = page.getByRole("status").filter({ hasText: "Откройте меню, чтобы получать уведомления о прогулках" });
    await expect(menuHint).toBeVisible({ timeout: 10_000 });
    const referenceStyle = await menuHint.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.boxShadow, style.borderRadius, style.fontSize];
    });
    await page.getByRole("button", { name: "Мои планы", exact: true }).click();
    if (mode === "create") await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
    else {
      await page.getByRole("button", { name: "Управлять", exact: true }).click();
      await page.getByRole("button", { name: "Изменить прогулку", exact: true }).click();
    }

    const trigger = page.getByRole("button", { name: "Об уведомлениях в Telegram", exact: true });
    const hint = page.getByRole("status").filter({ hasText: "О вашей прогулке будет отправлено уведомление в бота Telegram, чтобы его увидели другие владельцы собак вашего ЖК." });
    const checkbox = page.getByRole("checkbox", { name: "Отправить уведомление в бота Telegram", exact: true });
    await expect(hint).toHaveCount(0);
    await trigger.click();
    await expect(hint).toBeVisible();
    expect(await hint.evaluate((element) => {
      const style = getComputedStyle(element);
      return [style.backgroundColor, style.boxShadow, style.borderRadius, style.fontSize];
    })).toEqual(referenceStyle);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(checkbox).toBeChecked();
    await expect(page.locator(".field-error")).toHaveCount(0);
    const pointer = await hint.evaluate((element) => {
      const style = getComputedStyle(element);
      const tail = getComputedStyle(element, "::before");
      const bounds = element.getBoundingClientRect();
      return {
        center: bounds.right - parseFloat(tail.right) - parseFloat(tail.borderLeftWidth),
        inset: parseFloat(tail.right),
        radius: parseFloat(style.borderBottomRightRadius),
      };
    });
    const triggerBounds = await trigger.boundingBox();
    expect(pointer.inset).toBeGreaterThanOrEqual(pointer.radius);
    expect(pointer.center).toBeCloseTo(triggerBounds!.x + triggerBounds!.width / 2, 0);
    const bounds = await hint.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.y).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);

    await hint.getByRole("button", { name: "Закрыть подсказку", exact: true }).click();
    await expect(hint).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(hint).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await page.locator("#walk-comment").click({ position: { x: 8, y: 8 } });
    await expect(hint).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
}
