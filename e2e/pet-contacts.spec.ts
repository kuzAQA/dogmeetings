import { expect, test } from "@playwright/test";
import { openNearby, pet } from "./fixtures";

for (const [type, input, display, href] of [
  ["phone", "89111233111", "+7 (911) 123 31-11", "tel:+79111233111"],
  ["telegram", "@myName", "@myName", "https://t.me/myName"],
  ["other", "Email: me@example.com", "Email: me@example.com", null],
] as const) {
  test(`creates and reopens a pet with ${type} contact`, async ({ page }) => {
    await openNearby(page);
    let saved = { ...pet, name: "Боня", contactType: type, contact: "" };
    await page.route("**/api/pets", async (route) => {
      const request = route.request();
      if (request.method() === "POST" || request.method() === "PATCH") {
        const data = await new Request(request.url(), { method: request.method(), headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!).buffer }).formData();
        saved = { ...saved, contactType: data.get("contactType") as typeof type, contact: String(data.get("contact")) };
        await route.fulfill({ json: { pet: saved } });
      } else await route.fulfill({ json: { pets: [saved] } });
    });
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
    await expect(page.locator(".pet-form .field > span:first-child")).toHaveText(["Имя питомца", "Порода", "Имя хозяина", "Тип контакта", "Контакт"]);
    await page.getByLabel("Имя питомца", { exact: true }).fill("Боня");
    await page.getByLabel("Порода", { exact: true }).fill("Корги");
    await page.getByLabel("Имя хозяина", { exact: true }).fill("Анна");
    await page.getByLabel("Тип контакта", { exact: true }).selectOption(type);
    const field = page.getByRole("textbox", { name: "Контакт", exact: true });
    if (type === "phone") {
      await field.pressSequentially("9111233111");
      await expect(field).toHaveValue(display);
      await field.press("Backspace");
      await expect(field).toHaveValue("+7 (911) 123 31-1");
      await field.fill("+7 (911) 123 31-11");
      await field.press("ArrowLeft");
      await field.press("ArrowLeft");
      await field.press("Backspace");
      await expect(field).toHaveValue("+7 (911) 123 31-1");
      await field.fill("911");
      await field.blur();
      await expect(page.getByText("Введите телефон полностью: +7 (911) 123 31-11.", { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Добавить питомца", exact: true })).toBeDisabled();
    }
    await field.fill(input);
    if (type === "phone") await expect(field).toHaveValue(display);
    if (type === "telegram") {
      await expect(field).toHaveValue("myName");
      await expect(page.locator(".contact-prefix")).toHaveText("@");
    }
    if (type !== "other") await test.info().attach("contact-form", { body: await page.screenshot({ path: test.info().outputPath("contact-form.png"), fullPage: true }), contentType: "image/png" });
    await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
    await page.getByRole("button", { name: "Готово", exact: true }).click();
    await page.reload();
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: /Собака Боня/ }).click();
    if (type === "phone") await test.info().attach("contact-passport", { body: await page.screenshot({ path: test.info().outputPath("contact-passport.png"), fullPage: true }), contentType: "image/png" });
    if (href) await expect(page.getByRole("link", { name: display, exact: true })).toHaveAttribute("href", href);
    else await expect(page.locator(".facts dd").last()).toHaveText(display);
    await page.getByRole("button", { name: "Изменить данные", exact: false }).click();
    await expect(page.getByLabel("Тип контакта", { exact: true })).toHaveValue(type);
    await expect(field).toHaveValue(type === "telegram" ? "myName" : display);
    await field.fill("");
    await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    await page.getByRole("button", { name: "Готово", exact: true }).click();
    await page.getByRole("button", { name: /Собака Боня/ }).click();
    await expect(page.locator(".facts dd")).toHaveCount(2);
  });
}
