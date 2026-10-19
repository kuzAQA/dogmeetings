-- One-time campaign: seven days from activation, never renewed by app restarts.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
VALUES (
  'shared-pet-2026-10',
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP + INTERVAL '7 days',
  '[{"title":"Один питомец — общая карточка","text":"Если вы заботитесь об одном питомце вдвоём, создавать отдельную карточку каждому не нужно. Откройте паспорт питомца, выберите «Поделиться питомцем» и покажите QR-код второму владельцу. На другом телефоне отсканируйте код и нажмите «Добавить к моим питомцам», чтобы пользоваться общей карточкой.","example":"pet-share"}]'::jsonb
);
