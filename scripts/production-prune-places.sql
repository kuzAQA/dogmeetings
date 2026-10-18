-- Run manually on production after a verified database backup, with app and scheduler stopped.
BEGIN;
LOCK TABLE places, walks IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF (SELECT count(*) FROM places WHERE name = 'Сквер между домов') <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one place named Сквер между домов; cleanup cancelled';
  END IF;
END;
$$;

-- The existing foreign key cancels the transaction if another place still has walks.
DELETE FROM places WHERE name <> 'Сквер между домов';
COMMIT;
