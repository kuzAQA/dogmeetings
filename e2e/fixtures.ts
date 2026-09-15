import { expect, type Page } from "@playwright/test";

export const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
export const pet = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Луна",
  breed: "Корги",
  ownerName: "Анна",
  photoUrl: "/dog-luna.webp",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  isOwner: true,
  isShared: false,
  canEdit: true,
  canDelete: true,
  canShare: true
};
export const walk = {
  id: "10000000-0000-4000-8000-000000000001",
  petId: pet.id,
  pet: pet.name,
  breed: pet.breed,
  owner: pet.ownerName,
  ...location,
  placeId: "20000000-0000-4000-8000-000000000001",
  point: "Сквер у фонтана",
  comment: "Возьмём мячик",
  walkDate: "2026-09-15",
  walkTime: "18:30",
  scheduleType: "today",
  updatedAt: "2026-09-15T15:30:00.000Z",
  image: pet.photoUrl
};

export async function mockApp(page: Page, options: { pets?: Array<typeof pet>; nearby?: Array<typeof walk>; mine?: Array<typeof walk>; hasLocation?: boolean } = {}) {
  const pets = options.pets ?? [pet];
  const nearby = options.nearby ?? [walk];
  const mine = options.mine ?? [walk];
  await page.route("**/api/session", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasLocation: options.hasLocation ?? true, location: options.hasLocation === false ? null : location }) }));
  await page.route("**/api/locations", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ locations: [location] }) }));
  await page.route("**/api/pets", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ pets }) }));
  await page.route("**/api/places?*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ places: [{ id: walk.placeId, name: walk.point }] }) }));
  await page.route("**/api/walks?*", (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ walks: new URL(route.request().url()).searchParams.get("scope") === "mine" ? mine : nearby }) }));
}

export async function openNearby(page: Page, options?: Parameters<typeof mockApp>[1]) {
  await mockApp(page, options);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: options?.nearby?.length === 0 ? "Здесь пока тихо" : "Кто сегодня на прогулку?", exact: true })).toBeVisible();
}

