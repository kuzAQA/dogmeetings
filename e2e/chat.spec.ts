import { expect, test, type Page } from "@playwright/test";
import { mockApp, walk } from "./fixtures";
import { CHAT_DELETE_NOTICE, CHAT_NOTICE } from "../server/domain/chat";

const dialogId = "30000000-0000-4000-8000-000000000001";
test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
});
async function mockChat(page: Page) {
  const state = { dialog: { id: dialogId, peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Луна • Анна", photoUrl: "/dog-luna.webp" },
    expiresAt: null as string | null, hiddenThrough: 0 },
    messages: [] as { seq: number; requestId: string; text: string; mine: boolean; createdAt: string; readAt: string | null }[],
    sends: [] as { requestId: string; text: string }[], failFirst: false, read: [] as number[], polls: 0, hidden: false,
    expired: false, historyGate: null as Promise<void> | null, sendGate: null as Promise<void> | null, activePolls: 0, maxPolls: 0 };
  await page.route("**/api/dialogs**", async route => {
    const url = new URL(route.request().url());
    const method = route.request().method();
    if (url.pathname === "/api/dialogs") {
      if (method === "POST") return route.fulfill({ json: { dialog: state.dialog, serverTime: new Date().toISOString() } });
      return route.fulfill({ json: { dialogs: !state.hidden && state.messages.length
        ? [{ ...state.dialog, lastMessage: state.messages.at(-1) }] : [], nextCursor: null } });
    }
    if (state.expired) return route.fulfill({ status: 410, json: { error: "Срок хранения диалога истёк." } });
    if (method === "PATCH") {
      const body = route.request().postDataJSON();
      if (body.action === "hide") { state.hidden = true; return route.fulfill({ json: { hiddenThrough: state.messages.length } }); }
      state.read.push(...body.messageSeqs);
      return route.fulfill({ json: { read: true } });
    }
    if (method === "POST") {
      const body = route.request().postDataJSON();
      state.sends.push(body);
      const existing = state.messages.find(m => m.requestId === body.requestId);
      const message = existing ?? { ...body, seq: state.messages.length + 1, mine: true, createdAt: new Date().toISOString(), readAt: null };
      if (!existing) state.messages.push(message);
      state.dialog.expiresAt ??= new Date(Date.now() + 72 * 3600000).toISOString();
      if (state.failFirst && state.sends.length === 1) return route.abort("timedout");
      if (state.sendGate) await state.sendGate;
      return route.fulfill({ json: { message, dialog: state.dialog, serverTime: new Date().toISOString() } });
    }
    state.polls++;
    state.activePolls++;
    state.maxPolls = Math.max(state.maxPolls, state.activePolls);
    try {
      if (state.historyGate) await state.historyGate;
      return await route.fulfill({ json: { dialog: state.dialog, messages: state.hidden ? [] : state.messages,
        receipts: state.messages.filter(m => m.mine).map(({ seq, readAt }) => ({ seq, readAt })),
        hasOlder: false, hasMore: false, serverTime: new Date().toISOString() } });
    } finally { state.activePolls--; }
  });
  return state;
}

async function openChat(page: Page) {
  await mockApp(page, { mine: [] });
  await page.goto("/");
  await page.locator(".walk-summary").filter({ hasText: walk.pet }).click();
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Луна • Анна", exact: true })).toBeVisible();
}

test("dialog header shows the peer and puts deletion behind a dismissible menu", async ({ page }, testInfo) => {
  const state = await mockChat(page);
  await openChat(page);
  const header = page.locator(".chat-heading");
  const menu = header.getByRole("button", { name: "Меню диалога", exact: true });
  const remove = page.getByRole("button", { name: "Удалить диалог", exact: true });
  await expect(header.getByRole("button", { name: "Назад", exact: true })).toBeVisible();
  await expect(page.locator(".chat-screen .brand")).toHaveCount(0);
  await expect(remove).not.toBeVisible();
  await menu.click();
  await expect(menu).toHaveAttribute("aria-expanded", "true");
  await expect(remove).toBeVisible();
  await remove.focus();
  await page.keyboard.press("Escape");
  await expect(remove).not.toBeVisible();
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole("textbox", { name: "Сообщение" }).click();
  await expect(remove).not.toBeVisible();
  state.dialog.peer.name = "ОченьДлинноеИмяПитомца • ОченьДлинноеИмяХозяина";
  await page.clock.fastForward(7000);
  await expect(header.getByRole("heading")).toHaveText(state.dialog.peer.name);
  const bounds = await header.boundingBox();
  expect(bounds!.y).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await expect(menu).toBeVisible();
  await expect(header.locator(".chat-peer")).toHaveCSS("height", "44px");
  state.dialog.peer.name = "Луна • Анна";
  await page.clock.fastForward(7000);
  await expect(header.getByRole("heading")).toHaveText(state.dialog.peer.name);
  await menu.click();
  await page.screenshot({ path: testInfo.outputPath("dialog-header.png") });
});

