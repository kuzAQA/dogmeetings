import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isTelegramWebhookRequest, sendTelegramLocationRequestNotification, telegramWalkChangeMessage } from "./telegram.ts";

const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
const originalWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

function restoreEnvironment() {
  if (originalToken) process.env.TELEGRAM_BOT_TOKEN = originalToken;
  else delete process.env.TELEGRAM_BOT_TOKEN;
  if (originalChatId) process.env.TELEGRAM_ADMIN_CHAT_ID = originalChatId;
  else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (originalWebhookSecret) process.env.TELEGRAM_WEBHOOK_SECRET = originalWebhookSecret;
  else delete process.env.TELEGRAM_WEBHOOK_SECRET;
}

test.afterEach(restoreEnvironment);

test("walk edit message includes the full walk card and escapes Telegram HTML", () => {
  const previous = {
    petId: "old-pet", petName: "Шарик <&>", ownerName: "Иван", residentialComplex: "Старый ЖК", place: "Старое <место>",
    walkTime: "18:00:00", walkDate: "2026-09-30", scheduleType: "today"
  };
  const current = {
    petId: "new-pet", petName: "Рекс & друзья", ownerName: "Мария", residentialComplex: "Новый ЖК", place: "Новое место",
    walkTime: "19:00:00", walkDate: "2026-10-01", scheduleType: "tomorrow"
  };

  assert.equal(telegramWalkChangeMessage(previous, current), [
    "🐾 <b>Прогулка изменена в ЖК «<s>Старый ЖК</s> → Новый ЖК»</b>",
    "",
    "🐕 <b>Кто гуляет:</b> <s>Шарик &lt;&amp;&gt; · Иван</s> → Рекс &amp; друзья · Мария",
    "📍 <b>Где:</b> <s>Старое &lt;место&gt;</s> → Новое место",
    "🕒 <b>Во сколько:</b> <s>18:00 · сегодня</s> → 19:00 · завтра"
  ].join("\n"));
  assert.equal(telegramWalkChangeMessage(previous, { ...previous, place: "Новый парк" }),
    "🐾 <b>Прогулка изменена в ЖК «Старый ЖК»</b>\n\n🐕 <b>Кто гуляет:</b> Шарик &lt;&amp;&gt; · Иван\n📍 <b>Где:</b> <s>Старое &lt;место&gt;</s> → Новый парк\n🕒 <b>Во сколько:</b> 18:00 · сегодня");
  assert.equal(telegramWalkChangeMessage(previous, { ...previous, walkDate: "2026-10-01" }),
    "🐾 <b>Прогулка изменена в ЖК «Старый ЖК»</b>\n\n🐕 <b>Кто гуляет:</b> Шарик &lt;&amp;&gt; · Иван\n📍 <b>Где:</b> Старое &lt;место&gt;\n🕒 <b>Во сколько:</b> <s>18:00 · сегодня (30.09.2026)</s> → 18:00 · сегодня (01.10.2026)");
  assert.equal(telegramWalkChangeMessage(previous, previous), null);
  assert.equal(telegramWalkChangeMessage({ ...previous, scheduleType: "always" },
    { ...previous, scheduleType: "always", walkDate: "2026-10-01" }), null);
});

test("new walk message includes only nonblank saved comments and escapes Telegram HTML", async () => {
  const scheduler = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
  // Execute the scheduler's actual formatters without starting its database jobs or timers.
  const message = runInNewContext(
    scheduler.slice(scheduler.indexOf("function escapeTelegramHtml("), scheduler.indexOf("function blockedByTelegram(")) + "\nwalkNotificationMessage"
  );
  const notification = {
    residential_complex: "ЖК <&>", pet_name: "Шарик", owner_name: "Иван", place: "Парк",
    walk_time: "18:00:00", schedule_type: "today"
  };
  const base = [
    "🐾 <b>Новая прогулка в ЖК «ЖК &lt;&amp;&gt;»</b>",
    "",
    "🐕 <b>Кто гуляет:</b> Шарик · Иван",
    "📍 <b>Где:</b> Парк",
    "🕒 <b>Во сколько:</b> 18:00 · сегодня"
  ].join("\n");

  for (const comment of [null, undefined, "", " \n\t "]) {
    assert.equal(message({ ...notification, comment }), base);
  }
  assert.equal(message({ ...notification, comment: '  <b>Мяч</b> & "вода"\n\'рядом\' >  ' }),
    base + '\n💬 <b>Комментарий:</b> &lt;b&gt;Мяч&lt;/b&gt; &amp; "вода"\n\'рядом\' &gt;');
  assert.equal(message({ ...notification, comment: "Новый текст" }), base + "\n💬 <b>Комментарий:</b> Новый текст");
  assert.match(scheduler, /walk\.place,\s+walk\.comment,\s+walk\.walk_time/);
});

