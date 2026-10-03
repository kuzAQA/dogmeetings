import { expect, test } from "@playwright/test";
import { mockApp, openNearby, pet, walk } from "./fixtures";
import { petPhotoUrl } from "../server/domain/pet";

test("keeps initial HTML and session restoration empty until the screen is known", async ({ request, page }) => {
  const html = await (await request.get("/")).text();
  expect(html).toContain('aria-busy="true"');
  expect(html).not.toContain('class="screen welcome welcome-screen"');
  expect(html).not.toContain('class="loader"');

  await mockApp(page, { hasLocation: false });
  let sessionPending = false;
  let releaseSession = async () => {};
  await page.route("**/api/session", (route) => {
    sessionPending = true;
    releaseSession = () => route.fulfill({ json: { hasLocation: false, location: null } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => sessionPending).toBe(true);
  await expect(page.locator('main[aria-busy="true"]')).toBeEmpty();
  await releaseSession();
  await expect(page.getByRole("heading", { name: /Хорошая прогулка/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeEnabled();
});

test("loads optional resources when first opening location", async ({ page }) => {
  await mockApp(page, { hasLocation: false });
  const requests = { pets: 0, locations: 0, myWalks: 0 };
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === "/api/pets" && request.method() === "GET") requests.pets += 1;
    if (url.pathname === "/api/locations") requests.locations += 1;
    if (url.pathname === "/api/walks" && url.searchParams.get("scope") === "mine") requests.myWalks += 1;
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Хорошая прогулка/ })).toBeVisible();
  expect(requests).toEqual({ pets: 0, locations: 0, myWalks: 0 });

  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.getByRole("heading", { name: "Мой район" })).toBeVisible();
  await expect.poll(() => requests.pets).toBe(1);
  await expect.poll(() => requests.locations).toBe(1);
  await expect(page.getByRole("combobox", { name: "Город" })).toBeEnabled();
  expect(requests.myWalks).toBe(0);

  await page.getByRole("button", { name: "Назад" }).click();
  await expect(page.getByRole("heading", { name: /Хорошая прогулка/ })).toBeVisible();
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.getByRole("heading", { name: "Мой район" })).toBeVisible();
  expect(requests).toEqual({ pets: 1, locations: 1, myWalks: 0 });
});

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
