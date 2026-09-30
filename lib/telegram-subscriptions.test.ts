import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  telegramDeepLink,
  telegramStartToken,
  telegramUnsubscribeCallbackData,
  telegramUnsubscribeSubscriptionId
} from "./telegram-subscription-protocol.ts";

const token = "a".repeat(32);
const subscriptionId = "123e4567-e89b-42d3-a456-426614174000";

test("Telegram deep link contains only an opaque start token", () => {
  assert.equal(telegramDeepLink("DogmeetBot", token), `https://t.me/DogmeetBot?start=${token}`);
  assert.equal(telegramStartToken(`/start ${token}`), token);
  assert.equal(telegramStartToken("/start Москва Скандинавия"), null);
});

test("unsubscribe callback data is scoped and parseable", () => {
  const unsubscribe = telegramUnsubscribeCallbackData(subscriptionId);
  assert.equal(telegramUnsubscribeSubscriptionId(unsubscribe), subscriptionId);
  assert.equal(telegramUnsubscribeSubscriptionId("complex-unsubscribe:other"), null);
  assert.ok(new TextEncoder().encode(unsubscribe!).length <= 64);
});

test("subscription upsert and unsubscription are idempotent for one Telegram chat", async () => {
  const schema = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  const subscriptions = await readFile(new URL("./telegram-subscriptions.ts", import.meta.url), "utf8");
  assert.match(schema, /telegram_complex_subscriptions_chat_location_unique[\s\S]*telegramChatId[\s\S]*residentialComplex/);
  assert.match(subscriptions, /\.onConflictDoNothing\([\s\S]*telegramComplexSubscriptions\.telegramChatId[\s\S]*telegramComplexSubscriptions\.residentialComplex/);
  assert.match(subscriptions, /eq\(telegramComplexSubscriptions\.id, subscriptionId\)[\s\S]*eq\(telegramComplexSubscriptions\.telegramChatId, chatId\)/);
  const webhook = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhook, /activateTelegramComplexSubscription\(token, chatId\)/);
  assert.match(webhook, /activateTelegramComplexSubscription\(token, chatId\);[\s\S]*?if \(chat\?\.type === "private"[\s\S]*?telegramBotRequest\("deleteMessage", \{ chat_id: chatId, message_id: message\.message_id \}\);[\s\S]*?if \(result\.status === "expired"\)/);
});

test("walk notifications are queued only for active subscriptions in the same complex", async () => {
  const route = await readFile(new URL("../app/api/walks/route.ts", import.meta.url), "utf8");
  const scheduler = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
  assert.match(route, /eq\(telegramComplexSubscriptions\.active, true\)[\s\S]*eq\(telegramComplexSubscriptions\.city, city\)[\s\S]*eq\(telegramComplexSubscriptions\.district, district\)[\s\S]*eq\(telegramComplexSubscriptions\.residentialComplex, residentialComplex\)/);
  assert.match(route, /\.onConflictDoNothing\([\s\S]*telegramWalkNotifications\.walkId[\s\S]*telegramWalkNotifications\.subscriptionId/);
  assert.match(scheduler, /walk\.residential_complex[\s\S]*subscription\.active = true/);
  assert.match(scheduler, /blocked by the user[\s\S]*user is deactivated/);
});
