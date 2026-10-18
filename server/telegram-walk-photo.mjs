import { loadSharp } from "./pet-photo.mjs";
import { deferTelegramMessageDeletion } from "./telegram-walk-deletion.mjs";
import { MAX_PET_PHOTO_PIXELS } from "./domain/pet-photo-limits.mjs";

/** @param {{text: string, [key: string]: unknown}} body
 * @param {() => Promise<Buffer | null | undefined>} getPhoto
 * @param {(method: string, body: any) => Promise<any>} request */
export async function sendTelegramWalkNotification(body, getPhoto, request) {
  let photo;
  try {
    const input = await getPhoto();
    if (input?.length) {
      const sharp = await loadSharp();
      // macOS captions expand photos to 320px; 325×250 preserves 13:10 above that width.
      photo = await sharp(input, { limitInputPixels: MAX_PET_PHOTO_PIXELS })
        .rotate().resize(325, 250, { fit: "cover", position: "centre" }).jpeg().toBuffer();
    }
  } catch (error) {
    console.error("[telegram] Не удалось подготовить фото прогулки.", error);
  }
  if (!photo) return request("sendMessage", body);

  const captionLength = body.text.replace(/<[^>]*>/g, "")
    .replace(/&(?:amp|lt|gt|quot);|&#(?:\d+|x[\da-f]+);/gi, "_").length;
  const longText = captionLength > 1024;
  // A walk notification must remain a single Telegram message.
  if (longText) return request("sendMessage", body);
  try {
    const form = new FormData();
    for (const [key, value] of Object.entries(body)) {
      if (key === "text") {
        form.set("caption", value);
      } else {
        form.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
      }
    }
    form.set("photo", new Blob([new Uint8Array(photo)], { type: "image/jpeg" }), "walk.jpg");
    const sent = await request("sendPhoto", form);
    if (sent !== false) return sent;
  } catch (error) {
    console.error("[telegram] Не удалось отправить фото прогулки.", error);
  }
  return request("sendMessage", body);
}

/** Callers use a tracking transaction without holding walk locks during Telegram I/O.
 * @param {import('pg').Client} client
 * @param {string} walkId
 * @param {{text: string, chat_id: string, [key: string]: unknown}} body
 * @param {() => Promise<Buffer | null | undefined>} getPhoto
 * @param {(method: string, body: any) => Promise<any>} request */
export async function replaceTelegramWalkNotification(client, walkId, body, getPhoto, request) {
  const { rows: previous } = await client.query(`
    SELECT message_id, sent_at, delete_next_attempt_at FROM telegram_bot_messages
    WHERE walk_id = $1 AND chat_id = $2
  `, [walkId, String(body.chat_id)]);
  const message = await sendTelegramWalkNotification(body, getPhoto, request);
  if (message === false) return false;
  if (!Number.isSafeInteger(message?.message_id) || !Number.isSafeInteger(message?.date) ||
      String(message?.chat?.id) !== String(body.chat_id)) {
    throw new Error("Telegram не вернул идентификатор и дату сообщения прогулки.");
  }
  await client.query(`
    INSERT INTO telegram_bot_messages (chat_id, message_id, sent_at, walk_id)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (chat_id, message_id) DO UPDATE SET walk_id = EXCLUDED.walk_id
  `, [String(body.chat_id), message.message_id, new Date(message.date * 1000), walkId]);
  for (const old of previous) {
    if (old.message_id === message.message_id) continue;
    if (new Date(old.delete_next_attempt_at).getTime() > Date.now()) continue;
    try {
      // Telegram only permits deletion strictly before 48 hours, subject to chat permissions.
      if (Date.now() - new Date(old.sent_at).getTime() >= 48 * 60 * 60 * 1000) {
        throw new Error("Сообщение старше 48 часов: Telegram запрещает удаление.");
      }
      try {
        const deleted = await request("deleteMessage", { chat_id: String(body.chat_id), message_id: old.message_id });
        if (deleted !== true) throw new Error("Telegram не подтвердил удаление.");
      } catch (error) {
        if (!/^(?:Bad Request: )?message to delete not found$/i.test(String(error.message))) throw error;
      }
    } catch (error) {
      await deferTelegramMessageDeletion(client, { chat_id: String(body.chat_id), message_id: old.message_id }, error, true);
      console.error(`[walk-telegram-notifications] Не удалено сообщение ${body.chat_id}/${old.message_id}.`, error);
      continue;
    }
    await client.query("SAVEPOINT telegram_walk_delete");
    try {
      await client.query("DELETE FROM telegram_bot_messages WHERE chat_id = $1 AND message_id = $2", [String(body.chat_id), old.message_id]);
    } catch (error) {
      await client.query("ROLLBACK TO SAVEPOINT telegram_walk_delete");
      console.error("[walk-telegram-notifications] Не удалось обновить запись удалённого сообщения.", error);
    }
    await client.query("RELEASE SAVEPOINT telegram_walk_delete");
  }
  return message;
}
