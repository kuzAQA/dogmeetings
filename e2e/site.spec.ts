import { expect, test } from "@playwright/test";

async function openWalks(page: import("@playwright/test").Page) {
  await page.goto("/");

  const findCompany = page.getByRole("button", { name: "Найти компанию", exact: true });
  const walksHeading = page.getByRole("heading", { name: "Прогулки рядом", exact: true });
  await expect(findCompany.or(walksHeading)).toBeVisible();
  if (await findCompany.isVisible()) {
    await findCompany.click();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
    await page.getByRole("combobox", { name: "Город" }).click();
    await page.getByRole("option", { name: "Москва", exact: true }).click();
    await page.getByRole("combobox", { name: "Район" }).click();
    await page.getByRole("option", { name: "Коммунарка", exact: true }).click();
    await page.getByRole("combobox", { name: "Жилой комплекс" }).click();
    await page.getByRole("option", { name: "Москвичка", exact: true }).click();
    await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  }

  await expect(walksHeading).toBeVisible();
}

async function expectDockSection(
  page: import("@playwright/test").Page,
  section: "nearby" | "walk" | "profile"
) {
  const dock = page.locator(".walks-bottom-dock");
  const button = dock.locator(`.dock-item--${section}`);
  await expect(button).toHaveClass(/is-active/);
  await expect(button).toHaveAttribute("aria-current", "page");
  await expect(page.locator(`.walks-pane--${section}`)).toHaveAttribute("data-dock-pane", "static");
  for (const otherSection of ["nearby", "walk", "profile"] as const) {
    if (otherSection === section) continue;
    await expect(page.locator(`.walks-pane--${otherSection}`)).toHaveAttribute("data-dock-pane", "hidden");
  }
}

async function openWalksWithPet(page: import("@playwright/test").Page) {
  await page.route("**/api/pets", async (route) => {
    if (route.request().method() !== "GET") {
      await route.continue();
      return;
    }

    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        pets: [{
          id: "00000000-0000-4000-8000-000000000001",
          name: "Луна",
          breed: "Корги",
          ownerName: "Тест",
          photoUrl: "/dog-placeholder.webp",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          isOwner: true,
          isShared: false,
          canEdit: true,
          canDelete: true,
          canShare: true
        }]
      })
    });
  });

  await openWalks(page);
}

test("filters nearby walks and keeps the viewport within bounds", async ({ page }) => {
  await openWalks(page);

  for (const name of ["Утро", "День", "Вечер", "Все"]) {
    const filter = page.getByRole("button", { name, exact: true });
    await filter.click();
    await expect(filter).toHaveAttribute("aria-pressed", "true");
  }

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("does not reload location resources when location values are unchanged", async ({ page }) => {
  const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
  let nearbyWalkRequests = 0;
  let placeRequests = 0;

  await page.route("**/api/session", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ hasLocation: true, location })
    });
  });
  await page.route("**/api/locations", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 100));
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ locations: [location] }) });
  });
  await page.route("**/api/pets", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ pets: [] }) });
  });
  await page.route("**/api/walks?*", async (route) => {
    if (new URL(route.request().url()).searchParams.get("scope") !== "mine") nearbyWalkRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ walks: [] }) });
  });
  await page.route("**/api/places?*", async (route) => {
    placeRequests += 1;
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ places: [] }) });
  });

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();
  await expect.poll(() => nearbyWalkRequests).toBe(1);
  await expect.poll(() => placeRequests).toBe(1);
  await page.waitForTimeout(150);
  expect(nearbyWalkRequests).toBe(1);
  expect(placeRequests).toBe(1);
});