test("dialog focuses once, preserves the caret during updates and restores the draft on reopening", async ({ page }) => {
  const state = await mockChat(page);
  let release!: () => void;
  state.historyGate = new Promise<void>(resolve => { release = resolve; });
  await mockApp(page, { mine: [] });
  await page.goto("/");
  await page.locator(".walk-summary").filter({ hasText: walk.pet }).click();
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  await expect(input).toBeVisible();
  release();
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute("placeholder", "Сообщение");
  await page.keyboard.type("draft");
  await input.evaluate((node: HTMLTextAreaElement) => node.setSelectionRange(2, 2));
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Новое сообщение", mine: false, createdAt: new Date().toISOString(), readAt: null });
  await page.clock.fastForward(7100);
  await expect(page.getByText("Новое сообщение", { exact: true })).toBeVisible();
  await expect(input).toBeFocused();
  expect(await input.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd])).toEqual([2, 2]);
  await page.keyboard.type("X");
  await expect(input).toHaveValue("drXaft");
  const menu = page.getByRole("button", { name: "Меню диалога", exact: true });
  await menu.focus();
  await page.clock.fastForward(7100);
  await expect(menu).toBeFocused();
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("drXaft");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(state.sends[0].text).toBe("drXaft");
});

for (const photo of ["/dog-luna.webp", "/dog-placeholder.webp"]) {
  test(`dialog header fits long names with ${photo}`, async ({ page }, testInfo) => {
    const state = await mockChat(page);
    await openChat(page);
    state.dialog.peer.name = "ОченьДлинноеИмяПитомца".repeat(4) + " • " + "ОченьДлинноеИмяХозяина".repeat(4);
    state.dialog.peer.photoUrl = photo;
    await page.clock.fastForward(7100);
    const header = page.locator(".chat-heading");
    const avatar = header.getByRole("img");
    await expect.poll(() => avatar.getAttribute("src")).toContain(encodeURIComponent(photo));
    await expect(avatar).toHaveCSS("object-fit", "cover");
    await expect(avatar).toHaveCSS("border-radius", "50%");
    await expect(header.getByRole("heading")).toHaveText(state.dialog.peer.name);
    const layout = await header.evaluate(node => {
      const screen = node.closest(".chat-screen")!;
      const buttons = [...node.querySelectorAll("button")].map(button => button.getBoundingClientRect());
      return { width: node.getBoundingClientRect().width, screenWidth: screen.getBoundingClientRect().width,
        overflow: node.scrollWidth > node.clientWidth, buttonSizes: buttons.map(({ width, height }) => [width, height]) };
    });
    expect(layout.width).toBe(layout.screenWidth);
    expect(layout.overflow).toBe(false);
    expect(layout.buttonSizes).toEqual([[44, 44], [44, 44]]);
    await expect(header).toHaveCSS("background-color", "rgb(247, 244, 237)");
    await page.screenshot({ path: testInfo.outputPath("dialog-avatar.png") });
  });
}

