import { expect, test } from "@playwright/test";
import { openNearby, pet } from "./fixtures";

for (const editing of [false, true]) {
  test(`${editing ? "edits" : "creates"} a pet without contact fields`, async ({ page }) => {
    const saved = { ...pet, contactType: "telegram", contact: "@anna" };
    await openNearby(page, { pets: [saved] });
    let submitted = false;
    await page.route("**/api/pets", async (route) => {
      const request = route.request();
      if (request.method() === "POST" || request.method() === "PATCH") {
        const data = await new Request(request.url(), { method: request.method(), headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!).buffer }).formData();
        expect(data.has("contactType")).toBe(false);
        expect(data.has("contact")).toBe(false);
        submitted = true;
        await route.fulfill({ json: { pet: saved } });
      } else await route.fulfill({ json: { pets: [saved] } });
    });
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    if (editing) {
      await page.getByRole("button", { name: /Собака Луна/ }).click();
      await expect(page.locator(".pet-contact-row")).toHaveCount(0);
      await expect(page.getByText("@anna", { exact: true })).toHaveCount(0);
      await page.getByRole("button", { name: /Изменить данные/ }).click();
    } else await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
    await expect(page.locator(".pet-form .field > span:first-child")).toHaveText(["Имя питомца", "Порода", "Имя хозяина", editing ? "Расскажите о себе и Луна" : "Расскажите о себе и..."]);
    await page.getByLabel("Имя питомца", { exact: true }).fill("Боня");
    await page.getByLabel("Порода", { exact: true }).fill("Корги");
    await page.getByLabel("Имя хозяина", { exact: true }).fill("Анна");
    await page.getByRole("button", { name: editing ? "Сохранить изменения" : "Добавить питомца", exact: true }).click();
    await expect(page.getByRole("button", { name: "Готово", exact: true })).toBeVisible();
    expect(submitted).toBe(true);
  });
}
