/** Message IDs deliberately survive walk/pet cascades in telegram_bot_messages. */
export async function deferTelegramMessageDeletion(client, message, error, inTransaction = false) {
  if (inTransaction) await client.query("SAVEPOINT telegram_delete_retry");
  try {
    await client.query(`UPDATE telegram_bot_messages
      SET delete_next_attempt_at = GREATEST(delete_next_attempt_at, CURRENT_TIMESTAMP + ($3 * INTERVAL '1 second'))
      WHERE chat_id = $1 AND message_id = $2`, [message.chat_id, message.message_id, error.retryAfter || 60]);
  } catch (storageError) {
    if (inTransaction) await client.query("ROLLBACK TO SAVEPOINT telegram_delete_retry");
    console.error("[telegram-cleanup] Не удалось сохранить время повтора; ID сохранены.", storageError);
  }
  if (inTransaction) await client.query("RELEASE SAVEPOINT telegram_delete_retry");
}

export async function deleteTelegramWalkMessages(client, messages, request, now = new Date()) {
  for (const message of messages) {
    if (!message.chat_id || !Number.isSafeInteger(message.message_id)) continue;
    try {
      if (now.getTime() - new Date(message.sent_at).getTime() >= 48 * 60 * 60 * 1000) {
        throw new Error("Сообщение старше 48 часов: Telegram запрещает удаление.");
      }
      try {
        if (await request("deleteMessage", { chat_id: message.chat_id, message_id: message.message_id }) !== true) {
          throw new Error("Telegram не подтвердил удаление.");
        }
      } catch (error) {
        if (!/^(?:Bad Request: )?message to delete not found$/i.test(String(error.message))) throw error;
      }
      await client.query("DELETE FROM telegram_bot_messages WHERE chat_id = $1 AND message_id = $2", [message.chat_id, message.message_id]);
    } catch (error) {
      await deferTelegramMessageDeletion(client, message, error);
      console.error(`[walk-telegram-deletion] Не удалено сообщение ${message.chat_id}/${message.message_id}.`, error);
    }
  }
}

export async function cleanupDeletedWalkMessages(client, request) {
  const { rows } = await client.query(`
    SELECT chat_id, message_id, sent_at FROM telegram_bot_messages AS message
    WHERE walk_id IS NOT NULL
      AND (delete_next_attempt_at IS NULL OR delete_next_attempt_at <= CURRENT_TIMESTAMP)
      AND (delete_next_attempt_at IS NOT NULL OR NOT EXISTS (SELECT 1 FROM walks WHERE id = message.walk_id))
      AND sent_at > CURRENT_TIMESTAMP - INTERVAL '48 hours'
  `);
  await deleteTelegramWalkMessages(client, rows, request);
}
