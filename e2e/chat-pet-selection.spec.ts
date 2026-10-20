import { expect, test, type Page } from "@playwright/test";
import { mockApp, pet, walk } from "./fixtures";

const secondPet = { ...pet, id: "00000000-0000-4000-8000-000000000002", name: "Рекс" };
const invitedPet = { ...pet, id: "00000000-0000-4000-8000-000000000003", name: "Общий", isOwner: false, isShared: true };
const title = "От имени какого питомца написать?";
const dialog = { id: "30000000-0000-4000-8000-000000000001", peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Бим • Ольга" }, expiresAt: null, hiddenThrough: 0 };

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
});

async function setup(page: Page, pets = [pet, secondPet, invitedPet], options: { petsGate?: Promise<void>; petsFail?: boolean; fromList?: boolean } = {}) {
  const state = { opens: [] as { walkId: string; petId?: string }[], fail: false, gate: null as Promise<void> | null };
  await mockApp(page, { pets, mine: [] });
  if (options.petsGate || options.petsFail) await page.route("**/api/pets", async route => {
    await options.petsGate;
    if (options.petsFail) return route.fulfill({ status: 500, json: { error: "Не удалось загрузить питомцев." } });
    await route.fulfill({ json: { pets } });
  });
  await page.route("**/api/dialogs**", async route => {
    if (new URL(route.request().url()).pathname === "/api/dialogs/events") return route.fulfill({ contentType: "text/event-stream", body: "retry: 60000\n\nevent: unread\ndata: {\"unreadCount\":0}\n\n" });
    if (route.request().method() === "POST") {
      state.opens.push(route.request().postDataJSON());
      if (state.gate) await state.gate;
      if (state.fail) return route.fulfill({ status: 404, json: { error: "Питомец больше недоступен. Выберите другого питомца." } });
      return route.fulfill({ json: { dialog, serverTime: new Date().toISOString() } });
    }
    if (new URL(route.request().url()).pathname === "/api/dialogs") return route.fulfill({ json: {
      dialogs: [{ ...dialog, lastMessage: { seq: 1, text: "Привет", mine: false, createdAt: new Date().toISOString(), readAt: null } }], nextCursor: null
    } });
    return route.fulfill({ json: { dialog, messages: [], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString() } });
  });
  await page.goto("/");
  if (options.fromList) {
    await page.getByRole("button", { name: "Мой район и настройки" }).click();
    await page.getByRole("button", { name: /^Диалоги/ }).click();
    await page.locator(".chat-list-open").click();
  } else {
    await page.locator(".walk-summary").filter({ hasText: walk.pet }).click();
    await page.getByRole("button", { name: "Написать", exact: true }).click();
  }
  return state;
}

test("owned pets start unselected, exclude invitations and support single keyboard selection", async ({ page }, testInfo) => {
  const state = await setup(page);
  const modal = page.getByRole("dialog", { name: title });
  await expect(modal).toBeVisible();
  const radios = modal.getByRole("radio");
  await expect(radios).toHaveCount(2);
  await expect(modal.getByText("Общий", { exact: true })).toHaveCount(0);
  await expect(modal.locator("input:checked")).toHaveCount(0);
  await expect(modal.locator(".pet-row > svg")).toHaveCount(0);
  const confirm = modal.getByRole("button", { name: "Написать", exact: true });
  await expect(confirm).toBeDisabled();
  expect(state.opens).toEqual([]);
  await modal.locator(".pet-row").nth(0).click();
  await expect(radios.nth(0)).toBeChecked();
  await radios.nth(0).focus();
  await page.keyboard.press("ArrowDown");
  await expect(radios.nth(1)).toBeChecked();
  await expect(radios.nth(0)).not.toBeChecked();
  await expect(modal.locator(".pet-row > svg")).toHaveCount(1);
  const selected = modal.locator(".pet-row:has(input:checked)");
  await expect(selected).toHaveCSS("outline-style", "solid");
  await expect(selected.locator("img")).toBeVisible();
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("pet-picker.png"), fullPage: true });
  await confirm.click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  expect(state.opens).toEqual([{ walkId: walk.id, petId: secondPet.id }]);
});