test("uses opaque surfaces without decorative backgrounds", async ({ page }) => {
  await openWalks(page);

  const list = page.locator(".walk-list");
  const dock = page.locator(".walks-bottom-dock");

  await expect(list).toBeVisible();
  await expect(dock).toBeVisible();
  await expect(dock).toHaveCSS("background-color", "rgb(251, 250, 246)");
  expect(await dock.evaluate((element) => getComputedStyle(element).backdropFilter)).toBe("none");

  const scrollable = await list.evaluate((element) => element.scrollHeight > element.clientHeight);
  if (scrollable) {
    await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
    await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  }

  const overlap = await page.evaluate(() => {
    const listRect = document.querySelector<HTMLElement>(".walk-list")?.getBoundingClientRect();
    const dockRect = document.querySelector<HTMLElement>(".walks-bottom-dock")?.getBoundingClientRect();
    const shell = document.querySelector<HTMLElement>(".app-shell");
    return { listBottom: listRect?.bottom ?? 0, listLeft: listRect?.left ?? 0, listRight: listRect?.right ?? 0, dockBottom: dockRect?.bottom ?? 0, dockLeft: dockRect?.left ?? 0, dockRight: dockRect?.right ?? 0, dockWidth: dockRect?.width ?? 0, shellWidth: shell?.clientWidth ?? 0 };
  });

  expect(overlap.dockWidth).toBe(overlap.shellWidth - 32);
  expect(overlap.dockLeft).toBeGreaterThan(overlap.listLeft);
  expect(overlap.dockRight).toBeLessThan(overlap.listRight);
  expect(overlap.listBottom).toBeGreaterThanOrEqual(overlap.dockBottom - 1);
});

test("keeps the last nearby walk card above the bottom dock", async ({ page }) => {
  const location = { city: "Москва", district: "Коммунарка", complex: "Москвичка" };
  const walks = Array.from({ length: 5 }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    petId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    pet: `Питомец ${index + 1}`,
    breed: "Корги",
    owner: "Проверка",
    city: location.city,
    district: location.district,
    complex: location.complex,
    placeId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    point: "За черным домом",
    comment: null,
    walkDate: "2026-09-11",
    walkTime: "18:15",
    scheduleType: "always",
    updatedAt: "2026-09-11T15:00:00.000Z",
    image: "/dog-placeholder.webp"
  }));

  await page.route("**/api/session", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ hasLocation: true, location }) });
  });
  await page.route("**/api/pets", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ pets: [] }) });
  });
  await page.route("**/api/places?*", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ places: [] }) });
  });
  await page.route("**/api/walks?*", async (route) => {
    const scope = new URL(route.request().url()).searchParams.get("scope");
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ walks: scope === "mine" ? [] : walks }) });
  });

  await page.goto("/");
  const list = page.locator(".walk-list");
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();
  await expect(list.locator(".walk-card")).toHaveCount(walks.length);

  await list.evaluate((element) => element.scrollTo({ top: element.scrollHeight, behavior: "instant" }));
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const geometry = await page.evaluate(() => {
    const lastCard = document.querySelector<HTMLElement>(".walk-list-content")?.lastElementChild;
    const dock = document.querySelector<HTMLElement>(".walks-bottom-dock");
    const dockRect = dock?.getBoundingClientRect();
    return {
      lastCardBottom: lastCard?.getBoundingClientRect().bottom ?? 0,
      dockTop: dockRect?.top ?? 0,
    };
  });

  expect(geometry.lastCardBottom).toBeLessThanOrEqual(geometry.dockTop);
});

