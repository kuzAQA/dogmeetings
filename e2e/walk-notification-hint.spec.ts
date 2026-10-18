import { expect, test } from "@playwright/test";
import { openNearby } from "./fixtures";

for (const mode of ["create", "edit"]) {
  test(`Telegram popup is absent while notification preference works in ${mode}`, async ({ page }) => {
    await openNearby(page);
    await page.getByRole("button", { name: "Планы", exact: true }).click();
    if (mode === "create") await page.getByRole("button", { name: "Создать прогулку", exact: true }).click();
    else {
      await page.getByRole("button", { name: "Управлять", exact: true }).click();
      await page.getByRole("button", { name: "Изменить прогулку", exact: true }).click();
    }
    await expect(page.getByRole("button", { name: "Об уведомлениях в Telegram", exact: true })).toHaveCount(0);
    const checkbox = page.getByRole("checkbox", { name: "Отправить уведомление в бота Telegram", exact: true });
    await expect(checkbox).toBeChecked();
    await checkbox.uncheck();
    await expect(checkbox).not.toBeChecked();
  });
}
