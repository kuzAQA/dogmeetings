-- Start the release's existing banners together; keep them in Information afterwards.
UPDATE announcement_campaigns
SET starts_at = CURRENT_TIMESTAMP,
    ends_at = CURRENT_TIMESTAMP + INTERVAL '7 days',
    permanent = true;
