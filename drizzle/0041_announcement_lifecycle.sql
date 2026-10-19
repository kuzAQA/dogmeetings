-- Preserve every existing campaign, including content, dates, audience and receipts.
ALTER TABLE announcement_campaigns ADD COLUMN permanent boolean NOT NULL DEFAULT true;
ALTER TABLE announcement_campaigns ALTER COLUMN permanent SET DEFAULT false;
ALTER TABLE announcement_campaigns ALTER COLUMN starts_at DROP NOT NULL;
ALTER TABLE announcement_campaigns ALTER COLUMN ends_at DROP NOT NULL;
