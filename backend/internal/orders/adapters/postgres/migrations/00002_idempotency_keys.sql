-- +goose Up
ALTER TABLE orders.orders ADD COLUMN shipping_is_free_shipping boolean NOT NULL DEFAULT false;
CREATE TABLE orders.idempotency_keys (
    key uuid PRIMARY KEY,
    request_hash text NOT NULL,
    order_id uuid NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
    response_status integer NOT NULL CHECK (response_status = 201),
    response_body jsonb NOT NULL CHECK (NOT (response_body ? 'tracking_token')),
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
);
CREATE INDEX idempotency_keys_order_idx ON orders.idempotency_keys(order_id);
CREATE INDEX idempotency_keys_expiry_idx ON orders.idempotency_keys(expires_at);

-- +goose Down
DROP TABLE orders.idempotency_keys;
ALTER TABLE orders.orders DROP COLUMN shipping_is_free_shipping;
