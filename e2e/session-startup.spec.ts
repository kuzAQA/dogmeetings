import { expect, test } from "@playwright/test";
import { location, mockApp, openNearby, pet } from "./fixtures";

test.beforeEach(async ({ page, context }) => {
  await context.addCookies([{ name: "dogmeet_session", value: "saved-session", url: "http://localhost:3000", httpOnly: true }]);
  await page.addInitScript(() => {
    const state = window as Window & { welcomeSeen?: boolean };
    state.welcomeSeen = false;
    new MutationObserver((records) => {
      if (records.some((record) => Array.from(record.addedNodes).some((node) =>
        node instanceof Element && (node.matches(".welcome-screen") || node.querySelector(".welcome-screen"))
      ))) state.welcomeSeen = true;
    }).observe(document, { childList: true, subtree: true });
  });
});

test("restores the cookie session without welcome on navigation, reload and hard reload", async ({ page, context }) => {
  await context.addCookies([{ name: "dogmeet_session", value: "saved-session", url: "http://localhost:3000", httpOnly: true }]);
  await mockApp(page);
  let releaseSession = () => {};
  let sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
  const cookies: string[] = [];
  await page.route("**/api/session", async (route) => {
    cookies.push(route.request().headers().cookie ?? "");
    await sessionGate;
    await route.fulfill({ json: { hasLocation: true, location } });
  });

  const cdp = await context.newCDPSession(page);
  for (const load of ["navigation", "reload", "hard reload"]) {
    sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    if (load === "navigation") await page.goto("/", { waitUntil: "domcontentloaded" });
    else if (load === "reload") await page.reload({ waitUntil: "domcontentloaded" });
    else await Promise.all([page.waitForEvent("domcontentloaded"), cdp.send("Page.reload", { ignoreCache: true })]);
    await expect(page.locator('main[aria-busy="true"]')).toBeEmpty();
    await expect(page.locator(".welcome-screen")).toHaveCount(0);
    releaseSession();
    await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { welcomeSeen?: boolean }).welcomeSeen)).toBe(false);
  }
  expect(cookies).toHaveLength(3);
  expect(cookies.every((cookie) => cookie.includes("dogmeet_session=saved-session"))).toBe(true);
});

test("uses the manifest start URL with a restored session in simulated standalone mode", async ({ page, request }) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  await page.addInitScript(() => {
    const originalMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => query === "(display-mode: standalone)"
      ? Object.assign(originalMatchMedia(query), { matches: true }) : originalMatchMedia(query);
    Object.defineProperty(navigator, "standalone", { value: true });
  });
  await mockApp(page);
  await page.goto(manifest.start_url);
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { welcomeSeen?: boolean }).welcomeSeen)).toBe(false);
});

