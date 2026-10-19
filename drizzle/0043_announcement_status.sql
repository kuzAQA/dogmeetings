ALTER TABLE announcement_campaigns
  ADD COLUMN status varchar(16) NOT NULL DEFAULT 'active',
  ADD CONSTRAINT announcement_campaigns_status_check CHECK (status IN ('active', 'paused', 'disabled', 'information'));
