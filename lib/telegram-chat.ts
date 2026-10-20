import { withDb } from "../db";
import { telegramBotRequest } from "./telegram";

export async function telegramChatSettings(clientId: string) {
  return withDb(async db => {
    const { rows } = await db.$client.query<{ enabled: boolean }>(
      "SELECT enabled FROM telegram_chat_settings WHERE client_id = $1", [clientId]);
    const enabled = rows[0]?.enabled === true;
    return { enabled, subscribed: enabled, status: rows.length ? enabled ? "active" as const : "inactive" as const : "unknown" as const };
  });
}

export async function notifyTelegramChatMessage(senderId: string, dialogId: string) {
  try {
    const { rows } = await withDb(db => db.$client.query<{ chat_id: string; owner_name: string | null; pet_name: string | null }>(`
      SELECT n.telegram_chat_id AS chat_id, sender.owner_name, sender.name AS pet_name
      FROM dialogs d JOIN telegram_chat_settings n
        ON n.client_id = CASE WHEN d.client_low = $1 THEN d.client_high ELSE d.client_low END
      LEFT JOIN LATERAL (
        SELECT p.name, p.owner_name FROM pets p WHERE p.client_id = $1
        ORDER BY (p.id = CASE WHEN d.client_low = $1 THEN d.low_pet_id ELSE d.high_pet_id END) DESC NULLS LAST,
          p.created_at, p.id LIMIT 1
      ) sender ON true
      WHERE d.id = $2 AND $1 IN (d.client_low, d.client_high) AND n.client_id <> $1 AND n.enabled
        AND NOT EXISTS (SELECT 1 FROM telegram_chat_settings own
          WHERE own.client_id = $1 AND own.telegram_chat_id = n.telegram_chat_id)`, [senderId, dialogId]));
    for (const row of rows) {
      const text = ["✉️ Вам пришло новое сообщение!"];
      for (const [label, value] of [["От", row.owner_name], ["Питомец", row.pet_name]]) {
        const name = value?.trim();
        if (name) text.push(`${label}: <b>${name.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</b>`);
      }
      await telegramBotRequest("sendMessage", {
        chat_id: row.chat_id,
        text: text.join("\n"),
        parse_mode: "HTML",
        reply_markup: { inline_keyboard: [[{ text: "Открыть", url: `https://dogmeet.ru/?dialog=${encodeURIComponent(dialogId)}` }]] }
      });
    }
  } catch {
    // A notification failure must not turn a committed message into a failed send.
    console.error("[telegram] Не удалось отправить уведомление о новом сообщении.");
  }
}
