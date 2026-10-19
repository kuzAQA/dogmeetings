import { expect, test, type Page } from "@playwright/test";
import type { AdminAnnouncement } from "../lib/announcement-types";

test.use({ timezoneId: "America/Los_Angeles" });

const serverTime = "2026-10-19T00:00:00+03:00";
const home = { city: "Москва", district: "Центр", complex: "Парк" };
const catalog = [home, { ...home, complex: "Сад" }, { city: "Казань", district: "Центр", complex: "Парк" }];
const initial: AdminAnnouncement = {
  id: "test-banner", permanent: true, startsAt: serverTime, endsAt: "2026-10-26T00:00:00+03:00",
  pages: [{ title: "Новая возможность", text: "Нововведение" }],
  exclusions: { cities: ["Казань"], districts: [], complexes: [] }
};

async function open(page: Page) {
  await page.route("**/api/dogsfather/session", (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route("**/api/dogsfather/location-requests", (route) => route.fulfill({ json: { requests: [] } }));
  await page.goto("/dogsfather");
  await page.getByRole("button", { name: /Баннеры/ }).click();
}

test("admin shows active dates and inherited audience and saves multiple exclusions", async ({ page }) => {
  let banner = structuredClone(initial);
  let failed = true;
  await page.route("**/api/dogsfather/announcements", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { serverTime, banners: [banner], locations: catalog } });
    const payload = route.request().postDataJSON();
    expect(payload.id).toBe(banner.id);
    expect(payload.action).toBe("exclusions");
    expect(payload.exclusions).toEqual({ cities: ["Казань", "Москва"], districts: [{ city: "Москва", district: "Центр" }], complexes: [home, catalog[1]] });
    if (failed) { failed = false; return route.fulfill({ status: 500, json: { error: "Не удалось сохранить баннер. Повторите попытку." } }); }
    banner = { ...banner, exclusions: payload.exclusions };
    return route.fulfill({ json: { banner } });
  });
  await open(page);
  const article = page.getByRole("article", { name: "Новая возможность" });
  await expect(article).toContainText("Города: Все; исключены: Казань");
  await expect(article).toContainText("Районы: Все; исключены: нет");
  await expect(article).toContainText("Исключены все районы и ЖК городов: Казань");
  await expect(article.locator("dd").nth(0)).toHaveText("19.10.2026, 00:00");
  await expect(article.locator("dd").nth(1)).toHaveText("26.10.2026, 00:00");
  await expect(article.locator("dd").nth(2)).toHaveText("7 дн. 0 ч. 0 мин.");
  await article.getByText("Настроить исключения", { exact: true }).click();
  await article.getByRole("group", { name: "Города", exact: true }).getByRole("checkbox", { name: "Москва", exact: true }).check();
  await article.getByRole("group", { name: "Районы", exact: true }).getByRole("checkbox", { name: "Москва / Центр", exact: true }).check();
  const complexes = article.getByRole("group", { name: "ЖК", exact: true });
  await complexes.getByRole("checkbox", { name: "Москва / Центр / Парк", exact: true }).check();
  await complexes.getByRole("checkbox", { name: "Москва / Центр / Сад", exact: true }).check();
  await article.getByRole("button", { name: "Сохранить исключения" }).click();
  await expect(article.getByRole("alert")).toContainText("Не удалось сохранить");
  await expect(complexes.getByRole("checkbox", { name: "Москва / Центр / Парк", exact: true })).toBeChecked();
  await article.getByRole("button", { name: "Сохранить исключения" }).click();
  await expect(article.getByRole("status")).toHaveText("Исключения сохранены.");
  await expect(article).toContainText("Районы: Все; исключены: Москва / Центр");
  await expect(article).toContainText("ЖК: Все; исключены: Москва / Центр / Парк, Москва / Центр / Сад");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: test.info().outputPath("admin-banner-exclusions.png"), fullPage: true });
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.getByRole("article")).toContainText("Города: Все; исключены: Казань, Москва");
});

