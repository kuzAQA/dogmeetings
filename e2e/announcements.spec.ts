import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { Announcement } from "../lib/announcement-types";
import { location, mockApp, pet } from "./fixtures";

const title = "Теперь в карточке питомца можно добавить контакт для связи";
const text = "Добавьте контакт в карточку своего питомца, чтобы другие пользователи могли связаться с вами. Контакты владельцев также можно найти в карточках их питомцев.";
const serverTime = "2026-10-19T00:00:00+03:00";
const banner: Announcement = {
  id: "pet-owner-contact-2026-10", permanent: true, startsAt: serverTime, endsAt: "2026-10-26T00:00:00+03:00",
  pages: [{ title, text, example: "pet-contact" }]
};

async function campaign(page: Page, value: Announcement = banner) {
  let acknowledged = false;
  let posts = 0;
  let gets = 0;
  await page.route("**/api/announcements", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      expect(route.request().postDataJSON()).toEqual({ id: value.id });
      acknowledged = true;
      await route.fulfill({ json: { acknowledged: true } });
    } else {
      gets++;
      await route.fulfill({ json: { serverTime, banners: acknowledged ? [] : [value] } });
    }
  });
  return { posts: () => posts, gets: () => gets };
}

test("shared pet banner fits and shows a static menu example after switching slides", async ({ page }) => {
  const migration = readFileSync("drizzle/0035_shared_pet_announcement.sql", "utf8");
  const pages = JSON.parse(migration.match(/'(\[.*\])'::jsonb/)![1]) as Announcement["pages"];
  await mockApp(page);
  await campaign(page, { ...banner, pages: [banner.pages[0], ...pages] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Один питомец — общая карточка", exact: true })).toBeVisible();
  await expect(dialog.locator("#announcement-text")).toContainText("Добавить к моим питомцам");
  const card = dialog.locator(".announcement-card:not([inert])");
  expect(await card.evaluate((element) => {
    const style = getComputedStyle(element);
    const availableWidth = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    return Math.abs(element.querySelector(".announcement-content")!.getBoundingClientRect().width - availableWidth);
  })).toBeLessThanOrEqual(1);
  const example = card.locator(".announcement-share-example");
  await expect(example).toContainText("Поделиться питомцем");
  await expect(example).toContainText("Для совместных прогулок");
  await expect(example.locator("svg")).toHaveCount(2);
  await expect(example.locator("button, a")).toHaveCount(0);
  await expect(example).toHaveCSS("border-top-width", "1px");
  await expect(example).toHaveCSS("border-top-style", "solid");
  await expect(example).toHaveCSS("border-bottom-width", "1px");
  const cardBounds = (await card.boundingBox())!;
  const exampleBounds = (await example.boundingBox())!;
  expect(exampleBounds.y).toBeGreaterThan(cardBounds.y + cardBounds.height / 2);
  expect(exampleBounds.y + exampleBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
  await test.info().attach("shared-pet-banner", { body: await page.screenshot(), contentType: "image/png" });
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("walk period banner shows the inline filter and a two-column grid", async ({ page }) => {
  const migration = readFileSync("drizzle/0040_walk_period_announcement.sql", "utf8");
  const pages = JSON.parse(migration.match(/'(\[.*\])'::jsonb/)![1]) as Announcement["pages"];
  await mockApp(page);
  await campaign(page, { ...banner, pages });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Прогулки по времени дня" })).toBeVisible();
  await expect(dialog.locator("#announcement-text .announcement-period-filter")).toHaveText("День");
  await expect(dialog.locator("#announcement-text")).toContainText("Вы всегда можете изменить фильтр");
  const grid = dialog.locator(".announcement-periods");
  await expect(grid.locator(".announcement-period-filter")).toHaveText(["Весь день", "День", "Утро", "Вечер"]);
  for (const [index, icon] of ["clock3", "sun", "sunrise", "sunset"].entries()) {
    await expect(grid.locator(".announcement-period-filter").nth(index).locator(`svg.lucide-${icon}`)).toBeVisible();
  }
  const cells = await grid.locator(".announcement-period-filter").all();
  const bounds = await Promise.all(cells.map((cell) => cell.boundingBox()));
  expect(bounds[0]!.y).toBe(bounds[1]!.y);
  expect(bounds[2]!.y).toBe(bounds[3]!.y);
  expect(bounds[2]!.y).toBeGreaterThan(bounds[0]!.y);
  await expect(grid.locator("button, a")).toHaveCount(0);
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
  await test.info().attach("walk-period-banner", { body: await page.screenshot({ path: test.info().outputPath("walk-period-banner.png") }), contentType: "image/png" });
});

test("walk places banner reuses the menu row at the bottom", async ({ page }) => {
  const migration = readFileSync("drizzle/0037_walk_places_announcement.sql", "utf8");
  const pages = JSON.parse(migration.match(/'(\[.*\])'::jsonb/)![1]) as Announcement["pages"];
  const update = readFileSync("drizzle/0038_walk_places_announcement_menu.sql", "utf8");
  pages[0].text = update.match(/to_jsonb\('(.*)'::text\)/)![1];
  await mockApp(page);
  await campaign(page, { ...banner, pages: [banner.pages[0], ...pages] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "Управляйте местами для прогулок", exact: true })).toBeVisible();
  const card = dialog.locator(".announcement-card:not([inert])");
  const help = card.locator(".announcement-share-example");
  await expect(help).toContainText("Мои места");
  await expect(help).toContainText("Места для прогулок, добавленные вами");
  await expect(help.locator("svg")).toHaveCount(2);
  await expect(help).toHaveCSS("border-top-width", "1px");
  await expect(help).toHaveCSS("border-bottom-width", "1px");
  await expect(dialog.getByRole("img", { name: "значок меню", exact: true })).toBeVisible();
  await expect(dialog.locator("#announcement-text")).toContainText("Нажмите «здесь»");
  await expect(help.locator("a, button")).toHaveCount(0);
  const cardBounds = (await card.boundingBox())!;
  const helpBounds = (await help.boundingBox())!;
  expect(helpBounds.y).toBeGreaterThan(cardBounds.y + cardBounds.height / 2);
  expect(helpBounds.y + helpBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test("site sharing menu opens the QR dialog with the shared row", async ({ page }) => {
  await mockApp(page);
  await page.route("**/api/announcements", (route) => route.fulfill({ json: { serverTime, banners: [] } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await page.getByRole("button", { name: /Поделиться сайтом/ }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "QR-код сайта https://dogmeet.ru" })).toBeVisible();
});

test("site sharing banner shows the menu example with both separators", async ({ page }) => {
  await mockApp(page);
  await campaign(page, { ...banner, pages: [{ title: "Приглашайте друзей гулять вместе", text: "Поделитесь сайтом с друзьями. Откройте меню {{menu}} и выберите «Поделиться сайтом».", example: "site-share" }] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  const example = dialog.locator(".announcement-share-example");
  await expect(dialog.getByRole("img", { name: "значок меню", exact: true })).toBeVisible();
  await expect(dialog.locator("#announcement-text")).toContainText("Откройте меню");
  await expect(dialog.locator("#announcement-text")).not.toContainText("{{menu}}");
  await expect(example).toBeVisible();
  await expect(example).toContainText("Поделиться сайтом");
  await expect(example).toContainText("QR-код для ваших друзей");
  await expect(example.locator("svg")).toHaveCount(2);
  await expect(example).toHaveCSS("border-top-width", "1px");
  await expect(example).toHaveCSS("border-bottom-width", "1px");
  await expect(example).toHaveCSS("border-top-style", "solid");
  await expect(example).toHaveCSS("border-bottom-style", "solid");
  const exampleBounds = (await example.boundingBox())!;
  const cardBounds = (await dialog.locator(".announcement-card").boundingBox())!;
  expect(exampleBounds.y).toBeGreaterThan(cardBounds.y + cardBounds.height / 2);
  expect(exampleBounds.y + exampleBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
});

test("first visit waits for ЖК selection and entering the home screen", async ({ page }) => {
  await mockApp(page, { hasLocation: false });
  const state = await campaign(page);
  let selected = false;
  await page.route("**/api/session", (route) => {
    if (route.request().method() === "PATCH") selected = true;
    return route.fulfill({ json: { hasLocation: selected, location: selected ? location : null } });
  });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Найти компанию", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.getByRole("button", { name: "Найти компанию", exact: true }).click();
  await page.getByLabel("Город", { exact: true }).selectOption(location.city);
  await page.getByLabel("Район", { exact: true }).selectOption(location.district);
  await page.getByLabel("Жилой комплекс", { exact: true }).selectOption(location.complex);
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.getByRole("button", { name: "Продолжить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Район выбран", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.getByRole("button", { name: "Готово", exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  expect(state.gets()).toBe(1);
});

test("a saved ЖК waits three seconds before showing the banner", async ({ page }) => {
  const now = new Date("2031-01-01T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await mockApp(page);
  const state = await campaign(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  await page.clock.runFor(2999);
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.clock.runFor(1);
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  expect(state.gets()).toBe(1);
});

test("leaving the home screen cancels the delay and returning starts a fresh three seconds", async ({ page }) => {
  const now = new Date("2031-01-01T00:00:00Z");
  await page.clock.install({ time: now });
  await page.clock.pauseAt(now);
  await mockApp(page);
  const state = await campaign(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  await page.clock.runFor(1000);
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.clock.runFor(4000);
  await expect(page.locator(".pets-screen")).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.getByRole("button", { name: "Рядом", exact: true }).click();
  await page.clock.runFor(2999);
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.clock.runFor(1);
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
});

test("a shared-pet entry waits until the user reaches the home screen", async ({ page }) => {
  await mockApp(page);
  const state = await campaign(page);
  await page.goto(`/?sharedPet=${pet.id}`);
  await expect(page.locator(".pets-screen")).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.gets()).toBe(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
});

test("waits for verified session and never requests banners for a guest", async ({ page }) => {
  await mockApp(page);
  let requests = 0;
  await page.route("**/api/announcements", (route) => { requests++; return route.fulfill({ json: { serverTime, banners: [banner] } }); });
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/session", async (route) => {
    await gate;
    await route.fulfill({ status: 401, json: { error: "Сессия не найдена." } });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeVisible();
  expect(requests).toBe(0);
  const failedSession = page.waitForResponse((response) => response.url().endsWith("/api/session") && response.request().method() === "POST");
  release();
  await failedSession;
  expect(requests).toBe(0);
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
});

test("requests announcements only after the session GET succeeds", async ({ page }) => {
  await mockApp(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let requests = 0;
  await page.route("**/api/session", async (route) => {
    await gate;
    return route.fulfill({ json: { hasLocation: true, location } });
  });
  await page.route("**/api/announcements", (route) => { requests++; return route.fulfill({ json: { serverTime, banners: [banner] } }); });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Найти компанию" })).toBeVisible();
  expect(requests).toBe(0);
  release();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  expect(requests).toBe(1);
});

test("shows after verification, covers viewport, traps focus, locks and restores scroll", async ({ page, browserName, isMobile }) => {
  await mockApp(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/announcements", async (route) => {
    if (route.request().method() === "POST") return route.fulfill({ json: { acknowledged: true } });
    await gate;
    return route.fulfill({ json: { serverTime, banners: [banner] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Питомцы", exact: true }).focus();
  await page.evaluate(() => {
    document.querySelector("main")!.style.minHeight = "2400px";
    window.scrollTo(0, 280);
  });
  const before = await page.evaluate(() => window.scrollY);
  release();
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  const bounds = await dialog.boundingBox();
  expect(bounds).toEqual({ x: 0, y: 0, ...page.viewportSize()! });
  await expect(dialog.getByRole("link")).toHaveCount(0);
  await expect(dialog.locator(".facts dt")).toHaveText("Контакт");
  await expect(dialog.locator(".facts dd")).toHaveText("@my_contact");
  const button = dialog.getByRole("button", { name: "Понятно" });
  await expect(button).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(button).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeVisible();
  const bodyTop = await page.evaluate(() => document.body.style.top);
  await page.mouse.move(5, 5);
  if (browserName === "webkit" && isMobile) await page.keyboard.press("PageDown");
  else await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => document.body.style.position)).toBe("fixed");
  expect(await page.evaluate(() => document.body.style.top)).toBe(bodyTop);
  expect(await page.evaluate(() => document.querySelector("dialog")!.matches(":modal"))).toBe(true);
  await test.info().attach("banner", { body: await page.screenshot({ path: test.info().outputPath("banner.png") }), contentType: "image/png" });
  await button.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
  await expect(page.getByRole("button", { name: "Питомцы", exact: true })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
});

test("acknowledges once and stays absent after reload", async ({ page }) => {
  await mockApp(page);
  const state = await campaign(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.posts()).toBe(1);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Кто сегодня на прогулку?", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
});

test("Next changes pages without acknowledgement; only last page confirms", async ({ page }) => {
  await mockApp(page);
  const state = await campaign(page, { ...banner, pages: [banner.pages[0], { title: "Вторая страница", text: "Подробности", example: "pet-contact" }] });
  await page.goto("/");
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Вторая страница" })).toBeVisible();
  expect(state.posts()).toBe(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.posts()).toBe(1);
});

test("carousel supports dots, swipes, keyboard and bounded navigation", async ({ page }) => {
  await mockApp(page);
  const state = await campaign(page, { ...banner, pages: [banner.pages[0], { title: "Вторая страница", text: "Подробности" }, { title: "Последняя страница", text: "Конец" }] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  const dots = dialog.getByRole("group", { name: "Слайды баннера" }).getByRole("button");
  await expect(dots).toHaveCount(3);
  expect((await dialog.locator(".announcement-card:not([inert])").boundingBox())!.y).toBeGreaterThan(0);
  await test.info().attach("carousel", { body: await page.screenshot({ path: test.info().outputPath("carousel.png") }), contentType: "image/png" });
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "step");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "step");
  await dots.nth(0).click();
  const swipe = async (dx: number, dy = 0) => {
    const card = dialog.locator(".announcement-card:not([inert])");
    await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 180, clientY: 240 }] });
    await card.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 180 + dx, clientY: 240 + dy }] });
  };
  await swipe(100);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "step");
  await swipe(-100, 160);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "step");
  await swipe(-100);
  await expect(dots.nth(1)).toHaveAttribute("aria-current", "step");
  await swipe(100);
  await expect(dots.nth(0)).toHaveAttribute("aria-current", "step");
  await dots.nth(2).focus();
  await page.keyboard.press("Enter");
  await swipe(-100);
  await expect(dots.nth(2)).toHaveAttribute("aria-current", "step");
  expect(state.posts()).toBe(0);
  await page.keyboard.press("Tab");
  await expect(dialog.getByRole("button", { name: "Понятно", exact: true })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(dialog).toHaveCount(0);
  expect(state.posts()).toBe(1);
});

test("long carousel content fits without scrolling and controls stay visible with reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApp(page);
  await campaign(page, { ...banner, pages: [{ ...banner.pages[0], text: `${text} ${"ОченьДлинноеСлово".repeat(20)} ${text.repeat(12)}` }, { title: "Конец", text }] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  const next = dialog.getByRole("button", { name: "Далее", exact: true });
  await expect(next).toBeVisible();
  const bounds = await next.boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  const content = dialog.locator(".announcement-slide:not([inert]) .announcement-content");
  expect(await content.evaluate((element) => getComputedStyle(element).overflowY)).toBe("visible");
  const cardBounds = (await dialog.locator(".announcement-card:not([inert])").boundingBox())!;
  const contentBounds = (await content.boundingBox())!;
  expect(contentBounds.y).toBeGreaterThanOrEqual(cardBounds.y);
  expect(contentBounds.y + contentBounds.height).toBeLessThanOrEqual(cardBounds.y + cardBounds.height);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect.poll(async () => {
    const card = (await dialog.locator(".announcement-card:not([inert])").boundingBox())!;
    const text = (await content.boundingBox())!;
    return text.y + text.height <= card.y + card.height;
  }).toBe(true);
  await test.info().attach("carousel-long", { body: await page.screenshot({ path: test.info().outputPath("carousel-long.png") }), contentType: "image/png" });
  await next.click();
  await expect(page.getByRole("heading", { name: "Конец", exact: true })).toBeVisible();
});

test("information reopens an acknowledged banner from its first slide", async ({ page }) => {
  await mockApp(page);
  let posts = 0;
  await page.route("**/api/announcements*", async (route) => {
    if (route.request().method() === "POST") {
      posts++;
      return route.fulfill({ json: { acknowledged: true } });
    }
    const preview = new URL(route.request().url()).searchParams.get("information") === "1";
    return route.fulfill({ json: { serverTime, banners: preview ? [{ ...banner, pages: [banner.pages[0], { title: "Конец", text }] }] : [] } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  const trigger = page.getByRole("button", { name: "Информация", exact: true });
  await trigger.click();
  await page.getByRole("button", { name: "Далее", exact: true }).click();
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Слайд 1 из 2" })).toHaveAttribute("aria-current", "step");
  expect(posts).toBe(1);
});

test("preview is unavailable when the environment flag is off", async ({ page, request }) => {
  test.skip(process.env.ANNOUNCEMENT_PREVIEW === "1", "Requires preview to be disabled.");
  await mockApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await expect(page.getByRole("button", { name: "Информация", exact: true })).toBeVisible();
  expect((await request.get("/api/announcements?preview=1")).status()).toBe(404);
});

test("active campaigns form one carousel and retry only unsaved acknowledgements", async ({ page }) => {
  await mockApp(page);
  const telegram: Announcement = { ...banner, id: "telegram-notifications-2026-10", pages: [{ title: "Узнавайте о прогулках в Telegram", text: "Подключите уведомления через нижнее меню.", example: "telegram-dock" }] };
  const posts: string[] = [];
  await page.route("**/api/announcements", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { serverTime, banners: [banner, telegram] } });
    const { id } = route.request().postDataJSON();
    posts.push(id);
    if (posts.length === 2) return route.fulfill({ status: 500, json: { error: "Повторите попытку." } });
    return route.fulfill({ json: { acknowledged: true } });
  });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveCount(1);
  await expect(dialog.getByRole("group", { name: "Слайды баннера" }).getByRole("button")).toHaveCount(2);
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: telegram.pages[0].title })).toBeVisible();
  await expect(dialog.getByRole("img", { name: /Нижнее меню/ })).toBeVisible();
  await expect(dialog.locator(".announcement-dock")).toHaveAttribute("inert", "");
  await expect(dialog.locator(".announcement-dock button")).toHaveCount(4);
  await expect(dialog.locator(".announcement-dock .dock-item--telegram")).toHaveClass(/is-active/);
  await expect.poll(() => dialog.locator(".announcement-track").evaluate((element) => element.getAnimations().length)).toBe(0);
  const menuBounds = (await dialog.locator(".announcement-dock").boundingBox())!;
  const cardBounds = (await dialog.locator(".announcement-card:not([inert])").boundingBox())!;
  expect(menuBounds.x).toBeGreaterThanOrEqual(cardBounds.x);
  expect(menuBounds.x + menuBounds.width).toBeLessThanOrEqual(cardBounds.x + cardBounds.width);
  expect(Math.abs(menuBounds.x + menuBounds.width / 2 - cardBounds.x - cardBounds.width / 2)).toBeLessThanOrEqual(1);
  expect(posts).toEqual([]);
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(dialog.getByRole("alert")).toBeVisible();
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(posts).toEqual([banner.id, telegram.id, telegram.id]);
});

test("expiry removes only its campaign and preserves the other selected slide", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-01T00:00:00Z") });
  await mockApp(page);
  await page.route("**/api/announcements", (route) => route.fulfill({ json: { serverTime, banners: [
    { ...banner, endsAt: "2026-10-19T00:00:04+03:00" },
    { ...banner, id: "telegram-notifications-2026-10", pages: [{ title: "Telegram", text: "Уведомления" }] }
  ] } }));
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await page.clock.fastForward(4100);
  await expect(dialog.getByRole("heading", { name: "Telegram", exact: true })).toBeVisible();
  await expect(dialog.getByRole("group", { name: "Слайды баннера" }).getByRole("button")).toHaveCount(1);
  await expect(dialog.getByRole("button", { name: "Понятно", exact: true })).toBeVisible();
});

test("failed acknowledgement stays open and can be retried", async ({ page }) => {
  await mockApp(page);
  let attempts = 0;
  await page.route("**/api/announcements", (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { serverTime, banners: [banner] } });
    attempts++;
    return attempts === 1 ? route.fulfill({ status: 500, json: { error: "Не удалось сохранить подтверждение. Повторите попытку." } })
      : route.fulfill({ json: { acknowledged: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось сохранить подтверждение");
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(attempts).toBe(2);
});

test("waits for successful save before closing and prevents duplicate clicks", async ({ page }) => {
  await mockApp(page);
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let posts = 0;
  await page.route("**/api/announcements", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { serverTime, banners: [banner] } });
    posts++;
    await gate;
    return route.fulfill({ json: { acknowledged: true } });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохраняем…" })).toBeDisabled();
  expect(posts).toBe(1);
  release();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
});

test("expires while open using server lifetime even with an incorrect browser date", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-01T00:00:00Z") });
  await mockApp(page);
  const state = await campaign(page, { ...banner, endsAt: "2026-10-19T00:00:02+03:00" });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: title })).toBeVisible();
  await page.clock.fastForward(2100);
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.posts()).toBe(0);
  expect(await page.evaluate(() => document.body.style.position)).toBe("");
  await expect(page.getByRole("button", { name: "Питомцы", exact: true })).toBeEnabled();
});

test("example shares contact markup and computed styles with the pet passport", async ({ page }) => {
  await mockApp(page);
  await campaign(page);
  await page.route("**/api/pets", (route) => route.fulfill({ json: { pets: [{ ...pet, contactType: "telegram", contact: "@my_contact" }] } }));
  await page.goto("/");
  const styles = () => page.locator(".pet-contact-row").evaluate((row) => {
    const read = (element: Element) => {
      const style = getComputedStyle(element);
      return Object.fromEntries(["fontFamily", "fontSize", "fontWeight", "color", "padding", "gap", "display", "justifyContent", "textAlign", "textDecorationLine", "textUnderlineOffset"].map((key) => [key, style[key as keyof CSSStyleDeclaration]]));
    };
    return [read(row), read(row.querySelector("dt")!), read(row.querySelector("dd")!), read(row.querySelector(".pet-contact-value")!)];
  });
  await expect(page.locator(".pet-contact-row")).toBeVisible();
  const example = await styles();
  await expect(page.locator(".pet-contact-row")).toHaveCSS("border-top-width", "1px");
  await expect(page.locator(".pet-contact-row")).toHaveCSS("border-top-style", "solid");
  await page.getByRole("button", { name: "Понятно", exact: true }).click();
  await page.getByRole("button", { name: "Питомцы", exact: true }).click();
  await page.getByRole("button", { name: /Собака Луна/ }).click();
  await expect(page.locator(".pet-contact-row")).toBeVisible();
  expect(await styles()).toEqual(example);
});


test("carousel slides on Next and swipe and respects reduced motion", async ({ page }) => {
  await mockApp(page);
  await campaign(page, { ...banner, pages: [banner.pages[0], { title: "Вторая страница", text: "Подробности" }] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const track = dialog.locator(".announcement-track");
  await expect(track).toHaveCSS("transition-property", "transform");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Вторая страница");
  await expect.poll(() => track.evaluate((element) => {
    const offset = new DOMMatrixReadOnly(getComputedStyle(element).transform).m41;
    return Math.abs(offset + element.clientWidth) < 1;
  })).toBe(true);
  const card = dialog.locator(".announcement-card:not([inert])");
  await card.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 100, clientY: 200 }] });
  await card.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 220, clientY: 200 }] });
  await expect(dialog.getByRole("heading")).toHaveText(title);
  await expect(track).toHaveCSS("transform", "matrix(1, 0, 0, 1, 0, 0)");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(track).toHaveCSS("transition-duration", "0s");
  await dialog.getByRole("button", { name: "Далее", exact: true }).click();
  await expect(dialog.getByRole("heading")).toHaveText("Вторая страница");
});

test("carousel moves decorated cards together and clips neighbours at rest", async ({ page }) => {
  await mockApp(page);
  await campaign(page, { ...banner, pages: [banner.pages[0], { title: "Вторая карточка", text: text.repeat(20) }] });
  await page.goto("/");
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const viewport = dialog.locator(".announcement-viewport");
  const track = dialog.locator(".announcement-track");
  const cards = track.locator(".announcement-card");
  await expect(cards).toHaveCount(2);
  await expect(viewport).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(viewport).toHaveCSS("overflow-x", "hidden");
  for (const card of await cards.all()) {
    await expect(card).toHaveCSS("border-top-width", "1px");
    await expect(card).toHaveCSS("border-top-left-radius", "24px");
    expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  }
  const fixed = dialog.locator(".announcement-header, .announcement-dots, .announcement-footer");
  const fixedBounds = await fixed.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
  const windowBounds = (await viewport.boundingBox())!;
  const first = (await cards.nth(0).boundingBox())!;
  expect(first.x).toBeCloseTo(windowBounds.x, 0);
  expect(first.width).toBeCloseTo(windowBounds.width, 0);
  expect((await cards.nth(1).boundingBox())!.x).toBeGreaterThanOrEqual(windowBounds.x + windowBounds.width - 0.5);

  for (const target of [1, 0]) {
    // Freeze the real CSS transition so its beginning, middle and end are deterministic.
    await track.evaluate((element) => {
      element.addEventListener("transitionrun", () => element.getAnimations().forEach((animation) => animation.pause()), { once: true });
    });
    await dialog.getByRole("button", { name: `Слайд ${target + 1} из 2` }).click();
    await expect.poll(() => track.evaluate((element) => element.getAnimations().length)).toBe(1);
    for (const progress of [0, 0.5, 1]) {
      await track.evaluate((element, progress) => {
        const animation = element.getAnimations()[0];
        animation.currentTime = Number(animation.effect!.getTiming().duration) * progress;
      }, progress);
      const boxes = await cards.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()));
      expect(boxes[1].x - boxes[0].x).toBeCloseTo(windowBounds.width, 0);
      const incoming = boxes[target];
      if (progress === 0.5) {
        expect(incoming.x).toBeGreaterThan(windowBounds.x - windowBounds.width);
        expect(incoming.x).toBeLessThan(windowBounds.x + windowBounds.width);
      }
      expect(await fixed.evaluateAll((elements) => elements.map((element) => element.getBoundingClientRect().toJSON()))).toEqual(fixedBounds);
      await test.info().attach(`cards-${target}-${progress}`, { body: await page.screenshot(), contentType: "image/png" });
    }
    await track.evaluate((element) => element.getAnimations().forEach((animation) => animation.finish()));
    const active = (await cards.nth(target).boundingBox())!;
    const hidden = (await cards.nth(1 - target).boundingBox())!;
    expect(active.x).toBeCloseTo(windowBounds.x, 0);
    expect(hidden.x >= windowBounds.x + windowBounds.width - 0.5 || hidden.x + hidden.width <= windowBounds.x + 0.5).toBe(true);
    const content = (await cards.nth(target).locator(".announcement-content").boundingBox())!;
    expect(content.y + content.height).toBeLessThanOrEqual(active.y + active.height);
  }
});


test("information closes with a cross and restores focus; automatic display has no cross", async ({ page }) => {
  await mockApp(page);
  await campaign(page);
  await page.route("**/api/announcements?information=1", (route) => route.fulfill({ json: {
    serverTime, banners: [{ ...banner, permanent: true, endsAt: "2026-10-18T00:00:00+03:00" }]
  } }));
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть информацию" })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  const trigger = page.getByRole("button", { name: "Информация", exact: true });
  await trigger.click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Закрыть информацию" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await trigger.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test("temporary automatic banner without an end has no implicit lifetime or close cross", async ({ page }) => {
  await page.clock.install({ time: new Date("2031-01-01T00:00:00Z") });
  await mockApp(page);
  await campaign(page, { ...banner, permanent: false, startsAt: null, endsAt: null });
  await page.goto("/");
  const dialog = page.getByRole("dialog", { name: title });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Закрыть информацию" })).toHaveCount(0);
  await page.clock.fastForward(10 * 86_400_000);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Понятно", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});
