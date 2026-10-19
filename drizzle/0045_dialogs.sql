CREATE TABLE dialogs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_low uuid NOT NULL,
  client_high uuid NOT NULL,
  expires_at timestamptz,
  last_seq bigint NOT NULL DEFAULT 0,
  low_hidden_through bigint NOT NULL DEFAULT 0,
  high_hidden_through bigint NOT NULL DEFAULT 0,
  CONSTRAINT dialogs_pair_order CHECK (client_low < client_high),
  CONSTRAINT dialogs_pair_unique UNIQUE (client_low, client_high)
);
CREATE INDEX dialogs_client_low_idx ON dialogs (client_low);
CREATE INDEX dialogs_client_high_idx ON dialogs (client_high);
CREATE INDEX dialogs_expires_at_idx ON dialogs (expires_at);

CREATE TABLE dialog_messages (
  dialog_id uuid NOT NULL REFERENCES dialogs(id) ON DELETE CASCADE,
  seq bigint NOT NULL,
  sender_client_id uuid NOT NULL,
  request_id uuid NOT NULL,
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL,
  read_at timestamptz,
  PRIMARY KEY (dialog_id, seq),
  UNIQUE (dialog_id, sender_client_id, request_id)
);