test("composer matches the compact capsule and grows without moving the send button", async ({ page }, testInfo) => {
  const state = await mockChat(page);
  await openChat(page);
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  const send = page.getByRole("button", { name: "Отправить сообщение", exact: true });
  const capsule = page.locator(".chat-composer-input");
  await expect(input).toHaveValue("");
  await expect(send).toBeDisabled();
  await input.fill("Привет");
  await expect(send).toBeEnabled();
  await expect(capsule).toHaveCSS("background-color", "rgb(255, 253, 248)");
  await expect(input).toHaveCSS("color", "rgb(34, 42, 57)");
  await expect(capsule).toHaveCSS("height", "48px");
  await expect(send).toHaveCSS("width", "40px");
  await expect(send).toHaveCSS("height", "40px");
  await expect(capsule.locator("button")).toHaveCount(1);
  const leftInset = await input.evaluate(node => node.getBoundingClientRect().left
    - node.parentElement!.getBoundingClientRect().left + parseFloat(getComputedStyle(node).paddingLeft));
  expect(leftInset).toBe(16);
  await expect(input).toBeFocused();
  await expect(capsule).toHaveCSS("outline-style", "solid");
  await input.press("Tab");
  await expect(send).toBeFocused();
  await expect(send).toHaveCSS("outline-style", "solid");
  await page.screenshot({ path: testInfo.outputPath("composer-short.png"), fullPage: true });
  await input.fill("Строка 1\nСтрока 2\nСтрока 3");
  await expect.poll(async () => (await capsule.boundingBox())!.height).toBeGreaterThan(48);
  await page.screenshot({ path: testInfo.outputPath("composer-multiline.png"), fullPage: true });
  await input.fill("Длинная строка с переносом. ".repeat(50));
  const layout = await capsule.evaluate(node => {
    const input = node.querySelector("textarea")!;
    const button = node.querySelector("button")!;
    return { height: node.getBoundingClientRect().height, scrollHeight: input.scrollHeight,
      clientHeight: input.clientHeight, overflow: getComputedStyle(input).overflowY,
      buttonBottom: node.getBoundingClientRect().bottom - button.getBoundingClientRect().bottom };
  });
  expect(layout.height).toBeLessThanOrEqual(168);
  expect(layout.scrollHeight).toBeGreaterThan(layout.clientHeight);
  expect(layout.overflow).toBe("auto");
  expect(layout.buttonBottom).toBe(4);
  await expect(input).toHaveCSS("scrollbar-width", "none");
  await input.evaluate(node => { node.scrollTop = 0; });
  expect(await input.evaluate(node => node.scrollTop)).toBe(0);
  await input.evaluate(node => { node.scrollTop = node.scrollHeight; });
  expect(await input.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
  await page.screenshot({ path: testInfo.outputPath("composer-long.png"), fullPage: true });
  await input.fill("Привет");
  await expect(capsule).toHaveCSS("height", "48px");
  await input.press("Enter");
  await input.press("Shift+Enter");
  await input.dispatchEvent("compositionstart");
  await input.dispatchEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229 });
  await input.dispatchEvent("compositionend", { data: "т" });
  await expect(input).toHaveValue("Привет\n\n");
  await input.fill(" \n ");
  await expect(send).toBeDisabled();
  expect(state.sends).toEqual([]);
});

test("composer blocks duplicate submits while a mocked request is pending and resets its height", async ({ page }, testInfo) => {
  const state = await mockChat(page);
  await openChat(page);
  let release = () => {};
  state.sendGate = new Promise<void>(resolve => { release = resolve; });
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  const send = page.getByRole("button", { name: "Отправить сообщение", exact: true });
  await input.fill("Первая строка\nВторая строка\nТретья строка");
  try {
    await send.click();
    await expect.poll(() => state.sends.length).toBe(1);
    await expect(send).toBeDisabled();
    await expect(send).toHaveAttribute("aria-busy", "true");
    await expect(input).toBeDisabled();
    await page.locator(".chat-composer").evaluate(node => {
      (node as HTMLFormElement).requestSubmit();
      (node as HTMLFormElement).requestSubmit();
    });
    expect(state.sends).toHaveLength(1);
    await page.screenshot({ path: testInfo.outputPath("composer-sending.png"), fullPage: true });
  } finally { release(); }
  await expect(input).toHaveValue("");
  await expect(page.locator(".chat-composer-input")).toHaveCSS("height", "48px");
  await expect(send).toBeDisabled();
  await expect(send).toHaveAttribute("aria-busy", "false");
  expect(state.sends).toHaveLength(1);
});

test("menu opens the exact empty state without creating or reading messages", async ({ page }) => {
  const state = await mockChat(page);
  await mockApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await page.getByRole("button", { name: /^Диалоги/ }).click();
  await expect(page.getByText("Вы еще никому не писали", { exact: true })).toBeVisible();
  expect(state.read).toEqual([]);
  expect(state.sends).toEqual([]);
});

