ALTER TABLE telegram_subscription_intents ADD COLUMN IF NOT EXISTS purpose varchar(24) NOT NULL DEFAULT 'combined';
ALTER TABLE telegram_subscription_intents ADD COLUMN IF NOT EXISTS completed_at timestamptz;
