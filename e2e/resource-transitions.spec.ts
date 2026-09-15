import { expect, test } from "@playwright/test";
import { mockApp, openNearby, pet, walk } from "./fixtures";
import { petPhotoUrl } from "../server/domain/pet";

test("opens pets from the data already loaded on entry", async ({ page }) => {
  await openNearby(page);

  let repeatedPetsRequests = 0;
  await page.route("**/api/pets", async (route) => {
    repeatedPetsRequests += 1;
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({ json: { pets: [pet] } });
  });

  await page.getByRole("button", { name: "Питомцы", exact: true }).click();

  await expect(page.getByRole("button", { name: /Собака Луна/ })).toBeVisible();
  await expect(page.locator(".pets-screen [aria-busy=true]")).toHaveCount(0);
  expect(repeatedPetsRequests).toBe(0);
});

test("preloads plan avatars before opening my plans", async ({ page }) => {
  const plannedWalk = { ...walk, image: "/dog-richie.webp" };
  await mockApp(page, { mine: [plannedWalk] });
  const avatarLoaded = page.waitForResponse((response) =>
    new URL(response.url()).pathname === plannedWalk.image
  );

  await page.goto("/");
  await avatarLoaded;
  await page.getByRole("button", { name: "Мои планы", exact: true }).click();

  const avatar = page.getByAltText("Собака Луна");
  await expect(avatar).toBeVisible();
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished)));
  await expect.poll(() => avatar.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
});

test("uses a static URL when a pet has no photo", () => {
  const updatedAt = new Date(pet.updatedAt);
  expect(petPhotoUrl(pet.id, updatedAt, null)).toBe("/dog-placeholder.webp");
  expect(petPhotoUrl(pet.id, updatedAt, "image/webp")).toContain(`/api/pet-photo?id=${pet.id}&v=`);
});

test("does not request fallback avatars again when returning nearby", async ({ page }) => {
  const image = petPhotoUrl(pet.id, new Date(pet.updatedAt), null);
  const petWithFallback = { ...pet, photoUrl: image };
  const walkWithFallback = { ...walk, image };
  let photoRequests = 0;
  await page.route("**/api/pet-photo?*", (route) => {
    photoRequests += 1;
    return route.abort();
  });
  await openNearby(page, {
    pets: [petWithFallback],
    nearby: [walkWithFallback],
    mine: [walkWithFallback]
  });

  await page.getByRole("button", { name: "Мои планы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои планы", exact: true })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Кто сегодня/ })).toBeVisible();
  await page.waitForLoadState("networkidle");

  expect(photoRequests).toBe(0);
});