test("notice, Unicode limit, failed-send retry and accessible receipts", async ({ page }, testInfo) => {
  const state = await mockChat(page);
  state.failFirst = true;
  await openChat(page);
  await expect(page.getByText(CHAT_NOTICE, { exact: true })).toBeVisible();
  const input = page.getByRole("textbox", { name: "Сообщение" });
  await input.fill("🐕".repeat(2001));
  await expect(page.getByRole("button", { name: "Отправить сообщение", exact: true })).toBeDisabled();
  await input.fill(" \n ");
  await expect(page.getByRole("button", { name: "Отправить сообщение", exact: true })).toBeDisabled();
  await input.fill("<b>Привет</b>");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось отправить");
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await expect(input).toHaveValue("<b>Привет</b>");
  await expect(input).toHaveAttribute("readonly", "");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(input).toHaveValue("");
  expect(state.sends[0].requestId).toBe(state.sends[1].requestId);
  await expect(page.locator(".chat-message")).toHaveCount(1);
  await expect(page.getByLabel("Отправлено", { exact: true })).toBeVisible();
  expect(await page.locator(".chat-message b").count()).toBe(0);
  state.messages[0].readAt = new Date().toISOString();
  await page.clock.fastForward(7100);
  await expect(page.getByLabel("Прочитано", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("dialog.png"), fullPage: true });
});

test("sending without crypto.randomUUID keeps a valid UUID across timeout retries", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(crypto, "randomUUID", { value: undefined, configurable: true });
  });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const state = await mockChat(page);
  state.failFirst = true;
  await openChat(page);
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe("undefined");
  expect(await page.evaluate(() => typeof crypto.getRandomValues)).toBe("function");
  await page.getByRole("textbox", { name: "Сообщение" }).fill("Привет из локальной сети");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("");
  expect(state.sends[0].requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(state.sends[0].requestId).toBe(state.sends[1].requestId);
  await expect(page.locator(".chat-message")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("visible incoming messages get receipts; hide asks confirmation and returns to the list", async ({ page }) => {
  const state = await mockChat(page);
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Встречаемся?", mine: false,
    createdAt: new Date().toISOString(), readAt: null });
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  await openChat(page);
  await expect.poll(() => state.read).toContain(1);
  await page.getByRole("button", { name: "Меню диалога", exact: true }).click();
  await page.getByRole("button", { name: "Удалить диалог", exact: true }).click();
  await expect(page.getByText(CHAT_DELETE_NOTICE, { exact: true })).toBeVisible();
  expect(state.hidden).toBe(false);
  await page.getByRole("button", { name: "Удалить только у меня" }).click();
  await expect.poll(() => state.hidden).toBe(true);
});

test("expiry removes rendered history and keeps the unsent draft", async ({ page }) => {
  const state = await mockChat(page);
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Старая история", mine: true,
    createdAt: new Date().toISOString(), readAt: null });
  state.dialog.expiresAt = new Date(Date.now() + 20000).toISOString();
  await openChat(page);
  await page.getByRole("textbox", { name: "Сообщение" }).fill("Черновик");
  state.expired = true;
  await page.clock.fastForward(7100);
  await expect(page.getByText("Старая история", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Начать новый диалог" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("Черновик");
  const nextId = "30000000-0000-4000-8000-000000000002";
  state.expired = false; state.dialog.id = nextId; state.dialog.expiresAt = null; state.messages = [];
  await page.getByRole("button", { name: "Начать новый диалог" }).click();
  await expect(page.getByText(CHAT_NOTICE, { exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("Черновик");
  expect(await page.evaluate(() => history.state.chatDialogId)).toBe(nextId);
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByText("Черновик", { exact: true })).toBeVisible();
});

test("a delayed successful response cannot put expired history back on screen", async ({ page }) => {
  const state = await mockChat(page);
  state.dialog.expiresAt = new Date(Date.now() + 10000).toISOString();
  await openChat(page);
  let release = () => {};
  state.sendGate = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("textbox", { name: "Сообщение" }).fill("Поздний ответ сервера");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect.poll(() => state.sends.length).toBe(1);
  await page.clock.fastForward(11000);
  await expect(page.getByRole("button", { name: "Начать новый диалог" })).toBeVisible();
  release();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("");
  await expect(page.locator(".chat-message")).toHaveCount(0);
});

test("polling never overlaps and pauses in hidden tabs; return refreshes and reads immediately", async ({ page }) => {
  const state = await mockChat(page);
  let release = () => {};
  state.historyGate = new Promise<void>(resolve => { release = resolve; });
  await mockApp(page, { mine: [] });
  await page.goto("/");
  await page.locator(".walk-summary").filter({ hasText: walk.pet }).click();
  await page.getByRole("button", { name: "Написать", exact: true }).click();
  await expect.poll(() => state.polls).toBe(1);
  await page.clock.fastForward(14000);
  expect(state.polls).toBe(1);
  release(); state.historyGate = null;
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  const polls = state.polls;
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Пока вкладка скрыта", mine: false,
    createdAt: new Date().toISOString(), readAt: null });
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  await page.clock.fastForward(30000);
  expect(state.polls).toBe(polls);
  expect(state.read).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(page.getByText("Пока вкладка скрыта", { exact: true })).toBeVisible();
  await expect.poll(() => state.read).toContain(1);
  expect(state.maxPolls).toBe(1);
});

