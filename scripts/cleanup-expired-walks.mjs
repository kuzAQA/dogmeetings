import pg from "pg";

const { Client } = pg;

const MOSCOW_TIME_ZONE = "Europe/Moscow";
const MOSCOW_RUN_HOUR = 6;
const MOSCOW_RUN_UTC_HOUR = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000;
const NOTIFICATION_RETRY_DELAY_MS = 60 * 1000;
const CALLBACK_POLL_RETRY_DELAY_MS = 1_000;
const runOnce = process.argv.includes("--run-once");

let timer;
let notificationTimer;
let callbackTimer;
let telegramUpdateOffset = 0;
let telegramCallbackPollingReady = false;

function connectionString() {
  const value = process.env.DATABASE_URL?.trim();

  if (!value) {
    throw new Error("Не задана строка подключения DATABASE_URL.");
  }

  return value;
}

function nextRunAt(now = new Date()) {
  const next = new Date(now);
  next.setUTCHours(MOSCOW_RUN_UTC_HOUR, 0, 0, 0);

  if (next <= now) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function hasPassedRunTimeToday(now = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: MOSCOW_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23"
  }).format(now));

  return hour >= MOSCOW_RUN_HOUR;
}

function formatMoscowDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: MOSCOW_TIME_ZONE,
    dateStyle: "short",
    timeStyle: "medium"
  }).format(value);
}

async function cleanupExpiredData() {
  const client = new Client({
    connectionString: connectionString(),
    connectionTimeoutMillis: 5000
  });

  await client.connect();

  try {
    const walksResult = await client.query(`
      DELETE FROM walks
      WHERE walk_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Moscow')::date
        AND schedule_type IN ('today', 'tomorrow')
    `);
    const sessionsResult = await client.query(`
      DELETE FROM client_sessions
      WHERE expires_at < CURRENT_TIMESTAMP
    `);

    console.info(
      `[walk-cleanup] ${formatMoscowDateTime(new Date())}: удалено прогулок — ${walksResult.rowCount ?? 0}, истёкших сессий — ${sessionsResult.rowCount ?? 0}`
    );
  } finally {
    await client.end();
  }
}

function telegramConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();
  return token && chatId ? { token, chatId } : null;
}

function telegramCallbackConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return token && secret ? { token, secret } : null;
}

async function telegramBotRequest(token, method, body, timeoutMs = 5_000) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.description || `Telegram API returned ${response.status}`);
  return payload.result;
}

function locationValue(value) {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? trimmed.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") : "—";
}

function locationRequestMessage(request) {
  return [
    "🆕 Новая заявка на локацию",
    "",
    `🏙 <b>Город:</b> ${locationValue(request.city)}`,
    `📍 <b>Район:</b> ${locationValue(request.district)}`,
    `🏢 <b>Жилой комплекс:</b> ${locationValue(request.residential_complex)}`,
    "",
    "🔗 Панель: <a href=\"https://dogmeet.ru/dogsfather\">https://dogmeet.ru/dogsfather</a>"
  ].join("\n");
}

async function retryLocationRequestNotifications() {
  const configuration = telegramConfiguration();
  if (!configuration) {
    console.error("[location-request-notifications] Не заданы TELEGRAM_BOT_TOKEN или TELEGRAM_ADMIN_CHAT_ID.");
    return;
  }

  const client = new Client({ connectionString: connectionString(), connectionTimeoutMillis: 5000 });
  await client.connect();

  try {
    const { rows } = await client.query(`
      SELECT id, city, district, residential_complex
      FROM location_requests
      WHERE telegram_notified = false
        AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 minute'
      ORDER BY created_at ASC
    `);
    for (const request of rows) {
      try {
        await telegramBotRequest(configuration.token, "sendMessage", {
          chat_id: configuration.chatId,
          text: locationRequestMessage(request),
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[
              { text: "✅ Одобрить", callback_data: `location-request:approve:${request.id}` },
              { text: "❌ Отклонить", callback_data: `location-request:reject:${request.id}` }
            ]]
          }
        });
        await client.query("UPDATE location_requests SET telegram_notified = true WHERE id = $1", [request.id]);
        console.info(`[location-request-notifications] Заявка ${request.id} отправлена в Telegram.`);
      } catch (error) {
        console.error(`[location-request-notifications] Не удалось отправить заявку ${request.id}.`, error);
      }
    }
  } finally {
    await client.end();
  }
}

async function pollTelegramCallbacks() {
  const configuration = telegramCallbackConfiguration();
  if (!configuration) return;

  if (!telegramCallbackPollingReady) {
    await telegramBotRequest(configuration.token, "deleteWebhook", { drop_pending_updates: false });
    telegramCallbackPollingReady = true;
  }

  const updates = await telegramBotRequest(configuration.token, "getUpdates", {
    offset: telegramUpdateOffset,
    timeout: 50,
    allowed_updates: ["callback_query"]
  }, 55_000);
  if (!Array.isArray(updates)) return;

  for (const update of updates) {
    const updateId = update?.update_id;
    if (!Number.isSafeInteger(updateId)) continue;
    const response = await fetch("http://app:3000/api/telegram/webhook", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-telegram-bot-api-secret-token": configuration.secret
      },
      body: JSON.stringify(update),
      signal: AbortSignal.timeout(5_000)
    });
    if (!response.ok) throw new Error(`Callback handler returned ${response.status}`);
    telegramUpdateOffset = updateId + 1;
  }
}

function scheduleNextRun() {
  const next = nextRunAt();
  const delay = next.getTime() - Date.now();

  console.info(`[walk-cleanup] Следующий запуск: ${formatMoscowDateTime(next)}`);
  timer = setTimeout(runAndSchedule, delay);
}

async function runAndSchedule() {
  try {
    await cleanupExpiredData();
    scheduleNextRun();
  } catch (error) {
    console.error("[walk-cleanup] Не удалось удалить устаревшие прогулки. Повтор через 5 минут.", error);
    timer = setTimeout(runAndSchedule, RETRY_DELAY_MS);
  }
}

async function runNotificationRetry() {
  try {
    await retryLocationRequestNotifications();
  } catch (error) {
    console.error("[location-request-notifications] Не удалось обработать повторные отправки.", error);
  } finally {
    notificationTimer = setTimeout(runNotificationRetry, NOTIFICATION_RETRY_DELAY_MS);
  }
}

async function runTelegramCallbackPolling() {
  try {
    await pollTelegramCallbacks();
  } catch (error) {
    console.error("[telegram-callbacks] Не удалось получить callback из Telegram.", error);
  } finally {
    callbackTimer = setTimeout(runTelegramCallbackPolling, CALLBACK_POLL_RETRY_DELAY_MS);
  }
}

function shutdown(signal) {
  if (timer) clearTimeout(timer);
  if (notificationTimer) clearTimeout(notificationTimer);
  if (callbackTimer) clearTimeout(callbackTimer);
  console.info(`[walk-cleanup] Получен ${signal}, планировщик остановлен.`);
  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

if (runOnce) {
  cleanupExpiredData().catch((error) => {
    console.error("[walk-cleanup] Не удалось удалить устаревшие прогулки.", error);
    process.exitCode = 1;
  });
} else if (hasPassedRunTimeToday()) {
  runAndSchedule();
} else {
  scheduleNextRun();
}

if (!runOnce) {
  void runNotificationRetry();
  void runTelegramCallbackPolling();
}
