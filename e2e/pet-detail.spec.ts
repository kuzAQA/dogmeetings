import { expect, test } from "@playwright/test";
import { location, mockApp, pet, walk } from "./fixtures";

for (const scenario of [
  { name: "with contact", contact: "@anna", location },
  { name: "without contact", contact: null, location },
  { name: "without district", contact: null, location: { ...location, district: "" } },
  { name: "only district", contact: null, location: { city: "", district: location.district, complex: "" } },
  { name: "without location", contact: null, location: { city: "", district: "", complex: "" } },
]) {
  test(`opens pet detail without a walk: ${scenario.name}`, async ({ page }) => {
    const savedPet = { ...pet, contactType: "telegram", contact: scenario.contact };
    await mockApp(page, { pets: [savedPet], nearby: [], mine: [] });
    await page.route("**/api/session", (route) => route.fulfill({ json: { hasLocation: true, location: scenario.location } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: /Собака Луна/ }).click();
    await page.getByRole("button", { name: "Карточка питомца", exact: true }).click();
    const detail = page.locator(".screen-pet-detail");
    await expect(detail.getByRole("heading", { name: pet.name, exact: true })).toBeVisible();
    await expect(detail.getByRole("img", { name: pet.name, exact: true })).toBeVisible();
    await expect(detail.locator(".pet-title > span")).toHaveText(pet.breed);
    await expect(detail.getByText(`Хозяин: ${pet.ownerName}`, { exact: true })).toBeVisible();
    await expect(detail.getByRole("heading", { name: "Паспорт питомца", level: 1, exact: true })).toBeVisible();
    await expect(detail.locator(".note, .big-time")).toHaveCount(0);
    await expect(detail.locator(".pet-title > span")).toHaveCSS("font-size", "22px");
    await expect(detail.getByText(`Хозяин: ${pet.ownerName}`, { exact: true })).toHaveCSS("font-size", "22px");
    await expect(detail.getByRole("button", { name: /Сообщить|Изменить мою прогулку/ })).toHaveCount(0);
    await expect(detail.locator(".pet-contact-row")).toHaveCount(0);
    await expect(detail.getByRole("link", { name: "@anna" })).toHaveCount(0);

    const values = [scenario.location.complex, scenario.location.city, scenario.location.district].filter(Boolean);
    if (values.length) {
      await expect(detail.locator(".place-detail")).toHaveText([
        scenario.location.complex,
        [scenario.location.city, scenario.location.district].filter(Boolean).join(", "),
      ].join(""));
      await expect(detail.locator(".place-detail svg")).toBeVisible();
    } else await expect(detail.locator(".place-detail")).toHaveCount(0);
    await expect(detail.getByText(walk.point, { exact: true })).toHaveCount(0);
    await expect(detail.locator(".place-detail p:empty")).toHaveCount(0);
    await test.info().attach("pet-detail", { body: await page.screenshot({ path: test.info().outputPath("pet-detail.png"), fullPage: true }), contentType: "image/png" });
    await page.goBack();
    await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
    await page.goForward();
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Паспорт питомца", exact: true })).toBeVisible();
  });
}

test("keeps the existing walk detail", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-10-19T19:00:00+03:00"));
  await mockApp(page);
  await page.goto("/");
  await page.locator(".walk-summary").first().click();
  await expect(page.getByRole("heading", { name: "Встреча на прогулке", exact: true })).toBeVisible();
  await expect(page.locator(".walk-detail-screen .note")).toBeVisible();
  await expect(page.locator(".walk-detail-screen .big-time")).toBeVisible();
  await expect(page.getByRole("button", { name: "Изменить мою прогулку", exact: true })).toBeVisible();
});

for (const hasLocation of [true, false]) {
  test(`about section follows location with spacing (location: ${hasLocation})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await mockApp(page, { pets: [{ ...pet, description: "Любим парк" } as typeof pet] });
    if (!hasLocation) await page.route("**/api/session", route => route.fulfill({ json: { hasLocation: true, location: { city: "", district: "", complex: "" } } }));
    await page.goto("/");
    await page.getByRole("button", { name: "Питомцы", exact: true }).click();
    await page.getByRole("button", { name: /Собака Луна/ }).click();
    await page.getByRole("button", { name: "Карточка питомца", exact: true }).click();
    const detail = page.locator(".screen-pet-detail");
    await expect(detail.locator(".pet-about p")).toHaveText("Любим парк");
    if (hasLocation) {
      const place = await detail.locator(".place-detail").boundingBox();
      const about = await detail.locator(".pet-about").boundingBox();
      expect(about!.y - place!.y - place!.height).toBeGreaterThanOrEqual(24);
    } else await expect(detail.locator(".place-detail")).toHaveCount(0);
    await page.screenshot({ path: test.info().outputPath("pet-about-location.png"), fullPage: true, animations: "disabled" });
  });
}