test("opens the profile drawer and reaches the pets collection", async ({ page }) => {
  await openWalks(page);

  await page.getByRole("button", { name: "Открыть профиль" }).click();
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();

await page.getByRole("button", { name: "Мои питомцы", exact: true }).click();
await expect(page.locator(".walks-bottom-dock")).toHaveCount(0);
  await expect(page.locator(".walks-pane--profile")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить питомца", exact: true })).toBeVisible();
});

test("opens my walks from profile", async ({ page }) => {
  await openWalks(page);

  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("dialog", { name: "Профиль" }).getByRole("button", { name: "Мои прогулки", exact: true }).click();
  await expect(page.locator(".walks-pane--profile")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Мои прогулки", exact: true })).toBeVisible();
});

test("keeps the dock and panes in sync when moving between nearby and profile", async ({ page }) => {
  await openWalks(page);

  const dock = page.locator(".walks-bottom-dock");
  await expectDockSection(page, "nearby");

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
  await expectDockSection(page, "profile");

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expectDockSection(page, "nearby");
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();
});

test("returns from dock pets and profile collections to the correct dock section", async ({ page }) => {
  await openWalks(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect(dock.locator(".dock-item--pets")).toHaveAttribute("aria-current", "page");

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(page.locator(".screen-walks")).toBeVisible();
  await expectDockSection(page, "nearby");

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  const profile = page.getByRole("dialog", { name: "Профиль" });
  await expect(profile).toBeVisible();
  await expectDockSection(page, "profile");

  await profile.getByRole("button", { name: "Мои питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect(dock).toHaveCount(0);

  await page.evaluate(() => window.history.back());
  await expect(profile).toBeVisible();
  await expectDockSection(page, "profile");

  await profile.getByRole("button", { name: "Мои прогулки", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои прогулки", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сообщить о прогулке", exact: true })).toHaveClass(/floating-pet-button/);
  await expect(dock).toHaveCount(0);

  await page.evaluate(() => window.history.back());
  await expect(profile).toBeVisible();
  await expectDockSection(page, "profile");

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expectDockSection(page, "nearby");
});

test("returns to nearby after opening pets from profile", async ({ page }) => {
  await openWalks(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();

  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await dock.getByRole("button", { name: "Рядом", exact: true }).click();

  await expectDockSection(page, "nearby");
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();
});

test("updates dock immediately when leaving pets for nearby", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expect(dock.locator(".dock-item--nearby")).toHaveAttribute("aria-current", "page");
});

test("opens, leaves, and reopens the dock walk form without stale pane state", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();
  await expectDockSection(page, "walk");
  await expect(dock.locator(".dock-item--walk")).toBeDisabled();
  await expect(dock.locator(".dock-item--walk")).toHaveAttribute("aria-label", "Форма прогулки не изменена");

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
  await expectDockSection(page, "profile");

  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();
  await expectDockSection(page, "walk");

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expectDockSection(page, "nearby");
});

test("does not render legacy back buttons", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("dialog", { name: "Профиль" }).getByRole("button", { name: "Мои питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
  await expect(page.locator(".collection-screen .back-button")).toHaveCount(0);

  await page.getByRole("button", { name: "Добавить питомца", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
  await expect(page.locator(".pet-screen .back-button")).toHaveCount(0);
});

test("keeps welcome CTA active when opening browser guide", async ({ page }) => {
  await page.goto("/");

  const cta = page.getByRole("button", { name: "Найти компанию", exact: true });
  await expect(cta).toBeVisible();
  await expect(cta).toBeEnabled();
  await expect(cta).toHaveCSS("opacity", "1");

  await cta.click();
  await expect(page.getByRole("heading", { name: "Откройте сайт в браузере", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Оставьте заявку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Оставить заявку", exact: true })).toBeVisible();

  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();
});

test("does not render a site back button for the browser guide", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("button", { name: "Найти компанию", exact: true });
  await expect(cta).toBeVisible();
  await cta.click();
  await expect(page.getByRole("heading", { name: "Откройте сайт в браузере", exact: true })).toBeVisible();

  await expect(page.getByRole("button", { name: "Назад", exact: true })).toHaveCount(0);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("button", { name: "Найти компанию", exact: true })).toBeVisible();
});

test("opens location editor from profile", async ({ page }) => {
  await openWalks(page);

  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  const profile = page.getByRole("dialog", { name: "Профиль" });
  await expect(profile).toBeVisible();
  await profile.locator(".location-card").click();
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();
  await expect(page.locator(".walks-bottom-dock")).toHaveCount(0);
  await expect(page.locator(".location-submit-button")).toHaveCSS("border-radius", "999px");

await page.evaluate(() => window.history.back());
await expect(page.locator(".walks-pane--profile")).toHaveAttribute("data-dock-pane", "static");
await expect(page.locator(".walks-bottom-dock")).toHaveCount(1);
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
});

test("returns to profile immediately from location with system back", async ({ page }) => {
  await openWalks(page);

  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("dialog", { name: "Профиль" }).locator(".location-card").click();
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();

  await page.evaluate(() => window.history.back());
  await expect(page.locator(".location-screen")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
});

test("returns from location continuation with system back", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();

  await page.getByRole("combobox", { name: "Город" }).click();
  await page.getByRole("option", { name: "Москва", exact: true }).click();
  await page.getByRole("combobox", { name: "Район" }).click();
  await page.getByRole("option", { name: "Коммунарка", exact: true }).click();
  await page.getByRole("combobox", { name: "Жилой комплекс" }).click();
  await page.getByRole("option", { name: "Москвичка", exact: true }).click();
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();

  await page.goto("/");
  await page.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await page.getByRole("dialog", { name: "Профиль" }).locator(".location-card").click();
  await page.getByRole("button", { name: "Оставьте заявку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Оставить заявку", exact: true })).toBeVisible();
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("heading", { name: "Где будем гулять?", exact: true })).toBeVisible();
});

test("opens pets while dock walk form is active", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сообщить о прогулке", exact: true })).toBeVisible();

  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  expect(await dock.locator(".dock-item--pets").getAttribute("aria-current")).toBe("page");
  await expect(page.locator(".collection-screen .back-button")).toHaveCount(0);
  await expect(page.locator(".collection-screen")).toHaveClass(/collection-screen--dock/);
await expect(page.locator(".walks-pane--walk")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();
});

test("skips nearby when leaving dock pets for profile", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await expect(page.locator(".walks-pane--nearby")).toHaveAttribute("data-dock-pane", "hidden");
  await expect(page.locator(".walks-pane--profile")).toHaveAttribute("data-dock-pane", "static");
  await expect(page.getByRole("dialog", { name: "Профиль" })).toBeVisible();
});

test("keeps dock sections in sync through sequential changes", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();

  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();

  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await expectDockSection(page, "profile");

  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();

  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expectDockSection(page, "walk");

  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();

  await dock.getByRole("button", { name: "Рядом", exact: true }).click();
  await expectDockSection(page, "nearby");
});

test("settles rapid dock presses on the final section", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();
  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await dock.getByRole("button", { name: "Рядом", exact: true }).click();

  await expectDockSection(page, "nearby");
});

test("returns from dock pets to profile immediately", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await dock.getByRole("button", { name: "Открыть профиль", exact: true }).click();

  await expectDockSection(page, "profile");
});

test("updates dock immediately when leaving pets for a walk", async ({ page }) => {
  await openWalksWithPet(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Питомцы", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Мои питомцы", exact: true })).toBeVisible();

  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expect(dock.locator(".dock-item--walk")).toHaveAttribute("aria-current", "page");
});