for (const legacyClientId of ["00000000-0000-4000-8000-000000000099", ""]) {
test(`migrates legacy saved state before choosing the screen ${legacyClientId ? "with" : "without"} client ID`, async ({ page, context }) => {
  await context.clearCookies();
  await mockApp(page);
  await page.addInitScript(({ location, legacyClientId }) => {
    if (legacyClientId) localStorage.setItem("dogwalk.clientId.v1", legacyClientId);
    localStorage.setItem("dogwalk.location.v1", JSON.stringify(location));
    localStorage.setItem("dogwalk.hasLocation.v1", "true");
  }, { location, legacyClientId });
  let created = false;
  let migration: unknown;
  await page.route("**/api/session", (route) => {
    if (route.request().method() === "POST") {
      migration = route.request().postDataJSON();
      created = true;
    }
    return route.fulfill({ status: created ? 200 : 401, json: created ? { hasLocation: true, location } : { error: "Сессия не найдена." } });
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  expect(migration).toEqual({ ...(legacyClientId ? { legacyClientId } : {}), legacyLocation: location, legacyHasLocation: true });
  expect(await page.evaluate(() => (window as Window & { welcomeSeen?: boolean }).welcomeSeen)).toBe(false);
  expect(await page.evaluate(() => localStorage.getItem("dogwalk.hasLocation.v1"))).toBeNull();
});
}

test("shows welcome after creating a first-visit session", async ({ page, context }) => {
  await context.clearCookies();
  await mockApp(page, { hasLocation: false });
  let created = false;
  const methods: string[] = [];
  await page.route("**/api/session", (route) => {
    methods.push(route.request().method());
    if (route.request().method() === "POST") created = true;
    return route.fulfill({ status: created ? 200 : 401, json: created ? { hasLocation: false, location: null } : { error: "Сессия не найдена." } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeEnabled();
  await expect.poll(() => methods).toEqual(["GET", "POST", "GET"]);
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.getByRole("heading", { name: "Мой район", exact: true })).toBeVisible();
});

for (const delayedMethod of ["GET", "POST"]) {
  test(`opens location before the first-visit session ${delayedMethod} finishes`, async ({ page, context }) => {
    await context.clearCookies();
    await mockApp(page, { hasLocation: false });
    let releaseSession = () => {};
    const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
    let created = false;
    let sessionPending = false;
    await page.route("**/api/session", async (route) => {
      const method = route.request().method();
      if (!created && method === delayedMethod) {
        sessionPending = true;
        await sessionGate;
      }
      if (method === "POST") created = true;
      await route.fulfill({ status: created ? 200 : 401, json: created ? { hasLocation: false, location: null } : { error: "Сессия не найдена." } });
    });
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect.poll(() => sessionPending).toBe(true);
    const welcomeButton = page.getByRole("button", { name: "Найти компанию" });
    await expect(welcomeButton).toBeEnabled();
    await welcomeButton.click();
    await expect(page.getByRole("heading", { name: "Мой район", exact: true })).toBeVisible();
    const verifiedSession = page.waitForResponse((response) => response.url().endsWith("/api/session") && response.request().method() === "GET" && response.status() === 200);
    releaseSession();
    await expect.poll(() => created).toBe(true);
    await verifiedSession;
    await expect(page.getByRole("heading", { name: "Мой район", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Найти компанию" })).toHaveCount(0);
  });
}

test("preloads locations on welcome while session restoration is pending", async ({ page, context }) => {
  await context.clearCookies();
  await mockApp(page, { hasLocation: false });
  let releaseSession = () => {};
  const sessionGate = new Promise<void>((resolve) => { releaseSession = resolve; });
  let locationSaves = 0;
  await page.route("**/api/session", async (route) => {
    if (route.request().method() === "PATCH") {
      locationSaves++;
      await route.fulfill({ json: { hasLocation: true, location } });
      return;
    }
    await sessionGate;
    await route.fulfill({ json: { hasLocation: false, location: null } });
  });
  let locationsRequests = 0;
  await page.route("**/api/locations", async (route) => {
    locationsRequests++;
    await route.fulfill({ json: { locations: [location] } });
  });
  const locationsResponse = page.waitForResponse("**/api/locations");
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await locationsResponse;
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeEnabled();
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.getByLabel("Город", { exact: true })).toBeEnabled();
  await page.getByLabel("Город", { exact: true }).selectOption(location.city);
  await page.getByLabel("Район", { exact: true }).selectOption(location.district);
  await page.getByLabel("Жилой комплекс", { exact: true }).selectOption(location.complex);
  await expect(page.getByRole("button", { name: "Продолжить", exact: true })).toBeEnabled();
  expect(locationsRequests).toBe(1);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Сохраняем…", exact: true })).toBeVisible();
  expect(locationSaves).toBe(0);
  releaseSession();
  await expect(page.getByRole("heading", { name: "Район выбран", exact: true })).toBeVisible();
  expect(locationSaves).toBe(1);
});

test("keeps the welcome locations request when opening location before it finishes", async ({ page, context }) => {
  await context.clearCookies();
  await mockApp(page, { hasLocation: false });
  let releaseLocations = () => {};
  const locationsGate = new Promise<void>((resolve) => { releaseLocations = resolve; });
  let locationsRequests = 0;
  await page.route("**/api/locations", async (route) => {
    locationsRequests++;
    await locationsGate;
    await route.fulfill({ json: { locations: [location] } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect.poll(() => locationsRequests).toBe(1);
  await page.getByRole("button", { name: "Найти компанию" }).click();
  await expect(page.getByRole("heading", { name: "Мой район", exact: true })).toBeVisible();
  await expect(page.getByLabel("Город", { exact: true })).toBeDisabled();
  releaseLocations();
  await expect(page.getByLabel("Город", { exact: true })).toBeEnabled();
  expect(locationsRequests).toBe(1);
});

test("keeps session errors neutral and retries restoration", async ({ page }) => {
  await mockApp(page);
  let failed = true;
  await page.route("**/api/session", (route) => route.fulfill({
    status: failed ? 503 : 200,
    json: failed ? { error: "Сессия недоступна." } : { hasLocation: true, location }
  }));
  await page.goto("/");
  await expect(page.getByRole("alert")).toContainText("Сессия недоступна.");
  await expect(page.locator(".welcome-screen")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Повторить" }).click();
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as Window & { welcomeSeen?: boolean }).welcomeSeen)).toBe(false);
});

test("honors shared-pet entry routes before showing any welcome", async ({ page }) => {
  await mockApp(page, { hasLocation: false });
  for (const parameter of ["sharedPet", "sharedPetAlreadyAdded"]) {
    await page.goto(`/?${parameter}=${pet.id}`);
    await expect(page.locator(".pets-screen")).toBeVisible();
    expect(await page.evaluate(() => (window as Window & { welcomeSeen?: boolean }).welcomeSeen)).toBe(false);
  }
});

test("fits the enlarged header brand beside location, settings and back buttons", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openNearby(page);
  const checkHeader = async () => {
    await page.evaluate(() => document.fonts.ready);
    const geometry = await page.locator(".page-header").evaluate((header) => {
      const bounds = header.getBoundingClientRect();
      const brand = header.querySelector<HTMLElement>(".brand")!;
      const icon = brand.querySelector<HTMLImageElement>(".brand-icon")!;
      const children = Array.from(header.children).map((child) => child.getBoundingClientRect());
      const label = header.querySelector(".location-switch span");
      const range = document.createRange();
      if (label) range.selectNodeContents(label);
      return { fontSize: getComputedStyle(brand).fontSize, iconWidth: icon.width, iconHeight: icon.height,
        locationLines: label ? range.getClientRects().length : 0,
        sharp: icon.naturalWidth > icon.width && icon.naturalHeight > icon.height,
        fits: children.every((child) => child.left >= bounds.left - 10 && child.right <= bounds.right + 1 && child.top >= bounds.top && child.bottom <= bounds.bottom),
        overlaps: children.some((child, index) => index > 0 && child.left < children[index - 1].right),
        overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(geometry).toMatchObject({ fontSize: "20px", iconWidth: 29, iconHeight: 29, sharp: true, fits: true, overlaps: false, overflow: 0 });
    expect(geometry.locationLines).toBeLessThanOrEqual(1);
  };
  await checkHeader();
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await expect(page.getByRole("button", { name: "Назад", exact: true })).toBeVisible();
  await checkHeader();
});
