-- One-time campaign: seven days from activation, never renewed by app restarts.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
VALUES (
  'site-share-2026-10',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  '[{"title":"Приглашайте друзей гулять вместе","text":"Поделитесь сайтом с друзьями, чтобы находить компанию для прогулок с питомцами. Откройте меню «Мой район и настройки» и выберите «Поделиться сайтом»: покажите друзьям QR-код, чтобы они открыли сайт.","example":"site-share"}]'::jsonb
);
