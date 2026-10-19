UPDATE announcement_campaigns
SET pages = jsonb_set(
  pages,
  '{0,text}',
  to_jsonb(replace(pages->0->>'text', '«Мой район и настройки»', '{{menu}}'))
)
WHERE id = 'site-share-2026-10';
