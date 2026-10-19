-- +goose Up
CREATE TABLE catalog.outbox (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    type text NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    payload jsonb NOT NULL,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','delivered','failed')),
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    available_at timestamptz NOT NULL DEFAULT now(),
    delivered_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_outbox_pending_idx ON catalog.outbox(available_at,id) WHERE status='pending';
CREATE TABLE catalog.processed_events (
    id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX catalog_processed_events_retention_idx ON catalog.processed_events(processed_at,id);

-- +goose Down
DROP TABLE catalog.processed_events;
DROP TABLE catalog.outbox;
