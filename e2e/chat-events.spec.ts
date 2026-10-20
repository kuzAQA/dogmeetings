import { expect, test } from "@playwright/test";
import { mockApp } from "./fixtures";

test("home receives notifications without polling the unread counter for 31 seconds", async ({ page }) => {
  test.setTimeout(45000);
  let unreadRequests = 0;
  let eventRequests = 0;
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
  await mockApp(page);
  await page.route("**/api/dialogs/events", route => {
    eventRequests++;
    return route.fulfill({ contentType: "text/event-stream", body: 'retry: 60000\n\nevent: unread\ndata: {"unreadCount":2}\n\n' });
  });
  await page.route("**/api/dialogs?unread=1", route => {
    unreadRequests++;
    return route.fulfill({ json: { unreadCount: 0 } });
  });
  await page.goto("/");
  await expect(page.locator(".walk-summary").first()).toBeVisible();
  await page.waitForTimeout(31000);
  console.log(`Unread counter HTTP requests in 31 seconds: ${unreadRequests}`);
  expect(unreadRequests).toBe(0);
  expect(eventRequests).toBe(1);
});

const dialogId = "30000000-0000-4000-8000-000000000001";
declare global {
  interface Window { chatSources: Array<EventTarget & { closed: boolean; url: string }>; }
}

async function notifications(page: import("@playwright/test").Page) {
  await page.clock.install({ time: new Date("2026-09-15T15:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-15T15:00:01Z"));
  await page.addInitScript(() => {
    window.chatSources = [];
    class Source extends EventTarget {
      closed = false;
      url: string;
      constructor(url: string) {
        super(); this.url = url; window.chatSources.push(this);
      }
      close() { this.closed = true; }
    }
    window.EventSource = Source as unknown as typeof EventSource;
  });
  await mockApp(page);
  await page.route(`**/api/dialogs/${dialogId}/messages?*`, route => route.fulfill({ json: {
    dialog: { id: dialogId, peer: { clientId: "40000000-0000-4000-8000-000000000001", name: "Луна • Анна", photoUrl: "/dog-luna.webp" }, expiresAt: null, hiddenThrough: 0 },
    messages: [], receipts: [], hasOlder: false, hasMore: false, serverTime: new Date().toISOString()
  } }));
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => window.chatSources.length)).toBe(1);
}

test("snapshot is quiet; incoming banner opens its dialog once and preserves focus", async ({ page }, testInfo) => {
  await notifications(page);
  const banner = page.locator(".chat-notification");
  await page.evaluate(() => window.chatSources[0].dispatchEvent(new MessageEvent("unread", { data: '{"unreadCount":2}' })));
  await expect(banner).toBeEmpty();
  const menu = page.getByRole("button", { name: "Мой район и настройки" });
  await menu.focus();
  const incoming = async (seq: number) => page.evaluate(({ dialogId, seq }) => {
    window.chatSources.at(-1)!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ dialogId, messageSeq: seq }) }));
  }, { dialogId, seq });
  await incoming(1);
  await expect(banner).toContainText("Новое сообщение");
  await expect(menu).toBeFocused();
  await page.clock.runFor(500);
  await page.screenshot({ path: testInfo.outputPath("chat-notification.png") });
  await page.getByRole("button", { name: "Закрыть уведомление" }).click();
  await incoming(1);
  await expect(banner).toBeEmpty();
  await incoming(2);
  await page.getByRole("button", { name: "Открыть диалог", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Сообщение", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Луна • Анна", exact: true })).toBeVisible();
  await incoming(3);
  await expect(banner).toBeEmpty();
  expect(await page.evaluate(() => window.chatSources.length)).toBe(1);
});

test("hidden tabs close SSE; return opens exactly one fresh stream without polling", async ({ page }) => {
  let unreadRequests = 0;
  await page.route("**/api/dialogs?unread=1", route => { unreadRequests++; return route.fulfill({ json: { unreadCount: 0 } }); });
  await notifications(page);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => window.chatSources.filter(source => !source.closed).length)).toBe(0);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await page.evaluate(() => window.chatSources.length)).toBe(2);
  await page.evaluate(() => {
    window.chatSources[1].dispatchEvent(new MessageEvent("unread", { data: '{"unreadCount":3}' }));
    window.chatSources[1].dispatchEvent(new Event("error"));
    window.dispatchEvent(new Event("dogmeet-chat-changed"));
  });
  await page.clock.fastForward(31000);
  expect(unreadRequests).toBe(0);
  expect(await page.evaluate(() => window.chatSources.length)).toBe(2);
  await page.getByRole("button", { name: "Мой район и настройки" }).click();
  await expect(page.getByRole("button", { name: /Диалоги/ }).getByRole("img", { name: "Есть непрочитанные сообщения" })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("dogmeet-session-changed")));
  expect(await page.evaluate(() => window.chatSources.length)).toBe(3);
  expect(await page.evaluate(() => window.chatSources.filter(source => !source.closed).length)).toBe(1);
});

async function incoming(page: import("@playwright/test").Page, messageSeq: number) {
  await page.evaluate(({ dialogId, messageSeq }) => {
    window.chatSources.at(-1)!.dispatchEvent(new MessageEvent("message", { data: JSON.stringify({ dialogId, messageSeq }) }));
  }, { dialogId, messageSeq });
}

