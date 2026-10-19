-- One-time campaign: seven days from activation, never renewed by app restarts.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
VALUES (
  'walk-places-2026-10',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  '[{"title":"Управляйте местами для прогулок","text":"Меняйте названия добавленных вами мест и удаляйте те, которые не связаны с прогулками. Откройте «Мои места» в меню или нажмите «здесь» в окне выбора места для прогулки.","example":"places-help"}]'::jsonb
);
