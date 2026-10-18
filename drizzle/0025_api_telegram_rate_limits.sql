CREATE TABLE telegram_api_limits (
  scope text PRIMARY KEY,
  next_at timestamptz NOT NULL DEFAULT now(),
  blocked_until timestamptz NOT NULL DEFAULT '-infinity'
);
ALTER TABLE telegram_bot_messages ADD COLUMN delete_next_attempt_at timestamptz;
