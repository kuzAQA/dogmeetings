import { expect, test } from "@playwright/test";
import { mockApp, pet, walk } from "./fixtures";

for (const editing of [false, true]) {
  test(`${editing ? "edit" : "create"}: description unlocks on blur and survives save/reload/clear`, async ({ page }) => {
    let saved = { ...pet, description: editing ? "Любим гулять" : "" };
    let exists = editing;
    await mockApp(page);
    await page.route("**/api/pets", async route => {
      const request = route.request();
      if (["POST", "PATCH"].includes(request.method())) {
        const data = await new Request(request.url(), { method: request.method(), headers: request.headers(), body: new Uint8Array(request.postDataBuffer()!).buffer }).formData();
        exists = true;
        saved = { ...saved, name: String(data.get("petName")), description: String(data.get("description") ?? "") };
        await route.fulfill({ json: { pet: saved } });
      } else await route.fulfill({ json: { pets: exists ? [saved] : [] } });
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    if (editing) {
      await page.getByRole("button", { name: /Собака Луна/ }).click();
      await page.getByRole("button", { name: /Изменить данные/ }).click();
    } else await page.getByRole("button", { name: "Добавить питомца", exact: true }).filter({ hasNot: page.locator("svg") }).click();
    const name = page.getByLabel("Имя питомца", { exact: true });
    const description = page.locator('textarea[name="description"]');
    const counter = page.locator("#pet-description-counter");
    await expect(counter).toHaveText(editing ? "12/100" : "0/100");
    if (editing) await expect(description).toBeEnabled();
    else {
      await expect(description).toBeDisabled();
      await name.fill("бОня");
      await expect(description).toBeDisabled();
      await name.press("Tab");
      await expect(description).toBeEnabled();
    }
    await description.fill("Описание");
    await expect(counter).toHaveText("8/100");
    await name.fill("Шарик");
    await expect(page.getByText(editing ? "Расскажите о себе и Луна" : "Расскажите о себе и бОня", { exact: true })).toBeVisible();
    await name.press("Tab");
    await expect(page.getByText("Расскажите о себе и Шарик", { exact: true })).toBeVisible();
    await name.fill("   ");
    await expect(description).toBeDisabled();
    await expect(page.getByText("Расскажите о себе и...", { exact: true })).toBeVisible();
    await expect(description).toHaveValue("Описание");
    await name.fill("бОня");
    await name.press("Tab");
    await expect(page.getByText("Расскажите о себе и бОня", { exact: true })).toBeVisible();
    await description.fill("я".repeat(100));
    await expect(counter).toHaveText("100/100");
    await description.press("End");
    await description.press("a");
    await expect(description).toHaveValue("я".repeat(100));
    await description.fill("");
    await expect(counter).toHaveText("0/100");
    await page.keyboard.insertText("я".repeat(101));
    await expect(description).toHaveValue("я".repeat(100));
    await page.screenshot({ path: test.info().outputPath("description-form.png"), fullPage: true });
    await page.getByLabel("Порода", { exact: true }).fill("Корги");
    await page.getByLabel("Имя хозяина", { exact: true }).fill("Анна");
    await page.getByRole("button", { name: editing ? "Сохранить изменения" : "Добавить питомца", exact: true }).click();
    await page.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
    await expect(page.locator(".pet-passport-screen .pet-title h2")).toHaveText("бОня");
    await expect(page.locator(".pet-about p")).toHaveText("я".repeat(100));
    await page.reload();
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: /Собака бОня/ }).click();
    await expect(page.getByRole("heading", { name: "О нас", exact: true })).toBeVisible();
    await expect(page.locator(".pet-about p")).toHaveText("я".repeat(100));
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath("description-passport.png"), fullPage: true });
    await page.getByRole("button", { name: "Карточка питомца", exact: true }).click();
    await expect(page.locator(".pet-about p")).toHaveText("я".repeat(100));
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await page.getByRole("button", { name: /Изменить данные/ }).click();
    await expect(description).toHaveValue("я".repeat(100));
    await description.fill("");
    await expect(counter).toHaveText("0/100");
    await page.getByRole("button", { name: "Сохранить изменения", exact: true }).click();
    await page.getByRole("button", { name: "Готово", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
    await expect(page.locator(".pet-about")).toHaveCount(0);
    expect(saved.description).toBe("");
    await page.reload();
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: /Собака бОня/ }).click();
    await expect(page.getByRole("heading", { name: "О нас", exact: true })).toHaveCount(0);
  });
}

test("description appears to neighbours and in invitation preview; empty blocks are hidden", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-19T19:00:00+03:00"));
  await mockApp(page, { nearby: [{ ...walk, description: "Гуляем вместе" } as typeof walk] });
  await page.goto("/");
  await page.locator(".walk-summary").first().click();
  await expect(page.locator(".pet-about p")).toHaveText("Гуляем вместе");
  let description: string | null = "Любим парк";
  await page.route("**/api/pet-shares/0123456789abcdef0123", route => route.fulfill({ json: { pet: { ...pet, description } } }));
  await page.goto("/share/0123456789abcdef0123");
  await expect(page.locator(".pet-about p")).toHaveText("Любим парк");
  description = null;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Приглашение", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "О нас", exact: true })).toHaveCount(0);
});
