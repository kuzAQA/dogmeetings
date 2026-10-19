ALTER TABLE announcement_campaigns
  ADD COLUMN exclusions jsonb NOT NULL DEFAULT '{"cities":[],"districts":[],"complexes":[]}'::jsonb,
  ADD CONSTRAINT announcement_exclusions_shape CHECK (
    jsonb_typeof(exclusions) = 'object'
    AND exclusions ?& ARRAY['cities', 'districts', 'complexes']
    AND jsonb_typeof(exclusions->'cities') = 'array'
    AND jsonb_typeof(exclusions->'districts') = 'array'
    AND jsonb_typeof(exclusions->'complexes') = 'array'
  );
