ALTER TABLE "telegram_bot_messages" ADD COLUMN "walk_id" uuid;
CREATE INDEX "telegram_bot_messages_walk_chat_idx" ON "telegram_bot_messages" ("walk_id", "chat_id");