test("list deletion works from a keyboard context menu", async ({ page }) => {
  const state = await mockChat(page);
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Последнее сообщение", mine: false,
    createdAt: new Date().toISOString(), readAt: null });
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  await mockApp(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await page.getByRole("button", { name: /^Диалоги/ }).click();
  await expect(page.getByText("Последнее сообщение", { exact: true })).toBeVisible();
  await expect(page.locator(".chat-list-open strong")).toHaveText("Луна • Анна");
  expect(state.read).toEqual([]);
  const row = page.locator(".chat-list-open");
  await expect(page.getByRole("button", { name: "Удалить диалог с Луна • Анна" })).toHaveCount(0);
  await row.focus(); await page.keyboard.press("Shift+F10");
  await expect(row).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Enter");
  await expect(page.getByText(CHAT_DELETE_NOTICE, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Удалить только у меня" }).click();
  await expect(page.getByText("Вы еще никому не писали", { exact: true })).toBeVisible();
});

async function openDialogList(page: Page, second = false) {
  const state = await mockChat(page);
  state.messages.push({ seq: 1, requestId: crypto.randomUUID(), text: "Диалог для удаления", mine: false,
    createdAt: new Date().toISOString(), readAt: null });
  if (second) await page.route("**/api/dialogs", route => route.fulfill({ json: {
    dialogs: [state.dialog, { ...state.dialog, id: "30000000-0000-4000-8000-000000000002", peer: { ...state.dialog.peer, name: "Рекс" } }]
      .map(dialog => ({ ...dialog, lastMessage: state.messages[0] })), nextCursor: null
  } }));
  await mockApp(page); await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await page.getByRole("button", { name: /^Диалоги/ }).click();
  await expect(page.locator(".chat-list-open").first()).toBeVisible();
  return state;
}

test("list context menu selects one row and dismisses with Escape or outside", async ({ page }, testInfo) => {
  await openDialogList(page);
  const row = page.locator(".chat-list-open");
  await row.click({ button: "right" });
  await expect(page.getByRole("menuitem", { name: "Удалить", exact: true })).toBeFocused();
  await expect(page.locator(".chat-list-row.is-selected")).toHaveCount(1);
  await expect(page.locator(".chat-list-check")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("selected-dialog.png") });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".chat-list-row.is-selected")).toHaveCount(0);
  await expect(row).toBeFocused();
  await row.press("ContextMenu");
  await page.getByRole("heading", { name: "Диалоги", exact: true }).click();
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(page.locator(".chat-list-row.is-selected")).toHaveCount(0);
  await row.click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
});

test("list long press suppresses opening and preserves confirmation cancellation", async ({ page }) => {
  const state = await openDialogList(page);
  const row = page.locator(".chat-list-open");
  await row.dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 150, clientY: 100 });
  await page.clock.fastForward(550);
  await row.dispatchEvent("pointerup", { pointerType: "touch", isPrimary: true, clientX: 150, clientY: 100 });
  await row.dispatchEvent("click");
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveCount(0);
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  await expect(page.getByText(CHAT_DELETE_NOTICE, { exact: true })).toBeVisible();
  expect(state.hidden).toBe(false);
  await page.getByRole("button", { name: "Отмена", exact: true }).click();
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
});

