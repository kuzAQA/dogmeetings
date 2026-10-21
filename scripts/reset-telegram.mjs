import pg from "pg";
import { pathToFileURL } from "node:url";
import { telegramReconnectCampaignId } from "../lib/announcement-types.ts";
import { requestTelegramApi } from "../server/telegram-api.mjs";

export async function resetTelegramSubscriptions(client) {
  await client.query("BEGIN");
  try {
    await client.query(`LOCK TABLE telegram_chat_settings, telegram_complex_subscriptions,
      telegram_subscription_intents, telegram_walk_notifications IN ACCESS EXCLUSIVE MODE`);
    const marker = await client.query(`INSERT INTO announcement_campaigns (id, status, permanent, pages)
      VALUES ($1, 'disabled', false, $2::jsonb) ON CONFLICT DO NOTHING RETURNING id`, [telegramReconnectCampaignId, JSON.stringify([{
      title: "Подключите уведомления заново",
      text: "Мы обновили настройки Telegram. Нажмите Telegram в нижнем меню сайта и подтвердите подключение в боте, чтобы получать уведомления о прогулках и новых сообщениях в Диалогах.",
      example: "telegram-dock"
    }])]);
    if (!marker.rowCount) throw new Error("Сброс этой кампании уже выполнен; повтор запрещён.");
    const counts = {};
    for (const [name, table] of [
      ["queuedNotifications", "telegram_walk_notifications"],
      ["intents", "telegram_subscription_intents"],
      ["messageBindings", "telegram_chat_settings"],
      ["walkSubscriptions", "telegram_complex_subscriptions"]
    ]) counts[name] = (await client.query(`DELETE FROM ${table}`)).rowCount;
    await client.query("COMMIT");
    return counts;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

export async function deleteTrackedTelegramHistory(client, request, now = new Date()) {
  const { rows } = await client.query("SELECT chat_id, message_id, sent_at FROM telegram_bot_messages ORDER BY chat_id, message_id");
  const report = { tracked: rows.length, deleted: 0, alreadyAbsent: 0, tooOld: 0, failed: 0, remainingTracked: 0 };
  for (const message of rows) {
    if (+now - +new Date(message.sent_at) >= 48 * 3600_000) {
      report.tooOld++;
      continue;
    }
    try {
      let absent = false;
      try {
        if (await request("deleteMessage", { chat_id: message.chat_id, message_id: message.message_id }) !== true) {
          throw new Error("Telegram не подтвердил удаление.");
        }
      } catch (error) {
        if (!/message to delete not found$/i.test(String(error.message))) throw error;
        absent = true;
      }
      if (absent) report.alreadyAbsent++;
      else report.deleted++;
      await client.query("DELETE FROM telegram_bot_messages WHERE chat_id=$1 AND message_id=$2", [message.chat_id, message.message_id]);
    } catch {
      report.failed++;
    }
  }
  report.remainingTracked = (await client.query("SELECT count(*)::int AS count FROM telegram_bot_messages")).rows[0].count;
  return report;
}

export async function activateTelegramReconnectCampaign(client) {
  await client.query(`UPDATE announcement_campaigns SET status='active', starts_at=CURRENT_TIMESTAMP,
    ends_at=CURRENT_TIMESTAMP + interval '48 hours'
    WHERE id=$1 AND status='disabled' AND starts_at IS NULL AND ends_at IS NULL`, [telegramReconnectCampaignId]);
  const { rows } = await client.query(`SELECT starts_at AS "startsAt", ends_at AS "endsAt"
    FROM announcement_campaigns WHERE id=$1`, [telegramReconnectCampaignId]);
  if (!rows[0]?.startsAt || !rows[0]?.endsAt) throw new Error("Сначала выполните сброс Telegram.");
  return rows[0];
}

async function main() {
  const mode = process.argv[2];
  if (!["--inspect", "--reset", "--cleanup", "--activate"].includes(mode) || process.argv.length !== 3) {
    throw new Error("Режим: --inspect, --reset, --cleanup или --activate. Перед --reset остановите app и scheduler и сохраните резервную копию.");
  }
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!process.env.DATABASE_URL || !token) throw new Error("Не заданы DATABASE_URL и TELEGRAM_BOT_TOKEN.");
  const request = (method, body = {}) => requestTelegramApi(token, method, body);
  const bot = await request("getMe");
  const webhook = await request("getWebhookInfo");
  console.log(JSON.stringify({ bot: bot.username, updates: webhook.url ? "webhook" : "polling", pendingUpdates: webhook.pending_update_count }));
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 5000 });
  await client.connect();
  try {
    if (mode === "--inspect") {
      for (const table of ["telegram_complex_subscriptions", "telegram_chat_settings", "telegram_subscription_intents", "telegram_walk_notifications", "telegram_bot_messages"]) {
        console.log(JSON.stringify({ table, count: (await client.query(`SELECT count(*)::int AS count FROM ${table}`)).rows[0].count }));
      }
    } else if (mode === "--activate") {
      const health = await fetch("http://127.0.0.1:3000/api/health", { signal: AbortSignal.timeout(5000) });
      if (!health.ok) throw new Error("Приложение ещё не готово к включению кампании.");
      const dates = await activateTelegramReconnectCampaign(client);
      console.log(JSON.stringify({ campaign: telegramReconnectCampaignId, ...dates,
        endsAtMoscow: new Date(dates.endsAt).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", hour12: false }) }));
    } else {
      if (mode === "--reset") console.log(JSON.stringify({ reset: await resetTelegramSubscriptions(client) }));
      console.log(JSON.stringify({ history: await deleteTrackedTelegramHistory(client, request), untrackedHistory: "unknown" }));
    }
  } finally {
    await client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => {
    console.error("Операция Telegram не завершена. Проверьте режим, доступность БД/Telegram, резервную копию и состояние кампании; секреты скрыты.");
    process.exitCode = 1;
  });
}