test("close and Escape cancel without opening a dialog; reopening clears selection", async ({ page }) => {
  const state = await setup(page);
  const modal = page.getByRole("dialog", { name: title });
  await modal.locator(".pet-row").first().click();
  await modal.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(modal).toHaveCount(0);
  expect(state.opens).toEqual([]);
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await expect(modal.locator("input:checked")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(modal).toHaveCount(0);
  expect(state.opens).toEqual([]);
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveCount(0);
});

test("one owned pet is sent automatically even with invited pets", async ({ page }) => {
  const state = await setup(page, [invitedPet, secondPet]);
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: title })).toHaveCount(0);
  expect(state.opens).toEqual([{ walkId: walk.id, petId: secondPet.id }]);
});

test("no owned pets preserves automatic chat behavior", async ({ page }) => {
  const state = await setup(page, [invitedPet]);
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  expect(state.opens).toEqual([{ walkId: walk.id }]);
});

test("opening an existing dialog from the list does not submit or reset pet selection", async ({ page }) => {
  const state = await setup(page, [secondPet], { fromList: true });
  await expect(page.getByRole("heading", { name: "Бим • Ольга", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  expect(state.opens).toEqual([]);
});

test("writing waits for owned pets to load instead of treating them as absent", async ({ page }) => {
  let release!: () => void;
  const petsGate = new Promise<void>(resolve => { release = resolve; });
  const state = await setup(page, [pet, secondPet, invitedPet], { petsGate });
  expect(state.opens).toEqual([]);
  release();
  const modal = page.getByRole("dialog", { name: title });
  await expect(modal.getByRole("radio")).toHaveCount(2);
  await expect(modal.getByRole("button", { name: "Написать", exact: true })).toBeDisabled();
});

test("cancelling during pet loading prevents a late dialog opening", async ({ page }) => {
  let release!: () => void;
  const petsGate = new Promise<void>(resolve => { release = resolve; });
  const state = await setup(page, [secondPet], { petsGate });
  const modal = page.getByRole("dialog", { name: title });
  await modal.getByRole("button", { name: "Закрыть", exact: true }).click();
  await expect(modal).toHaveCount(0);
  const loaded = page.waitForResponse("**/api/pets");
  release();
  await (await loaded).finished();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveCount(0);
  expect(state.opens).toEqual([]);
});

test("pet loading failures can be retried before selecting a pet", async ({ page }) => {
  const options = { petsFail: true };
  const state = await setup(page, [pet, secondPet], options);
  const modal = page.getByRole("dialog", { name: title });
  await expect(modal.getByText("Не удалось загрузить питомцев.", { exact: true })).toBeVisible();
  expect(state.opens).toEqual([]);
  options.petsFail = false;
  await modal.getByRole("button", { name: "Повторить", exact: true }).click();
  await expect(modal.getByRole("radio")).toHaveCount(2);
  await expect(modal.getByRole("button", { name: "Написать", exact: true })).toBeDisabled();
});

test("failed confirmation keeps selection and prevents parallel requests before retry", async ({ page }) => {
  const state = await setup(page);
  const modal = page.getByRole("dialog", { name: title });
  await modal.locator(".pet-row").nth(1).click();
  state.fail = true;
  let release!: () => void;
  state.gate = new Promise<void>(resolve => { release = resolve; });
  const confirm = modal.getByRole("button", { name: "Написать", exact: true });
  await confirm.click();
  await expect(confirm).toBeDisabled();
  await expect.poll(() => state.opens.length).toBe(1);
  release();
  await expect(modal.getByRole("alert")).toContainText("Питомец больше недоступен");
  await expect(modal.getByRole("radio").nth(1)).toBeChecked();
  await expect(confirm).toBeEnabled();
  state.fail = false;
  await confirm.click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  expect(state.opens).toHaveLength(2);
  expect(state.opens[1].petId).toBe(secondPet.id);
});