test("list selection moves to one dialog and touch movement cancels the hold", async ({ page }) => {
  await openDialogList(page, true);
  const rows = page.locator(".chat-list-open");
  await rows.first().click({ button: "right" });
  await rows.last().click({ button: "right", position: { x: 24, y: 24 } });
  await expect(page.locator(".chat-list-row.is-selected")).toHaveCount(1);
  await expect(rows.first()).toHaveAttribute("aria-expanded", "false");
  await expect(rows.last()).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await rows.first().dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 150, clientY: 100 });
  await rows.first().dispatchEvent("pointermove", { pointerType: "touch", clientX: 150, clientY: 125 });
  await page.clock.fastForward(550);
  await rows.first().dispatchEvent("pointercancel", { pointerType: "touch" });
  await expect(page.getByRole("menu")).toHaveCount(0);
  await rows.first().dispatchEvent("pointerdown", { pointerType: "touch", isPrimary: true, clientX: 150, clientY: 100 });
  await page.clock.fastForward(100);
  await rows.first().dispatchEvent("pointerup", { pointerType: "touch", clientX: 150, clientY: 100 });
  await rows.first().dispatchEvent("click");
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toBeVisible();
});

test("list failed deletion keeps the dialog and can retry", async ({ page }) => {
  const state = await openDialogList(page);
  let fail = true;
  await page.route(`**/api/dialogs/${dialogId}`, route => fail
    ? route.fulfill({ status: 500, json: { error: "Не удалось удалить диалог." } }) : route.fallback());
  await page.locator(".chat-list-open").click({ button: "right" });
  await page.getByRole("menuitem", { name: "Удалить", exact: true }).click();
  await page.getByRole("button", { name: "Удалить только у меня" }).click();
  await expect(page.getByRole("alert")).toHaveText("Не удалось удалить диалог.");
  await expect(page.locator(".chat-list-row")).toHaveCount(1);
  expect(state.hidden).toBe(false);
  fail = false;
  await page.getByRole("button", { name: "Удалить только у меня" }).click();
  await expect(page.getByText("Вы еще никому не писали", { exact: true })).toBeVisible();
});

