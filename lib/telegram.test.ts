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
    clientId: "client-1",
    city: "Москва",
    district: "Коммунарка",
    residentialComplex: "Скандинавия"
  }, async (input, init) => {
    request = new Request(input, init);
    return new Response(null, { status: 200 });
  });

  assert.equal(sent, true);
  assert.equal(request?.url, "https://api.telegram.org/bottest-token/sendMessage");
  assert.deepEqual(await request?.json(), {
    chat_id: "123",
    text: "Новая заявка на локацию\nЛокация: Скандинавия\nАдрес: Москва, Коммунарка\nАвтор: client-1\nID заявки: request-1\nПанель: https://dogmeet.ru/dogsfather"
  });
  const route = await readFile(new URL("../app/api/location-requests/route.ts", import.meta.url), "utf8");
  assert.match(route, /sendTelegramLocationRequestNotification/);
  assert.doesNotMatch(route, /admin-push|sendAdminLocationRequestNotification/);
});

test("Telegram failure does not throw", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "test-token";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "123";
  const originalError = console.error;
  console.error = () => undefined;
  try {
    const sent = await sendTelegramLocationRequestNotification({
      id: "request-1",
      clientId: "client-1",
      city: "Москва",
      district: "Коммунарка",
      residentialComplex: "Скандинавия"
    }, async () => { throw new Error("network unavailable"); });
    assert.equal(sent, false);
  } finally {
    console.error = originalError;
  }
});
