CREATE TABLE announcement_campaigns (
  id varchar(100) PRIMARY KEY,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  pages jsonb NOT NULL,
  CHECK (ends_at > starts_at),
  CHECK (jsonb_typeof(pages) = 'array' AND jsonb_array_length(pages) > 0)
);
CREATE INDEX announcement_campaigns_ends_at_idx ON announcement_campaigns (ends_at);

-- Receipts outlive campaign content, so they deliberately have no foreign key.
CREATE TABLE announcement_receipts (
  client_id uuid NOT NULL,
  banner_id varchar(100) NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (client_id, banner_id)
);

-- Campaign content and dates live here. New campaigns need a new ID and migration.
-- This seed runs once; restarting/building the app never restores deleted content.
INSERT INTO announcement_campaigns (id, starts_at, ends_at, pages)
SELECT * FROM (VALUES (
  'pet-owner-contact-2026-10',
  '2026-10-19T00:00:00+03:00'::timestamptz,
  '2026-10-26T00:00:00+03:00'::timestamptz,
  '[{"title":"Теперь в карточке питомца есть контакт","text":"Добавьте контакт в карточку своего питомца, чтобы другие пользователи могли связаться с вами. Контакты владельцев также можно найти в карточках их питомцев.","example":"pet-contact"}]'::jsonb
)) AS campaign (id, starts_at, ends_at, pages)
WHERE CURRENT_TIMESTAMP < ends_at;