test("walk edit message uses the saved current comment without changing send conditions", async () => {
  const previous = {
    petId: "pet-1", petName: "Шарик", ownerName: "Иван", residentialComplex: "ЖК", place: "Парк",
    comment: "Старый текст", walkTime: "18:00:00", walkDate: "2026-10-03", scheduleType: "today"
  };
  const current = { ...previous, place: "Новый парк", comment: null as string | null | undefined };
  const base = telegramWalkChangeMessage(previous, current);
  assert.equal(typeof base, "string");

  for (const comment of [null, undefined, "", " \n\t "]) {
    assert.equal(telegramWalkChangeMessage(previous, { ...current, comment }), base);
    assert.equal(telegramWalkChangeMessage(previous, { ...previous, comment }), null);
  }
  assert.equal(telegramWalkChangeMessage(previous, { ...current, comment: '  <b>Мяч</b> & "вода"\n\'рядом\' >  ' }),
    base + '\n💬 <b>Комментарий:</b> &lt;b&gt;Мяч&lt;/b&gt; &amp; "вода"\n\'рядом\' &gt;');
  assert.equal(telegramWalkChangeMessage(previous, { ...current, comment: "Новый текст" }),
    base + "\n💬 <b>Комментарий:</b> Новый текст");
  assert.equal(telegramWalkChangeMessage(previous, { ...current, comment: previous.comment }),
    base + "\n💬 <b>Комментарий:</b> Старый текст");
  assert.equal(telegramWalkChangeMessage(previous, { ...previous, comment: "Новый текст" }), null);

  const route = await readFile(new URL("../app/api/walks/route.ts", import.meta.url), "utf8");
  assert.match(route, /telegramWalkChangeMessage\(result\.previous, \{[\s\S]*?comment: result\.walk\.comment,/);
});

test("location request uses Telegram instead of admin push", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "123";
  let request: Request | undefined;

  const sent = await sendTelegramLocationRequestNotification({
    id: "request-1",
    city: "Москва",
    district: "Коммунарка",
    residentialComplex: "Скандинавия"
  }, async (input, init) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  });

  assert.equal(sent, true);
  assert.equal(request?.url, "https://api.telegram.org/bottest-token/sendMessage");
  assert.deepEqual(await request?.json(), {
    chat_id: "123",
    text: "🆕 Новая заявка на локацию\n\n🏙 <b>Город:</b> Москва\n📍 <b>Район:</b> Коммунарка\n🏢 <b>Жилой комплекс:</b> Скандинавия\n\n🔗 Панель: <a href=\"https://dogmeet.ru/dogsfather\">https://dogmeet.ru/dogsfather</a>",
    parse_mode: "HTML",
    reply_markup: {
      inline_keyboard: [[
        { text: "✅ Одобрить", callback_data: "location-request:approve:request-1" },
        { text: "❌ Отклонить", callback_data: "location-request:reject:request-1" }
      ]]
    }
  });
  const route = await readFile(new URL("../app/api/location-requests/route.ts", import.meta.url), "utf8");
  assert.match(route, /sendTelegramLocationRequestNotification/);
  assert.match(route, /if \(telegramNotified\)[\s\S]*set\(\{ telegramNotified: true \}\)/);
  assert.doesNotMatch(route, /admin-push|sendAdminLocationRequestNotification/);
  const webhookRoute = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhookRoute, /telegramBotRequest\("deleteMessage", \{[\s\S]*chat_id: chatId/);
  assert.doesNotMatch(webhookRoute, /editMessageText/);
  const scheduler = await readFile(new URL("../scripts/cleanup-expired-walks.mjs", import.meta.url), "utf8");
  assert.match(scheduler, /telegramBotRequest\(configuration\.token, "deleteWebhook"/);
  assert.match(scheduler, /telegramBotRequest\(configuration\.token, "getUpdates"/);
  assert.match(scheduler, /http:\/\/app:3000\/api\/telegram\/webhook/);
});

test("Telegram callback authorizes approve and reject without a web session", async () => {
  process.env.TELEGRAM_WEBHOOK_SECRET = "a".repeat(32);
  const id = "123e4567-e89b-42d3-a456-426614174000";

  for (const method of ["PATCH", "DELETE"]) {
    const callbackRequest: Request = new Request("https://dogmeet.ru/api/dogsfather/location-requests", {
      method,
      headers: { "x-telegram-bot-api-secret-token": process.env.TELEGRAM_WEBHOOK_SECRET },
      body: JSON.stringify({ id })
    });
    assert.equal(isTelegramWebhookRequest(callbackRequest), true);
  }

  const route = await readFile(new URL("../app/api/dogsfather/location-requests/route.ts", import.meta.url), "utf8");
  assert.match(route, /authorizeAdminRequest\(request, true, true\)/);
  assert.match(route, /export async function PATCH[\s\S]*\.insert\(locations\)[\s\S]*\.delete\(locationRequests\)/);
  assert.match(route, /export async function DELETE[\s\S]*\.delete\(locationRequests\)/);
  const webhookRoute = await readFile(new URL("../app/api/telegram/webhook/route.ts", import.meta.url), "utf8");
  assert.match(webhookRoute, /"x-telegram-bot-api-secret-token": request\.headers\.get/);
  assert.match(webhookRoute, /action === "approve" \? await PATCH\(adminRequest\) : await DELETE\(adminRequest\)/);
  assert.match(webhookRoute, /"✅ Заявка одобрена" : "❌ Заявка отклонена"/);
  assert.doesNotMatch(webhookRoute, /createAdminSessionCookie|revokeAdminSession/);
});

test("Telegram API rejection does not throw", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "123";
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const sent = await sendTelegramLocationRequestNotification({
      id: "request-1",
      city: "Москва",
      district: "Коммунарка",
      residentialComplex: "Скандинавия"
    }, async () => Response.json({ ok: false, description: "chat not found" }));
    assert.equal(sent, false);
  } finally {
    console.error = originalError;
  }
});

test("Telegram notification tolerates missing location fields", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "123";
  let request: Request | undefined;

  await sendTelegramLocationRequestNotification({ id: "request-1", city: null }, async (input, init) => {
    request = new Request(input, init);
    return Response.json({ ok: true });
  });

  const body = await request?.json() as { text?: unknown };
  assert.match(String(body?.text), /Город:<\/b> —/);
  assert.match(String(body?.text), /Район:<\/b> —/);
  assert.match(String(body?.text), /Жилой комплекс:<\/b> —/);
});
