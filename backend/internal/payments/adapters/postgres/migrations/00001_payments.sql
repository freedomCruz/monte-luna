-- +goose Up
CREATE TABLE payments.payment_attempts (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 order_id uuid NOT NULL,
 provider text NOT NULL DEFAULT 'wompi',
 reference text NOT NULL UNIQUE,
 provider_transaction_id text UNIQUE,
 payment_method_type text CHECK (payment_method_type IN ('CARD','PSE','NEQUI','BANCOLOMBIA_TRANSFER')),
 amount bigint NOT NULL CHECK (amount > 0),
 currency text NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
 status text NOT NULL CHECK (status IN ('created','pending','approved','declined','voided','error','expired','duplicate_approved')),
 status_message text,
 expires_at timestamptz NOT NULL,
 finalized_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX payments_one_approved_idx ON payments.payment_attempts(order_id) WHERE status='approved';
CREATE INDEX payments_attempt_expiry_idx ON payments.payment_attempts(expires_at) WHERE status IN ('created','pending');
CREATE INDEX payments_attempt_order_idx ON payments.payment_attempts(order_id);
CREATE TABLE payments.refunds (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 payment_attempt_id uuid NOT NULL REFERENCES payments.payment_attempts(id) ON DELETE RESTRICT,
 order_id uuid NOT NULL,
 amount bigint NOT NULL CHECK (amount > 0),
 currency text NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
 reason text NOT NULL CHECK (reason IN ('late_payment_no_stock','order_cancelled','customer_request','duplicate_payment')),
 method text NOT NULL CHECK (method IN ('card_void','manual')),
 status text NOT NULL CHECK (status IN ('pending','completed','failed')),
 external_reference text,
 notes text,
 actor_id uuid,
 completed_at timestamptz,
 version integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_refund_attempt_idx ON payments.refunds(payment_attempt_id);
CREATE INDEX payments_refund_order_idx ON payments.refunds(order_id);
CREATE TABLE payments.provider_webhook_events (
 id uuid PRIMARY KEY DEFAULT uuidv7(),
 provider text NOT NULL DEFAULT 'wompi',
 dedup_key text NOT NULL,
 event_type text NOT NULL,
 received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,dedup_key)
);
CREATE INDEX payments_webhook_retention_idx ON payments.provider_webhook_events(received_at,id);
CREATE TABLE payments.outbox (
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
CREATE INDEX payments_outbox_pending_idx ON payments.outbox(available_at,id) WHERE status='pending';
CREATE TABLE payments.processed_events (id uuid PRIMARY KEY,processed_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX payments_processed_retention_idx ON payments.processed_events(processed_at,id);
CREATE TABLE payments.idempotency_keys (
 key uuid PRIMARY KEY,
 request_hash text NOT NULL,
 payment_attempt_id uuid NOT NULL REFERENCES payments.payment_attempts(id) ON DELETE CASCADE,
 response_body jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL
);
CREATE INDEX payments_idempotency_attempt_idx ON payments.idempotency_keys(payment_attempt_id);
CREATE INDEX payments_idempotency_expiry_idx ON payments.idempotency_keys(expires_at);

-- +goose Down
DROP TABLE payments.idempotency_keys;
DROP TABLE payments.processed_events;
DROP TABLE payments.outbox;
DROP TABLE payments.provider_webhook_events;
DROP TABLE payments.refunds;
DROP TABLE payments.payment_attempts;
