-- NULL preserves legacy users whose deleted pet history is unknown.
ALTER TABLE client_sessions ADD COLUMN has_added_pet boolean;

UPDATE client_sessions AS sessions
SET has_added_pet = true
WHERE EXISTS (SELECT 1 FROM pets WHERE pets.client_id = sessions.client_id)
   OR EXISTS (SELECT 1 FROM pet_collaborators WHERE pet_collaborators.client_id = sessions.client_id);

ALTER TABLE client_sessions ALTER COLUMN has_added_pet SET DEFAULT false;

CREATE FUNCTION remember_client_pet() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  UPDATE client_sessions SET has_added_pet = true
  WHERE client_id = NEW.client_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Client session % does not exist', NEW.client_id USING ERRCODE = '23503';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER remember_owned_pet
AFTER INSERT ON pets
FOR EACH ROW EXECUTE FUNCTION remember_client_pet();

CREATE TRIGGER remember_shared_pet
AFTER INSERT ON pet_collaborators
FOR EACH ROW EXECUTE FUNCTION remember_client_pet();
