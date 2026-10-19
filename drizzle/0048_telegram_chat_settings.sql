ALTER TABLE telegram_subscription_intents ADD COLUMN client_id uuid;

CREATE TABLE telegram_chat_settings (
  client_id uuid PRIMARY KEY,
  telegram_chat_id varchar(20) NOT NULL,
  enabled boolean NOT NULL DEFAULT false
);