test("notification expires after five seconds and disables actions during its exit", async ({ page }) => {
  await notifications(page);
  await incoming(page, 1);
  const toast = page.locator(".d2-toast");
  await expect(toast).toBeVisible();
  await page.clock.runFor(4000);
  await incoming(page, 1);
  await page.clock.runFor(999);
  await expect(toast.getByRole("button", { name: "Открыть диалог", exact: true })).toBeEnabled();
  await page.clock.runFor(1);
  await expect(toast.getByRole("button", { name: "Открыть диалог", exact: true })).toBeDisabled();
  await page.clock.runFor(279);
  await expect(toast).toHaveCount(1);
  await page.clock.runFor(1);
  await expect(toast).toHaveCount(0);
  await incoming(page, 1);
  await expect(toast).toHaveCount(0);
});

test("new messages replace the toast and cancel old expiry and exit timers", async ({ page }) => {
  await notifications(page);
  await incoming(page, 1);
  await page.clock.runFor(4000);
  await incoming(page, 2);
  await page.clock.runFor(1280);
  await expect(page.locator(".d2-toast")).toHaveCount(1);
  await page.clock.runFor(3720);
  await expect(page.locator(".d2-open")).toBeDisabled();
  await page.clock.runFor(100);
  await incoming(page, 3);
  await page.clock.runFor(180);
  await expect(page.locator(".d2-open")).toBeEnabled();
  await expect(page.locator(".d2-toast")).toHaveCount(1);
  await page.clock.runFor(5100);
  await expect(page.locator(".d2-toast")).toHaveCount(0);
});

for (const name of ["Закрыть", "Закрыть уведомление"]) {
  test(`notification dismisses immediately via ${name} without marking read`, async ({ page }) => {
    await notifications(page);
    let messageRequests = 0;
    page.on("request", request => { if (request.url().includes(`/api/dialogs/${dialogId}/messages`)) messageRequests++; });
    await page.evaluate(() => window.chatSources.at(-1)!.dispatchEvent(new MessageEvent("unread", { data: '{"unreadCount":2}' })));
    await incoming(page, 1);
    await page.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".d2-toast")).toHaveCount(0);
    await incoming(page, 1);
    await expect(page.locator(".d2-toast")).toHaveCount(0);
    await incoming(page, 2);
    await page.clock.runFor(5000);
    await expect(page.locator(".d2-open")).toBeDisabled();
    await page.clock.runFor(280);
    await expect(page.locator(".d2-toast")).toHaveCount(0);
    await page.getByRole("button", { name: "Мой район и настройки" }).click();
    await expect(page.getByRole("button", { name: /Диалоги/ }).getByRole("img", { name: "Есть непрочитанные сообщения" })).toBeVisible();
    expect(messageRequests).toBe(0);
  });
}

for (const width of [320, 375, 390, 1440]) {
  test(`notification layout and live motion at ${width}px`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "desktop", "One visual pass per width");
    await page.setViewportSize({ width, height: 844 });
    await notifications(page);
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}-initial.png`) });
    await page.clock.resume();
    await incoming(page, 1);
    const toast = page.locator(".d2-toast");
    const shakeStart = await page.locator(".d2-icon").evaluate(el => getComputedStyle(el).transform);
    await page.waitForTimeout(100);
    expect(await page.locator(".d2-icon").evaluate(el => getComputedStyle(el).transform)).not.toBe(shakeStart);
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}-enter.png`) });
    await page.waitForTimeout(450);
    await expect(toast).toBeVisible();
    const box = await toast.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    const frame = await page.locator(".phone").boundingBox();
    expect(box!.width).toBeLessThanOrEqual(frame!.width);
    expect(await toast.evaluate(el => Boolean(document.elementFromPoint(el.getBoundingClientRect().x + 10, el.getBoundingClientRect().y + 10)?.closest(".d2-toast")))).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const button of await toast.getByRole("button").all()) {
      const rect = await button.boundingBox();
      expect(rect!.width).toBeGreaterThanOrEqual(44);
      expect(rect!.height).toBeGreaterThanOrEqual(44);
      expect(rect!.x + rect!.width).toBeLessThanOrEqual(box!.x + box!.width);
    }
    await expect(page.locator(".d2-open")).toHaveCSS("background-color", "rgb(190, 70, 41)");
    expect(await toast.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    expect(await page.locator(".d2-icon").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}.png`) });
    const before = await page.locator(".d2-progress").evaluate(el => el.getBoundingClientRect().width);
    await page.waitForTimeout(1600);
    const after = await page.locator(".d2-progress").evaluate(el => el.getBoundingClientRect().width);
    expect(after).toBeLessThan(before);
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}-progress.png`) });
    await expect(page.locator(".d2-open")).toBeDisabled({ timeout: 3500 });
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}-exit.png`) });
    await expect(toast).toHaveCount(0);
    await page.screenshot({ path: testInfo.outputPath(`notification-${width}-closed.png`) });
  });
}

test("reduced motion removes spatial animation and still expires", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await notifications(page);
  await incoming(page, 1);
  await expect(page.locator(".d2-icon")).toHaveCSS("animation-name", "none");
  await expect(page.locator(".d2-toast")).toHaveCSS("animation-name", "d2-fade-in");
  await expect(page.locator(".d2-toast")).toHaveCSS("transform", "none");
  await page.clock.runFor(5000);
  await expect(page.locator(".d2-open")).toBeDisabled();
  await page.clock.runFor(280);
  await expect(page.locator(".d2-toast")).toHaveCount(0);
});
