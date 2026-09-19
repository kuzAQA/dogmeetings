import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sendTelegramLocationRequestNotification } from "./telegram.ts";

const originalToken = process.env.TELEGRAM_BOT_TOKEN;
const originalChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

function restoreEnvironment() {
  if (originalToken) process.env.TELEGRAM_BOT_TOKEN = originalToken;
  else delete process.env.TELEGRAM_BOT_TOKEN;
  if (originalChatId) process.env.TELEGRAM_ADMIN_CHAT_ID = originalChatId;
  else delete process.env.TELEGRAM_ADMIN_CHAT_ID;
}

test.afterEach(restoreEnvironment);

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