test("history groups local calendar days and wraps long text on narrow screens", async ({ page }) => {
  const state = await mockChat(page);
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  for (let index = 0; index < 2; index++) state.messages.push({ seq: index + 1, requestId: crypto.randomUUID(),
    text: index ? "длинноеслово".repeat(150) : "Вчерашнее сообщение", mine: true,
    createdAt: `2026-09-${14 + index}T12:00:00.000Z`, readAt: null });
  await openChat(page);
  const expected = await page.evaluate(dates => dates.map(date => new Intl.DateTimeFormat("ru-RU", {
    day: "numeric", month: "long", year: "numeric"
  }).format(new Date(date))), state.messages.map(message => message.createdAt));
  await expect(page.locator(".chat-day")).toHaveText(expected);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

for (const mine of [true, false]) for (const texts of [["Привет"], ["Привет", "Как дела"], ["Длинное сообщение с переносами. ".repeat(30) + "\nПоследняя строка", "https://example.com/" + "long-link".repeat(120)]]) {
  test(`${mine ? "outgoing" : "incoming"} bubbles fit their content and sit at the bottom: ${texts[0].slice(0, 16)}/${texts.length}`, async ({ page }, testInfo) => {
    const state = await mockChat(page);
    state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
    texts.forEach((text, index) => state.messages.push({ seq: index + 1, requestId: crypto.randomUUID(), text, mine,
      createdAt: new Date(Date.now() + index * 60000).toISOString(), readAt: null }));
    await openChat(page);
    const bubbles = page.locator(mine ? ".chat-message--mine" : ".chat-message:not(.chat-message--mine)");
    await expect(bubbles).toHaveCount(texts.length);
    await expect(page.locator(".chat-heading h1")).toHaveCSS("font-size", "14px");
    await expect(bubbles.first().locator("p")).toHaveCSS("font-size", page.viewportSize()!.width <= 480 ? "16px" : "18px");
    await expect(bubbles.first()).toHaveCSS("background-color", mine ? "rgb(220, 230, 237)" : "rgb(240, 223, 209)");
    await expect(bubbles.first()).toHaveCSS("color", "rgb(34, 42, 57)");
    await expect(bubbles.first().locator(".chat-message-meta")).toHaveCSS("color", "rgb(100, 102, 107)");
    const layout = await page.locator(".chat-history").evaluate(node => {
      const bubbles = [...node.querySelectorAll<HTMLElement>(".chat-message")];
      const last = bubbles.at(-1)!.getBoundingClientRect();
      return { bottomGap: node.getBoundingClientRect().bottom - last.bottom, overflow: node.scrollWidth > node.clientWidth,
        widths: bubbles.map(bubble => bubble.getBoundingClientRect().width),
        lineCounts: bubbles.map(bubble => {
          const text = bubble.querySelector("p")!;
          return text.getBoundingClientRect().height / parseFloat(getComputedStyle(text).lineHeight);
        }),
        metaInside: bubbles.every(bubble => {
          const bounds = bubble.getBoundingClientRect(), meta = bubble.querySelector(".chat-message-meta")!.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(bubble.querySelector(".chat-message-text")!);
          const lastLine = [...range.getClientRects()].at(-1)!;
          return Math.abs(bounds.right - meta.right - 10) < 1 && Math.abs(bounds.bottom - meta.bottom - 6) < 1
            && (lastLine.bottom <= meta.top || lastLine.right + 7 <= meta.left);
        }) };
    });
    expect(layout.bottomGap).toBeCloseTo(12, 0);
    expect(layout.overflow).toBe(false);
    expect(layout.metaInside).toBe(true);
    if (!mine) await expect(bubbles.locator(".chat-receipt")).toHaveCount(0);
    if (texts[0] === "Привет") {
      expect(layout.widths[0]).toBeLessThan(170);
      expect(layout.lineCounts).toEqual(texts.map(() => 1));
    }
    await expect(bubbles.last()).toHaveClass(/chat-message--group-end/);
    if (texts.length === 2) {
      await expect(bubbles.first()).not.toHaveClass(/chat-message--group-end/);
      await expect(bubbles.last()).toHaveClass(/chat-message--group-following/);
    }
    await page.screenshot({ animations: "disabled", path: testInfo.outputPath(`${mine ? "outgoing" : "incoming"}-${texts.length}-${texts[0] === "Привет" ? "short" : "long"}.png`), fullPage: true });
  });
}

test("history follows sends and viewport changes but keeps the reader's position on incoming updates", async ({ page }, testInfo) => {
  const state = await mockChat(page);
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  for (let index = 0; index < 40; index++) state.messages.push({ seq: index + 1, requestId: crypto.randomUUID(),
    text: `Сообщение ${index + 1}. ` + "Переполненная история. ".repeat(3), mine: index % 3 !== 0,
    createdAt: new Date().toISOString(), readAt: null });
  await openChat(page);
  const history = page.locator(".chat-history");
  await expect(history).toHaveCSS("scrollbar-width", "none");
  const bottomGap = () => history.evaluate(node => node.scrollHeight - node.scrollTop - node.clientHeight);
  await expect.poll(bottomGap).toBeLessThan(2);
  await history.evaluate(node => { node.scrollTop = 100; });
  await expect.poll(() => history.evaluate(node => node.scrollTop)).toBe(100);
  state.messages.push({ seq: 41, requestId: crypto.randomUUID(), text: "Новое входящее", mine: false,
    createdAt: new Date().toISOString(), readAt: null });
  await page.clock.fastForward(7100);
  await expect(page.locator('.chat-message[data-seq="41"]')).toHaveCount(1);
  expect(await history.evaluate(node => node.scrollTop)).toBe(100);
  await page.getByRole("textbox", { name: "Сообщение" }).fill("Мой новый ответ");
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение" })).toHaveValue("");
  await expect.poll(bottomGap).toBeLessThan(2);
  await page.screenshot({ animations: "disabled", path: testInfo.outputPath("overflow-after-send.png"), fullPage: true });
  const viewport = page.viewportSize()!;
  await page.setViewportSize({ width: viewport.width, height: viewport.height - 250 });
  await expect.poll(bottomGap).toBeLessThan(2);
  const bounds = await page.locator(".chat-composer").boundingBox();
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(viewport.height - 250);
  await page.setViewportSize(viewport);
  await expect.poll(bottomGap).toBeLessThan(2);
  await page.evaluate(height => {
    Object.defineProperty(window.visualViewport!, "height", { configurable: true, get: () => height });
    window.visualViewport!.dispatchEvent(new Event("resize"));
  }, viewport.height - 250);
  await expect.poll(bottomGap).toBeLessThan(2);
  await expect.poll(async () => {
    const composer = await page.locator(".chat-composer").boundingBox();
    return composer!.y + composer!.height;
  }).toBeLessThanOrEqual(viewport.height - 250);
});

test("composer stays above the iOS keyboard when Safari pans the visual viewport", async ({ page }) => {
  test.skip(page.viewportSize()!.width >= 900, "Mobile keyboard behavior");
  await mockChat(page);
  await openChat(page);
  const input = page.getByRole("textbox", { name: "Сообщение" });
  await input.fill("Привет");
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "height", { configurable: true, get: () => 360 });
    viewport.dispatchEvent(new Event("resize"));
  });
  await page.evaluate(() => {
    window.scrollTo(0, 180);
    const viewport = window.visualViewport!;
    Object.defineProperty(viewport, "offsetTop", { configurable: true, get: () => 120 });
    viewport.dispatchEvent(new Event("scroll"));
  });
  const composer = page.locator(".chat-composer");
  await expect.poll(async () => {
    const bounds = await composer.boundingBox();
    return Math.abs(480 - bounds!.y - bounds!.height);
  }).toBeLessThanOrEqual(20);
  const heading = await page.getByRole("heading", { name: "Луна • Анна", exact: true }).boundingBox();
  expect(heading!.y).toBeGreaterThanOrEqual(120);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByRole("button", { name: "Отправить сообщение", exact: true }).click();
  await expect(input).toHaveValue("");
  await expect(page.locator(".chat-message-text")).toHaveText("Привет");
  await page.evaluate(() => {
    const viewport = window.visualViewport!;
    Reflect.deleteProperty(viewport, "height");
    Reflect.deleteProperty(viewport, "offsetTop");
    viewport.dispatchEvent(new Event("resize"));
  });
  await expect.poll(async () => {
    const bounds = await composer.boundingBox();
    return Math.abs(page.viewportSize()!.height - bounds!.y - bounds!.height);
  }).toBeLessThanOrEqual(20);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await expect(page.locator(".chat-screen")).toHaveCount(0);
  await expect(page.locator(".production")).toHaveCSS("position", "static");
});

