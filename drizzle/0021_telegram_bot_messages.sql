CREATE TABLE "telegram_bot_messages" (
  "chat_id" varchar(20) NOT NULL,
  "message_id" integer NOT NULL,
  "sent_at" timestamp with time zone NOT NULL,
  PRIMARY KEY ("chat_id", "message_id")
);
CREATE INDEX "telegram_bot_messages_sent_at_idx" ON "telegram_bot_messages" ("sent_at");
