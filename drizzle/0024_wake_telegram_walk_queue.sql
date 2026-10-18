CREATE FUNCTION notify_telegram_walk_queue() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_notify('dogmeet_walk_telegram', '');
  RETURN NULL;
END;
$$;

CREATE TRIGGER telegram_walk_queue_wakeup
AFTER INSERT OR UPDATE OF id, message_text ON telegram_walk_notifications
FOR EACH STATEMENT EXECUTE FUNCTION notify_telegram_walk_queue();

CREATE TRIGGER telegram_walk_deletion_wakeup
AFTER DELETE ON walks
FOR EACH ROW EXECUTE FUNCTION notify_telegram_walk_queue();
