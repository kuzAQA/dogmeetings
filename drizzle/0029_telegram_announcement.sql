-- One-time campaign: seven days from activation, never renewed by app restarts.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
VALUES (
  'telegram-notifications-2026-10',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  '[{"title":"Узнавайте о прогулках в Telegram","text":"Получайте уведомления о прогулках ваших друзей в Telegram. Нажмите Telegram в нижнем меню сайта и подключите уведомления. Так вы не пропустите возможность погулять вместе.","example":"telegram-dock"}]'::jsonb
);
