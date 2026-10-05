import pg from "pg";
import { pathToFileURL } from "node:url";

const { Client } = pg;

// The project uses Europe/Moscow (UTC+3, no DST), independently of the host TZ.
const MOSCOW_OFFSET_MS = 3 * 60 * 60 * 1000;

export function telegramRetentionBoundary(now = new Date()) {
  const local = new Date(now.getTime() + MOSCOW_OFFSET_MS);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - 1) - MOSCOW_OFFSET_MS);
}

export function nextTelegramCleanupAt(now = new Date()) {
  const next = telegramRetentionBoundary(now);
  next.setUTCDate(next.getUTCDate() + 2);
  return next;
}

/** @param {import('pg').Client} client
 * @param {{message_id: number, date: number, chat: {id: number}}} message */
export async function recordTelegramMessage(client, message) {
  if (!Number.isSafeInteger(message?.message_id) || !Number.isSafeInteger(message?.date) ||
      !Number.isSafeInteger(message?.chat?.id)) throw new Error("Telegram не вернул идентификатор и дату сообщения.");
  await client.query(`
    INSERT INTO telegram_bot_messages (chat_id, message_id, sent_at)
    VALUES ($1, $2, $3) ON CONFLICT DO NOTHING
  `, [String(message.chat.id), message.message_id, new Date(message.date * 1000)]);
}

/** @param {import('pg').Client} client
 * @param {(method: string, body: {chat_id: string, message_id: number}) => Promise<unknown>} request */
export async function cleanupTelegramMessages(client, request, now = new Date()) {
  const boundary = telegramRetentionBoundary(now);
  let retryNeeded = false;
  // These are delivery queue records, not the walks or location requests themselves.
  await client.query("DELETE FROM telegram_walk_notifications WHERE created_at < $1", [boundary]);
  const { rows } = await client.query(`
    SELECT chat_id, message_id, sent_at FROM telegram_bot_messages
    WHERE sent_at < $1 ORDER BY sent_at
  `, [boundary]);
  for (const message of rows) {
    try {
      // https://core.telegram.org/bots/api#deletemessage: strictly less than 48h.
      if (now.getTime() - new Date(message.sent_at).getTime() >= 48 * 60 * 60 * 1000) {
        throw new Error("Сообщение старше 48 часов: Telegram запрещает удаление.");
      }
      const deleted = await request("deleteMessage", { chat_id: message.chat_id, message_id: message.message_id });
      if (deleted !== true) throw new Error("Telegram не подтвердил удаление.");
      await client.query("DELETE FROM telegram_bot_messages WHERE chat_id = $1 AND message_id = $2", [message.chat_id, message.message_id]);
    } catch (error) {
      if (now.getTime() - new Date(message.sent_at).getTime() < 48 * 60 * 60 * 1000) retryNeeded = true;
      // Keep only IDs/dates for failed deletions; never report these as deleted.
      console.error(`[telegram-cleanup] Не удалено сообщение ${message.chat_id}/${message.message_id}.`, error);
    }
  }
  return retryNeeded;
}


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
let messageCleanupTimer;
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
    const intentsResult = await client.query(`
      DELETE FROM telegram_subscription_intents
      WHERE expires_at < CURRENT_TIMESTAMP
    `);

    console.info(
      `[walk-cleanup] ${formatMoscowDateTime(new Date())}: удалено прогулок — ${walksResult.rowCount ?? 0}, истёкших сессий — ${sessionsResult.rowCount ?? 0}, истёкших ссылок Telegram — ${intentsResult.rowCount ?? 0}`
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

function telegramTokenConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  return token ? { token } : null;
}

function telegramCallbackConfiguration() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET?.trim();
  return token && secret ? { token, secret } : null;
}

function telegramUpdateHandlerUrl() {
  return process.env.TELEGRAM_UPDATE_HANDLER_URL?.trim() || "http://app:3000/api/telegram/webhook";
}

