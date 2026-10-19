import type { Page } from "@playwright/test";
import { location, mockApp } from "./fixtures";

type PushState = { permission: NotificationPermission; browser: boolean; server: boolean; calls: string[]; failSubscribe: boolean; failUnsubscribe: boolean; failDisable: boolean; failRegister: boolean; ownerConflict: boolean };
declare global { interface Window { dogmeetPushTest: PushState } }

export async function pushMock(page: Page, hasLocation = true, initial: Partial<PushState> = {}) {
  await mockApp(page, { hasLocation });
  await page.route("**/api/telegram/notifications", route => route.fulfill({ json: { enabled: false, subscribed: false } }));
  let savedLocation = hasLocation;
  await page.route("**/api/session", route => {
    if (route.request().method() === "PATCH") savedLocation = true;
    return route.fulfill({ json: { hasLocation: savedLocation, location: savedLocation ? location : null } });
  });
  await page.addInitScript(initial => {
    window.dogmeetPushTest = { permission: "default", browser: false, server: false, calls: [], failSubscribe: false, failUnsubscribe: false, failDisable: false, failRegister: false, ownerConflict: false, ...initial };
    const state = window.dogmeetPushTest;
    Object.defineProperty(window, "Notification", { value: {
      get permission() { return state.permission; },
      requestPermission: async () => { state.calls.push("permission"); return state.permission; }
    } });
    Object.defineProperty(window, "PushManager", { value: class {} });
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/test", options: {},
      toJSON: () => ({ endpoint: "https://fcm.googleapis.com/fcm/send/test", keys: { p256dh: "key", auth: "auth" } }),
      unsubscribe: async () => { state.calls.push("unsubscribe"); if (state.failUnsubscribe) throw new Error("offline"); state.browser = false; return true; } };
    const registration = { pushManager: {
      getSubscription: async () => state.browser ? subscription : null,
      subscribe: async () => { state.calls.push("subscribe"); state.browser = true; return subscription; }
    } };
    Object.defineProperty(navigator, "serviceWorker", { value: {
      getRegistration: async () => registration, register: async () => { if (state.failRegister) throw new Error("Регистрация не удалась"); return registration; }, ready: Promise.resolve(registration),
      addEventListener: () => {}, removeEventListener: () => {}
    } });
  }, initial);
  await page.route("**/api/push", async route => {
    if (route.request().method() === "GET") return route.fulfill({ json: { publicKey: "B".repeat(87), configured: true } });
    const body = route.request().postDataJSON();
    const state = await page.evaluate(() => window.dogmeetPushTest);
    if (body.action === "subscribe" && state.ownerConflict) {
      await page.evaluate(() => { window.dogmeetPushTest.ownerConflict = false; });
      return route.fulfill({ status: 409, json: { error: "Подписка связана с другой сессией браузера." } });
    }
    if (body.action === "disable" && state.failDisable) return route.fulfill({ status: 503, json: { error: "Сервер недоступен" } });
    if (body.action === "subscribe" && state.failSubscribe) return route.fulfill({ status: 503, json: { error: "Сервер недоступен" } });
    if (body.action !== "status") await page.evaluate(action => { window.dogmeetPushTest.calls.push(action === "subscribe" ? "server-subscribe" : "server-disable"); window.dogmeetPushTest.server = action === "subscribe"; }, body.action);
    return route.fulfill({ json: { enabled: body.action === "status" ? state.server : body.action === "subscribe" } });
  });
  await page.route("**/api/dialogs**", route => route.fulfill({ json: { dialogs: [], unreadCount: 0, nextCursor: null } }));
}