test("message groups stop at sender changes and calendar days", async ({ page }) => {
  const state = await mockChat(page);
  state.dialog.expiresAt = new Date(Date.now() + 72 * 3600000).toISOString();
  [true, true, false, true, true].forEach((mine, index) => state.messages.push({ seq: index + 1, requestId: crypto.randomUUID(),
    text: `Сообщение ${index + 1}`, mine, createdAt: `2026-09-${index === 4 ? "15" : "14"}T12:00:00Z`, readAt: null }));
  await openChat(page);
  await expect(page.locator(".chat-message--group-end")).toHaveCount(4);
  await expect(page.locator(".chat-message--group-following")).toHaveCount(1);
  await expect(page.locator(".chat-message:not(.chat-message--mine)")).toHaveCSS("border-radius", "18px 18px 18px 4px");
});


test("dialogs menu row is first, uses the existing description style and opens dialogs", async ({ page }, testInfo) => {
  await mockApp(page);
  await mockChat(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  const rows = page.locator(".profile-screen .menu-row");
  await expect(rows.locator("strong")).toHaveText([
    "Диалоги", "Поделиться сайтом", "Информация", "Мои места", "Push-уведомления", "Связь с разработчиком",
  ]);
  const description = rows.first().locator("small");
  await expect(description).toHaveText("Сообщите своим друзьям что-то важное");
  await expect(description).toBeVisible();
  await expect(description).toHaveCSS("font-size", "12px");
  const bounds = await description.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({ path: testInfo.outputPath("dialogs-menu.png"), fullPage: true });
  await rows.first().click();
  await expect(page.getByRole("heading", { name: "Диалоги", exact: true })).toBeVisible();
});