async function telegramBotRequest(token, method, body, timeoutMs = 5_000, client, trackingInTransaction = false) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok) {
    const error = new Error(payload.description || `Telegram API returned ${response.status}`);
    error.telegramStatus = response.status;
    throw error;
  }
  if (method === "sendMessage" && client) {
    try {
      if (trackingInTransaction) await client.query("SAVEPOINT telegram_message_tracking");
      await recordTelegramMessage(client, payload.result);
      if (trackingInTransaction) await client.query("RELEASE SAVEPOINT telegram_message_tracking");
    } catch (error) {
      if (trackingInTransaction) await client.query("ROLLBACK TO SAVEPOINT telegram_message_tracking").catch(() => undefined);
      console.error("[telegram] Сообщение отправлено, но не сохранено для очистки.", error);
    }
  }
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
        AND created_at >= $1
        AND created_at < CURRENT_TIMESTAMP - INTERVAL '1 minute'
      ORDER BY created_at ASC
    `, [telegramRetentionBoundary()]);
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
        }, 5_000, client);
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

function escapeTelegramHtml(value) {
  return String(value ?? "").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") || "—";
}

function walkScheduleLabel(notification) {
  if (notification.schedule_type === "always") return "каждый день";
  if (notification.schedule_type === "tomorrow") return "завтра";
  return "сегодня";
}

function walkNotificationMessage(notification) {
  return [
    `<tg-emoji emoji-id="5334974127574920185">🐕</tg-emoji> <b>Новая прогулка в ЖК «${escapeTelegramHtml(notification.residential_complex)}»</b>`,
    "",
    `🐕 <b>Кто гуляет:</b> ${escapeTelegramHtml(notification.pet_name)} · ${escapeTelegramHtml(notification.owner_name)}`,
    `📍 <b>Где:</b> ${escapeTelegramHtml(notification.place)}`,
    `🕒 <b>Во сколько:</b> ${escapeTelegramHtml(String(notification.walk_time).slice(0, 5))} · ${walkScheduleLabel(notification)}`,
    ...(notification.comment?.trim() ? [`💬 <b>Комментарий:</b> ${escapeTelegramHtml(notification.comment)}`] : [])
  ].join("\n");
}

function blockedByTelegram(error) {
  return error?.telegramStatus === 403 && /bot was blocked by the user|user is deactivated/i.test(String(error.message));
}

function notificationError(error) {
  return String(error instanceof Error ? error.message : error).slice(0, 250);
}

async function retryWalkTelegramNotifications() {
  const configuration = telegramTokenConfiguration();
  if (!configuration) {
    console.error("[walk-telegram-notifications] Не задан TELEGRAM_BOT_TOKEN.");
    return;
  }

  const client = new Client({ connectionString: connectionString(), connectionTimeoutMillis: 5000 });
  await client.connect();

  try {
    while (true) {
      await client.query("BEGIN");
      try {
        const { rows } = await client.query(`
          SELECT
            notification.id AS notification_id,
            subscription.id AS subscription_id,
            subscription.telegram_chat_id,
            walk.residential_complex,
            walk.place,
            walk.comment,
            walk.walk_time,
            walk.schedule_type,
            pet.name AS pet_name,
            pet.owner_name
          FROM telegram_walk_notifications AS notification
          INNER JOIN telegram_complex_subscriptions AS subscription ON subscription.id = notification.subscription_id
          INNER JOIN walks AS walk ON walk.id = notification.walk_id
          INNER JOIN pets AS pet ON pet.id = walk.pet_id
          WHERE notification.sent_at IS NULL
            AND notification.created_at >= $1
            AND notification.failed_at IS NULL
            AND notification.next_attempt_at <= CURRENT_TIMESTAMP
            AND subscription.active = true
            AND walk.notify_telegram = true
          ORDER BY notification.created_at ASC
          FOR UPDATE OF notification, subscription, walk SKIP LOCKED
          LIMIT 1
        `, [telegramRetentionBoundary()]);
        const notification = rows[0];
        if (!notification) {
          await client.query("COMMIT");
          return;
        }

        try {
          await telegramBotRequest(configuration.token, "sendMessage", {
            chat_id: notification.telegram_chat_id,
            text: walkNotificationMessage(notification),
            parse_mode: "HTML"
          }, 5_000, client, true);
          await client.query(`
            UPDATE telegram_walk_notifications
            SET sent_at = CURRENT_TIMESTAMP, last_error = NULL
            WHERE id = $1
          `, [notification.notification_id]);
          console.info(`[walk-telegram-notifications] Прогулка ${notification.notification_id} отправлена в Telegram.`);
        } catch (error) {
          if (blockedByTelegram(error)) {
            await client.query(`
              UPDATE telegram_complex_subscriptions
              SET active = false, deactivated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [notification.subscription_id]);
            await client.query(`
              UPDATE telegram_walk_notifications
              SET failed_at = CURRENT_TIMESTAMP, last_error = $2
              WHERE id = $1
            `, [notification.notification_id, notificationError(error)]);
            console.info(`[walk-telegram-notifications] Подписка ${notification.subscription_id} отключена: бот заблокирован.`);
          } else {
            await client.query(`
              UPDATE telegram_walk_notifications
              SET attempt_count = attempt_count + 1,
                  next_attempt_at = CURRENT_TIMESTAMP + INTERVAL '1 minute',
                  last_error = $2
              WHERE id = $1
            `, [notification.notification_id, notificationError(error)]);
            console.error(`[walk-telegram-notifications] Не удалось отправить уведомление ${notification.notification_id}.`, error);
          }
        }
        await client.query("COMMIT");
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
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
    allowed_updates: ["callback_query", "message"]
  }, 55_000);
  if (!Array.isArray(updates)) return;

  for (const update of updates) {
    const updateId = update?.update_id;
    if (!Number.isSafeInteger(updateId)) continue;
    const response = await fetch(telegramUpdateHandlerUrl(), {
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
  }
  try {
    await retryWalkTelegramNotifications();
  } catch (error) {
    console.error("[walk-telegram-notifications] Не удалось обработать повторные отправки.", error);
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

async function runMessageCleanup() {
  let delay = RETRY_DELAY_MS;
  const client = new Client({ connectionString: process.env.DATABASE_URL?.trim(), connectionTimeoutMillis: 5000 });
  try {
    const now = new Date();
    await client.connect();
    const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const retryNeeded = await cleanupTelegramMessages(client, async (method, body) => {
      if (!token) throw new Error("Не задан TELEGRAM_BOT_TOKEN.");
      return telegramBotRequest(token, method, body);
    }, now);
    if (!retryNeeded) delay = nextTelegramCleanupAt().getTime() - Date.now();
  } catch (error) {
    console.error("[telegram-cleanup] Очистка не выполнена. Повтор через 5 минут.", error);
  } finally {
    await client.end().catch((error) => console.error("[telegram-cleanup] Не удалось закрыть соединение.", error));
    messageCleanupTimer = setTimeout(runMessageCleanup, Math.max(1, delay));
  }
}

function shutdown(signal) {
  if (timer) clearTimeout(timer);
  if (notificationTimer) clearTimeout(notificationTimer);
  if (callbackTimer) clearTimeout(callbackTimer);
  if (messageCleanupTimer) clearTimeout(messageCleanupTimer);
  console.info(`[walk-cleanup] Получен ${signal}, планировщик остановлен.`);
  process.exit(0);
}

// Importing retention helpers from the app must not start the scheduler.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
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
    void runMessageCleanup();
    void runNotificationRetry();
    void runTelegramCallbackPolling();
  }
}
