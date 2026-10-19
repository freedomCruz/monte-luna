-- +goose Up
CREATE TABLE orders.processed_events (
    id uuid PRIMARY KEY,
    processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX orders_processed_events_retention_idx ON orders.processed_events(processed_at,id);

-- +goose Down
DROP TABLE orders.processed_events;
