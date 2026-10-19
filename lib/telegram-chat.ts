import { withDb } from "../db";
import { telegramBotRequest } from "./telegram";

export async function telegramChatSettings(clientId: string) {
  return withDb(async db => {
    const { rows } = await db.$client.query<{ enabled: boolean; subscribed: boolean }>(`
      SELECT n.enabled, EXISTS (
        SELECT 1 FROM telegram_complex_subscriptions s WHERE s.telegram_chat_id = n.telegram_chat_id AND s.active
      ) AS subscribed FROM telegram_chat_settings n WHERE n.client_id = $1`, [clientId]);
    return rows[0] ?? { enabled: false, subscribed: false };
  });
}

export async function setTelegramChatEnabled(clientId: string, enabled: boolean) {
  return withDb(async db => {
    const { rows } = await db.$client.query(`
      UPDATE telegram_chat_settings n SET enabled = $2 WHERE n.client_id = $1
      AND (NOT $2 OR EXISTS (SELECT 1 FROM telegram_complex_subscriptions s
        WHERE s.telegram_chat_id = n.telegram_chat_id AND s.active)) RETURNING client_id`, [clientId, enabled]);
    if (enabled && !rows.length) throw new Error("Сначала подтвердите подписку на прогулки ЖК в Telegram-боте.");
  });
}

export async function notifyTelegramChatMessage(senderId: string, dialogId: string) {
  try {
    const { rows } = await withDb(db => db.$client.query<{ chat_id: string; sender_name: string }>(`
      SELECT n.telegram_chat_id AS chat_id, COALESCE((
        SELECT p.name || ' • ' || p.owner_name FROM pets p WHERE p.client_id = $1
        ORDER BY (p.id = CASE WHEN d.client_low = $1 THEN d.low_pet_id ELSE d.high_pet_id END) DESC NULLS LAST,
          p.created_at, p.id LIMIT 1
      ), 'Собеседник') AS sender_name
      FROM dialogs d JOIN telegram_chat_settings n
        ON n.client_id = CASE WHEN d.client_low = $1 THEN d.client_high ELSE d.client_low END
      WHERE d.id = $2 AND $1 IN (d.client_low, d.client_high) AND n.client_id <> $1 AND n.enabled
        AND NOT EXISTS (SELECT 1 FROM telegram_chat_settings own
          WHERE own.client_id = $1 AND own.telegram_chat_id = n.telegram_chat_id)
        AND EXISTS (SELECT 1 FROM telegram_complex_subscriptions s
          WHERE s.telegram_chat_id = n.telegram_chat_id AND s.active)`, [senderId, dialogId]));
    for (const row of rows) {
      await telegramBotRequest("sendMessage", { chat_id: row.chat_id, text: `Новое сообщение от ${row.sender_name}.` });
    }
  } catch {
    // A notification failure must not turn a committed message into a failed send.
    console.error("[telegram] Не удалось отправить уведомление о новом сообщении.");
  }
}
