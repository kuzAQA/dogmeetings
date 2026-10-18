ALTER TABLE places ADD COLUMN created_by uuid;
CREATE INDEX places_created_by_idx ON places (created_by);