test("blocks walk creation until a pet is added", async ({ page }) => {
  await openWalks(page);

  const dock = page.locator(".walks-bottom-dock");
  await expectDockSection(page, "nearby");
  await expect(dock.locator(".dock-item--walk")).toBeEnabled();
  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await expectDockSection(page, "nearby");
  await expect(page.getByRole("dialog")).toContainText("Добавьте информацию о своём питомце");
  await page.getByRole("dialog").getByRole("button", { name: "Хорошо", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();
});

test("restores nearby immediately after guided pet system back", async ({ page }) => {
  await openWalks(page);

  const dock = page.locator(".walks-bottom-dock");
  await dock.getByRole("button", { name: "Создать прогулку", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Хорошо", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавить питомца", exact: true })).toBeVisible();

  await expect(page.locator(".guided-form-topbar .back-button")).toHaveCount(0);
  await page.evaluate(() => window.history.back());
  await expect(page.getByRole("heading", { name: "Прогулки рядом", exact: true })).toBeVisible();
  await expectDockSection(page, "nearby");
  await expect(page.locator(".walks-pane--nearby")).toHaveAttribute("data-dock-pane", "static");
});

test("handles the share guide and invalid share link", async ({ page }) => {
  await page.goto("/share/invalid-token");
  await expect(page.getByRole("heading", { name: "Откройте сайт в браузере", exact: true })).toBeVisible();

const android = page.getByRole("button", { name: "Android", exact: true });
await page.waitForTimeout(300);
await android.click();
  await expect(android).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();

  await expect(page.getByRole("heading", { name: "Ссылка недействительна", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "На главную", exact: true })).toBeVisible();
});

test("shows an authentication error for invalid admin credentials", async ({ page }) => {
  await page.goto("/dogsfather");
  await expect(page.getByRole("heading", { name: "Авторизация", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Логин", exact: true }).fill("qa-wrong");
  await page.getByRole("textbox", { name: "Пароль", exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveText(/Неверный логин или пароль\.|Слишком много попыток\. Повторите вход позже\./);
});
