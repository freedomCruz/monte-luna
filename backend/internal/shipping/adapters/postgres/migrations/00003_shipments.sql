-- +goose Up
CREATE TABLE shipping.shipments (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_id uuid NOT NULL UNIQUE,
    carrier_name text,
    tracking_number text,
    tracking_url text,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','shipped','delivered','returned')),
    shipped_at timestamptz,
    delivered_at timestamptz,
    actor_id uuid,
    version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (status = 'pending' OR (carrier_name IS NOT NULL AND btrim(carrier_name) <> '' AND shipped_at IS NOT NULL)),
    CHECK (status <> 'delivered' OR delivered_at IS NOT NULL),
    CHECK (status <> 'pending' OR (shipped_at IS NULL AND delivered_at IS NULL))
);
CREATE INDEX shipments_status_created_idx ON shipping.shipments(status, created_at DESC);
CREATE TABLE shipping.outbox (
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
CREATE INDEX shipping_outbox_pending_idx ON shipping.outbox(available_at,id) WHERE status='pending';
CREATE TABLE shipping.processed_events (id uuid PRIMARY KEY, processed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX shipping_processed_events_retention_idx ON shipping.processed_events(processed_at,id);

-- +goose Down
DROP TABLE shipping.processed_events;
DROP TABLE shipping.outbox;
DROP TABLE shipping.shipments;
