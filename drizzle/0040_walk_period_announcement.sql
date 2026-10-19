-- One-time campaign: seven days from activation, never renewed by app restarts.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
VALUES (
  'walk-period-2026-10',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  '[{"title":"Прогулки по времени дня","text":"Прогулки на сайте отображаются в зависимости от текущего времени: фильтр выбирается автоматически. Например, днём — {{period}}. Вы всегда можете изменить фильтр и посмотреть, кто в какое время гуляет.","example":"walk-periods"}]'::jsonb
);
