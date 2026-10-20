-- +goose Up
CREATE TABLE notifications.email_messages (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    source_event_id uuid NOT NULL UNIQUE,
    template_key text NOT NULL CHECK (template_key ~ '^[a-z][a-z0-9_]*$'),
    recipient_email text,
    template_data jsonb NOT NULL DEFAULT '{}',
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','delivered','bounced','complained','failed','suppressed')),
    provider text NOT NULL DEFAULT 'resend',
    provider_message_id text UNIQUE,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error text,
    sent_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
-- Serves retry monitoring of pending/failed messages.
CREATE INDEX email_messages_retry_idx ON notifications.email_messages(created_at) WHERE status IN ('pending','failed');

CREATE TABLE notifications.email_suppressions (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    email text NOT NULL UNIQUE CHECK (email = lower(email)),
    reason text NOT NULL CHECK (reason IN ('hard_bounce','complaint','manual')),
    source_message_id uuid REFERENCES notifications.email_messages(id) ON DELETE SET NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
-- Serves FK maintenance when an email message is deleted.
CREATE INDEX email_suppressions_source_idx ON notifications.email_suppressions(source_message_id);

CREATE TABLE notifications.provider_webhook_events (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    provider text NOT NULL,
    external_event_id text NOT NULL,
    event_type text NOT NULL,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider,external_event_id)
);
-- Serves bounded 30-day webhook ledger cleanup.
CREATE INDEX provider_webhook_events_retention_idx ON notifications.provider_webhook_events(received_at,id);

-- The canonical consumer ledger uses the originating event ID as its primary key.
CREATE TABLE notifications.processed_events (
    event_id uuid PRIMARY KEY,
    event_type text NOT NULL,
    processed_at timestamptz NOT NULL DEFAULT now()
);
-- Serves bounded 7-day consumer ledger cleanup.
CREATE INDEX processed_events_retention_idx ON notifications.processed_events(processed_at,event_id);

-- +goose Down
DROP TABLE notifications.processed_events;
DROP TABLE notifications.provider_webhook_events;
DROP TABLE notifications.email_suppressions;
DROP TABLE notifications.email_messages;
