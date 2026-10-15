-- +goose Up
CREATE TABLE orders.orders (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_number text NOT NULL UNIQUE,
    status text NOT NULL CHECK (status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired')),
    currency text NOT NULL DEFAULT 'COP' CHECK (currency ~ '^[A-Z]{3}$'),
    subtotal_amount bigint NOT NULL CHECK (subtotal_amount >= 0),
    discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    shipping_amount bigint NOT NULL CHECK (shipping_amount >= 0),
    shipping_discount_amount bigint NOT NULL DEFAULT 0 CHECK (shipping_discount_amount >= 0 AND shipping_discount_amount <= shipping_amount),
    tax_amount bigint NOT NULL CHECK (tax_amount >= 0),
    total_amount bigint NOT NULL CHECK (total_amount >= 0),
    coupon_code text,
    shipping_rate_name text NOT NULL,
    shipping_estimated_days_min integer NOT NULL CHECK (shipping_estimated_days_min >= 1),
    shipping_estimated_days_max integer NOT NULL CHECK (shipping_estimated_days_max >= shipping_estimated_days_min),
    customer_email text NOT NULL CHECK (customer_email = lower(customer_email)),
    customer_name text NOT NULL,
    customer_phone text,
    buyer_person_type text CHECK (buyer_person_type IN ('natural','legal')),
    buyer_document_type text,
    buyer_document_number text,
    fiscal_profile_snapshot jsonb NOT NULL,
    tracking_token_hash text NOT NULL UNIQUE,
    reservation_expires_at timestamptz NOT NULL,
    placed_at timestamptz NOT NULL DEFAULT now(),
    paid_at timestamptz,
    cancelled_at timestamptz,
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (total_amount = subtotal_amount - discount_amount + shipping_amount - shipping_discount_amount + tax_amount)
);
CREATE INDEX orders_expiry_idx ON orders.orders(reservation_expires_at) WHERE status='pending_payment';
CREATE INDEX orders_status_placed_idx ON orders.orders(status, placed_at DESC);
CREATE INDEX orders_email_idx ON orders.orders(customer_email);

CREATE TABLE orders.order_lines (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_id uuid NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
    product_id uuid NOT NULL,
    variant_id uuid NOT NULL,
    sku text NOT NULL,
    product_slug text NOT NULL,
    product_title text NOT NULL,
    variant_label text NOT NULL,
    unit_price_amount bigint NOT NULL CHECK (unit_price_amount > 0),
    quantity integer NOT NULL CHECK (quantity > 0),
    discount_amount bigint NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
    tax_category text NOT NULL CHECK (tax_category IN ('excluded','exempt','reduced','standard')),
    tax_rate_bps integer NOT NULL CHECK (tax_rate_bps >= 0),
    tax_amount bigint NOT NULL CHECK (tax_amount >= 0),
    line_total_amount bigint NOT NULL CHECK (line_total_amount >= 0),
    weight_grams integer NOT NULL CHECK (weight_grams > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_lines_order_idx ON orders.order_lines(order_id);

CREATE TABLE orders.order_line_lot_allocations (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_line_id uuid NOT NULL REFERENCES orders.order_lines(id) ON DELETE CASCADE,
    lot_id uuid NOT NULL,
    lot_code text NOT NULL,
    production_date date NOT NULL,
    quantity integer NOT NULL CHECK (quantity > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_line_allocations_line_idx ON orders.order_line_lot_allocations(order_line_id);

CREATE TABLE orders.order_shipping_addresses (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_id uuid NOT NULL UNIQUE REFERENCES orders.orders(id) ON DELETE CASCADE,
    recipient_name text NOT NULL,
    phone text NOT NULL,
    address_line1 text NOT NULL,
    address_line2 text,
    department_name text NOT NULL,
    municipality_code text NOT NULL CHECK (municipality_code ~ '^[0-9]{5}$'),
    municipality_name text NOT NULL,
    postal_code text,
    delivery_notes text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE orders.order_status_history (
    id uuid PRIMARY KEY DEFAULT uuidv7(),
    order_id uuid NOT NULL REFERENCES orders.orders(id) ON DELETE CASCADE,
    from_status text CHECK (from_status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired')),
    to_status text NOT NULL CHECK (to_status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired')),
    actor_type text NOT NULL CHECK (actor_type IN ('system','admin','customer')),
    actor_id uuid,
    note text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_status_history_order_created_idx ON orders.order_status_history(order_id,created_at);

-- Prepared for B3 persistence; B2 publishes and consumes no events.
CREATE TABLE orders.outbox (
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
CREATE INDEX orders_outbox_pending_idx ON orders.outbox(available_at,id) WHERE status='pending';

-- +goose Down
DROP TABLE orders.outbox;
DROP TABLE orders.order_status_history;
DROP TABLE orders.order_shipping_addresses;
DROP TABLE orders.order_line_lot_allocations;
DROP TABLE orders.order_lines;
DROP TABLE orders.orders;
