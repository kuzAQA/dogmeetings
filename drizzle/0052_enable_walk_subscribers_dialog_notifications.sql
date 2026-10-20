WITH active_chats AS (
  SELECT DISTINCT telegram_chat_id
  FROM telegram_complex_subscriptions
  WHERE active = true
), verified_clients AS (
  SELECT client_id, MIN(used_by_chat_id) AS telegram_chat_id
  FROM telegram_subscription_intents
  WHERE client_id IS NOT NULL
    AND used_at IS NOT NULL
    AND used_by_chat_id IS NOT NULL
    AND BTRIM(used_by_chat_id) <> ''
  GROUP BY client_id
  -- Count all retained used chats before filtering for active walk subscriptions.
  HAVING COUNT(DISTINCT used_by_chat_id) = 1
)
INSERT INTO telegram_chat_settings (client_id, telegram_chat_id, enabled)
SELECT verified_clients.client_id, verified_clients.telegram_chat_id, true
FROM verified_clients
JOIN active_chats USING (telegram_chat_id)
ON CONFLICT (client_id) DO NOTHING;

UPDATE telegram_chat_settings
SET enabled = true
WHERE enabled = false
  AND EXISTS (
    SELECT 1
    FROM telegram_complex_subscriptions
    WHERE telegram_complex_subscriptions.telegram_chat_id = telegram_chat_settings.telegram_chat_id
      AND telegram_complex_subscriptions.active = true
  );