test("extension validates input, retries errors, blocks duplicate submission and refreshes all timing fields", async ({ page }) => {
  let banner = structuredClone(initial);
  let patches = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/dogsfather/announcements", async (route) => {
    if (route.request().method() === "GET") return route.fulfill({ json: { serverTime, banners: [banner], locations: catalog } });
    patches++;
    expect(route.request().postDataJSON()).toEqual({ id: banner.id, action: "extend", days: 3 });
    if (patches === 1) return route.fulfill({ status: 500, json: { error: "Не удалось сохранить баннер. Повторите попытку." } });
    await gate;
    banner = { ...banner, endsAt: "2026-10-29T00:00:00+03:00" };
    return route.fulfill({ json: { banner } });
  });
  await open(page);
  const article = page.getByRole("article");
  const input = article.getByLabel("На сколько дней продлить");
  for (const value of ["", "0", "-1", "1.5", "9999999999"]) {
    await input.fill(value);
    await article.getByRole("button", { name: "Продлить", exact: true }).click();
    await expect(article.getByRole("alert")).toContainText("положительное целое число дней");
  }
  expect(patches).toBe(0);
  await input.fill("3");
  await article.getByRole("button", { name: "Продлить", exact: true }).click();
  await expect(article.getByRole("alert")).toContainText("Повторите попытку");
  await expect(input).toHaveValue("3");
  await article.getByRole("button", { name: "Продлить", exact: true }).click();
  await expect(input).toBeDisabled();
  await expect(article.getByRole("button", { name: "Сохраняем…", exact: true }).last()).toBeDisabled();
  await input.evaluate((element) => (element as HTMLInputElement).form!.requestSubmit());
  expect(patches).toBe(2);
  release();
  await expect(article.getByRole("status")).toHaveText("Срок продлён.");
  await expect(article.locator("dd").nth(0)).toHaveText("19.10.2026, 00:00");
  await expect(article.locator("dd").nth(1)).toHaveText("29.10.2026, 00:00");
  await expect(article.locator("dd").nth(2)).toHaveText("10 дн. 0 ч. 0 мин.");
  await expect(article.locator("dd").nth(3)).toHaveText("10 дн. 0 ч. 0 мин.");
  await expect(input).toHaveValue("");
});

test("admin handles empty lists, request errors and expired authorization", async ({ page }) => {
  let status = 500;
  await page.route("**/api/dogsfather/announcements", (route) => route.fulfill({ status, json: status === 200 ? { serverTime, banners: [], locations: catalog } : { error: "Не удалось загрузить баннеры." } }));
  await open(page);
  await expect(page.getByRole("alert")).toContainText("Не удалось загрузить баннеры");
  status = 200;
  await page.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Действующих баннеров нет" })).toBeVisible();
  status = 401;
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Вход администратора", exact: true })).toBeVisible();
});

test("admin persists permanence and Moscow schedule, starts now, and creates a scheduled temporary banner", async ({ page }) => {
  let banner = { ...initial, startsAt: "2026-10-22T00:00:00+03:00" };
  let settingsSaved = false;
  let started = false;
  let created = false;
  await page.route("**/api/dogsfather/announcements", async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: { serverTime, banners: [banner], locations: catalog } });
    const payload = route.request().postDataJSON();
    if (method === "POST") {
      expect(payload).toEqual({ title: "Новый баннер", text: "Текст баннера", permanent: false, startsAt: "2026-10-23T10:30:00+03:00", endsAt: null });
      created = true;
      return route.fulfill({ status: 201, json: { banner: { ...initial, ...payload } } });
    }
    if (payload.action === "schedule") {
      expect(payload).toEqual({ id: initial.id, action: "schedule", permanent: false, startsAt: "2026-10-24T10:30:00+03:00", endsAt: initial.endsAt });
      settingsSaved = true;
      banner = { ...banner, ...payload };
    } else {
      expect(payload).toEqual({ id: initial.id, action: "start-now" });
      started = true;
      banner = { ...banner, startsAt: serverTime };
    }
    return route.fulfill({ json: { banner } });
  });
  await open(page);
  const article = page.getByRole("article", { name: "Новая возможность" });
  await article.getByRole("checkbox", { name: /Постоянный/ }).uncheck();
  await article.getByLabel("Начало показа — Москва (UTC+3)").fill("2026-10-24T10:30");
  await article.getByRole("button", { name: "Сохранить настройки показа" }).click();
  await expect(article.getByRole("status")).toHaveText("Настройки показа сохранены.");
  expect(settingsSaved).toBe(true);
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(article.getByRole("checkbox", { name: /Постоянный/ })).not.toBeChecked();
  await expect(article.getByLabel("Начало показа — Москва (UTC+3)")).toHaveValue("2026-10-24T10:30");
  await article.getByRole("button", { name: "Запустить сейчас" }).click();
  await expect(article.getByRole("status")).toHaveText("Показ начат.");
  expect(started).toBe(true);
  await expect(article.getByLabel("Начало показа — Москва (UTC+3)")).toHaveValue("2026-10-19T00:00");
  await page.getByText("Создать баннер", { exact: true }).click();
  const form = page.getByRole("group", { name: "Новый баннер", exact: true });
  await expect(form.getByRole("checkbox", { name: /Постоянный/ })).not.toBeChecked();
  await form.getByLabel("Заголовок", { exact: true }).fill("Новый баннер");
  await form.getByLabel("Текст", { exact: true }).fill("Текст баннера");
  await form.getByLabel("Начало показа — Москва (UTC+3)").fill("2026-10-23T10:30");
  await form.getByRole("button", { name: "Создать", exact: true }).click();
  await expect.poll(() => created).toBe(true);
});
