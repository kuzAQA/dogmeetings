CREATE TABLE push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL,
  session_hash varchar(64) NOT NULL,
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  version uuid NOT NULL DEFAULT gen_random_uuid(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX push_subscriptions_client_idx ON push_subscriptions (client_id) WHERE active;

CREATE TABLE chat_push_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dialog_id uuid NOT NULL,
  message_seq bigint NOT NULL,
  subscription_id uuid NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  subscription_version uuid NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lease uuid,
  done_at timestamptz,
  outcome varchar(20),
  FOREIGN KEY (dialog_id, message_seq) REFERENCES dialog_messages(dialog_id, seq) ON DELETE CASCADE,
  UNIQUE (dialog_id, message_seq, subscription_id)
);
CREATE INDEX chat_push_outbox_pending_idx ON chat_push_outbox (available_at) WHERE done_at IS NULL;
CREATE INDEX dialog_messages_unread_idx ON dialog_messages (dialog_id, seq) INCLUDE (sender_client_id) WHERE read_at IS NULL;
