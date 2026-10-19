UPDATE announcement_campaigns
SET pages = jsonb_set(
  pages,
  '{0,title}',
  '"Теперь в карточке питомца можно добавить контакт для связи"'::jsonb
)
WHERE id = 'pet-owner-contact-2026-10';
