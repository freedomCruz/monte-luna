# Orders Domain

Canonical requirements and data model for the `orders` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Guest checkout only (no buyer accounts in v1) | Approved |
| Browser-side cart with server-side checkout quote | Approved |
| Server-side stock reservation (oldest lot first, 30-minute hold) | Approved |
| Expiration reconciliation and compensating release | Approved |
| Non-sequential random order number (Crockford base32) | Approved |
| Guest tracking via SHA-256 token hash | Approved |
| Order state machine and audit trail (`order_status_history`) | Approved |
| Immutable line and lot allocation snapshots | Approved |
| Order tax and fiscal profile snapshot | Approved |
| Colombian address capture (DANE municipality code) | Approved |
| Data model (section 3) | Approved |
| Payment arriving after reservation expiry | Approved (handled via late-payment flow in [payments](payments.md)) |
| Detailed discount breakdown by promotions | Approved (proportional allocation defined in [promotions](promotions.md)) |
| Order record commercial and fiscal retention period | Open Item |
| Personal data retention and privacy policy (Ley 1581) | Open Item |

## 2. Approved Requirements

**Checkout flow and cart boundary**
- The cart lives entirely in the browser (client-side state / localStorage). There is no server-side `cart` entity or schema.
- The browser never computes or determines prices, discounts, taxes, or shipping costs.
- When the customer initiates checkout, the storefront requests a checkout quote from `internal/orders`.
- To compute the quote, `orders` performs server-side API composition:
  1. Calls `catalog` to retrieve live variant pricing, active status, weight, and stock availability.
  2. Calls `shipping` with destination municipality code, total weight in grams, and subtotal to resolve the matching shipping rate and cost.
  3. Invokes the `TaxCalculator` port (`invoicing` domain) with line tax categories, merchant fiscal profile in force, and destination to obtain tax rates and tax amounts.

**Order placement and stock reservation**
- Placing an order generates a new UUIDv7 order ID and unique human-readable order number.
- `orders` calls the `catalog` public API to allocate stock for the requested variants and quantities (allocating oldest lot first). The allocation is tagged with the order ID as `reference_id`.
- `orders` persists the order in `pending_payment` status with `reservation_expires_at = placed_at + 30 minutes` and publishes `orders.order_placed` to its outbox.
- **Compensating transaction:** If persisting the order fails after catalog stock has been allocated, `orders` immediately invokes the catalog release API.
- **Expiry reconciliation and in-flight payment grace:**
  - A periodic background expiry worker checks for orders where `status = 'pending_payment' AND reservation_expires_at <= now()`.
  - Before expiring an order and releasing stock, the worker queries `payments` to check if an active payment attempt is in flight (status `pending` at Wompi, e.g. customer actively completing bank authentication in PSE).
  - If a payment is in flight, `reservation_expires_at` is extended in steps (e.g. +15 minutes), up to a hard ceiling of **2 hours from `placed_at`**.
  - If no attempt is in flight or the 2-hour hard maximum is reached without approval, the order transitions to `status = 'expired'`, writes an entry to `order_status_history`, and publishes `orders.order_expired`.
  - The `catalog` module handles stock release upon receiving `orders.order_expired` (or via reconciliation), inserting an `inventory_movements` record with reason `'release'`.

**Payment confirmation**
- When payment succeeds, `payments` emits `payments.payment_approved` consumed by `orders`.
- If the order is in `pending_payment`, `orders` transitions status to `paid`, sets `paid_at = now()`, records the transition in `order_status_history`, and emits `orders.order_paid`.
- If the order is already in `expired` status (late-payment arrival):
  - `orders` calls `catalog` to attempt re-allocating inventory for all order lines.
  - **Re-allocation succeeds:** `orders` transitions `expired → paid`, sets `paid_at = now()`, writes an audit note to `order_status_history`, and emits `orders.order_paid`.
  - **Re-allocation fails (stock exhausted):** `orders` transitions `expired → cancelled`, writes an audit note to `order_status_history`, and emits `orders.order_cancelled` with reason `'late_payment_no_stock'` (triggering refund flow in `payments`).
- `orders.order_paid` is consumed by:
  - `invoicing`: to issue the electronic invoice or fiscal receipt from the immutable tax snapshot.
  - `notifications`: to email the order confirmation and tracking link to the buyer.
  - `shipping`: to initialize a fulfillment shipment in `pending` status.
  - `promotions`: to transition reserved coupon redemptions to `confirmed`.

**Guest tracking and security**
- Every order gets a 32-byte tracking token derived as `HMAC-SHA256(TRACKING_TOKEN_SECRET, Idempotency-Key)`, encoded base64url without padding (43 characters). The Idempotency-Key is a client-generated random UUID and the secret never leaves the server, so the token is unpredictable; deriving it lets an idempotent retry return the same token without storing it (approved 2026-10-15).
- `TRACKING_TOKEN_SECRET` is a server secret of at least 32 random bytes, validated at startup. Rotating it does not invalidate existing tokens (only their hashes are stored); it only changes the token an idempotent retry would recompute within the 24-hour window.
- The raw token is sent to the customer via email in their private order tracking URL.
- The database stores only the SHA-256 hash (`tracking_token_hash`).
- When the customer visits the tracking page, the server computes the SHA-256 hash of the supplied token and queries by hash. The order UUID or order number alone never grants access to order details.

**Order number generation**
- Short, human-friendly identifier (e.g., prefix plus 6–8 Crockford base32 characters, such as `ORD-7K2M9Q4X`).
- Enforced `UNIQUE`.
- Non-sequential and random, ensuring sales volume, order velocity, and commercial metrics are not leaked to customers or third parties.

**Order state machine**
- Valid statuses: `pending_payment`, `paid`, `preparing`, `shipped`, `delivered`, `cancelled`, `expired`.
- Happy path: `pending_payment` → `paid` → `preparing` → `shipped` → `delivered`.
- Pre-payment termination: `pending_payment` → `expired` | `cancelled`.
- Post-payment cancellation: `paid` → `cancelled` or `preparing` → `cancelled` (triggers refund flow in `payments`).
- Late-payment post-expiry transitions:
  - `expired` → `paid`: Late payment approved and catalog stock re-allocation succeeded.
  - `expired` → `cancelled`: Late payment approved but catalog stock re-allocation failed due to depleted inventory (triggers refund flow in `payments`).
- Terminal status rules:
  - `delivered` and `cancelled` are strictly terminal; no transitions are permitted from them.
  - `expired` is terminal under ordinary operations, but transitions to `paid` or `cancelled` exclusively through the late-payment post-expiry resolution flow.
- Every status transition is validated in the Go domain and recorded in `order_status_history`.
- Status `shipped` is set when `shipping` publishes `shipping.shipment_shipped`.

**Discount calculation and line allocation**
- If a promotional coupon is applied at checkout:
  - `orders.coupon_code` snapshots the uppercase coupon code.
  - Merchandise discounts are recorded in `orders.discount_amount`.
  - Shipping discounts (e.g. from `free_shipping` coupons) are recorded in `orders.shipping_discount_amount`.
  - Percentage discounts apply strictly to the merchandise subtotal (`subtotal_amount`) before taxes and shipping.
  - The total merchandise discount is allocated proportionally across `order_lines.discount_amount` based on each line's subtotal (`quantity * unit_price_amount`). To eliminate minor-unit integer rounding discrepancies, any residual difference is assigned to the line with the largest monetary subtotal.

**Immutable snapshots**
- `order_lines`: snapshots product title, variant label, SKU, unit price, quantity, tax category, tax rate, and weight at the time of purchase. Live edits or archiving in catalog never alter historical order lines.
- `order_line_lot_allocations`: snapshots exact lot IDs, lot codes, production dates, and allocated quantities returned by catalog.
- `fiscal_profile_snapshot`: snapshots the merchant's fiscal profile in force (`vat_responsible`, regime, country, legal form) per [invoicing-and-taxes.md](../architecture/invoicing-and-taxes.md) section 6.
- `order_shipping_addresses`: snapshots the recipient and destination data at checkout.

## 3. Approved Data Model (schema `orders`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on admin-edited tables (marked ✎) for optimistic locking.
- Documented deviations from standard conventions:
  - `order_lines`: Immutable purchase snapshot; has `created_at` only, no `updated_at`.
  - `order_line_lot_allocations`: Immutable allocation snapshot; has `created_at` only, no `updated_at`.
  - `order_status_history`: Append-only audit ledger; has `created_at` only, no `updated_at`.

```text
orders ✎ ──< order_lines ──< order_line_lot_allocations
   │
   ├── order_shipping_addresses (1:1)
   │
   └──< order_status_history (append-only)
```

### 3.1 `orders` ✎

| Column | Type | Rules |
|---|---|---|
| `order_number` | `text` | Not null; `UNIQUE`; random Crockford base32 code |
| `status` | `text` | Not null; `CHECK (status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired'))` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `subtotal_amount` | `bigint` | Not null; `CHECK (subtotal_amount >= 0)` |
| `discount_amount` | `bigint` | Not null, default `0`; merchandise discount; `CHECK (discount_amount >= 0)` |
| `shipping_amount` | `bigint` | Not null; `CHECK (shipping_amount >= 0)` |
| `shipping_discount_amount` | `bigint` | Not null, default `0`; `CHECK (shipping_discount_amount >= 0 AND shipping_discount_amount <= shipping_amount)` |
| `tax_amount` | `bigint` | Not null; `CHECK (tax_amount >= 0)` |
| `total_amount` | `bigint` | Not null; `CHECK (total_amount >= 0)` |
| `coupon_code` | `text` | Nullable; snapshot of applied coupon code |
| `shipping_rate_name` | `text` | Not null; snapshot of applied shipping rate name |
| `shipping_estimated_days_min` | `integer` | Not null; snapshot of the rate's minimum delivery days; `CHECK (shipping_estimated_days_min >= 1)` |
| `shipping_estimated_days_max` | `integer` | Not null; snapshot of the rate's maximum delivery days; `CHECK (shipping_estimated_days_max >= shipping_estimated_days_min)` |
| `customer_email` | `text` | Not null; `CHECK (customer_email = lower(customer_email))` |
| `customer_name` | `text` | Not null |
| `customer_phone` | `text` | Nullable |
| `buyer_person_type` | `text` | Nullable; `CHECK (buyer_person_type IN ('natural','legal'))` |
| `buyer_document_type` | `text` | Nullable; e.g. CC, NIT, CE, PP |
| `buyer_document_number` | `text` | Nullable |
| `fiscal_profile_snapshot` | `jsonb` | Not null; merchant fiscal configuration snapshot in force at purchase |
| `tracking_token_hash` | `text` | Not null; `UNIQUE`; SHA-256 hash of random guest tracking token (≥ 32 bytes) |
| `reservation_expires_at` | `timestamptz` | Not null; `placed_at + 30 minutes` |
| `placed_at` | `timestamptz` | Not null, default `now()` |
| `paid_at` | `timestamptz` | Nullable |
| `cancelled_at` | `timestamptz` | Nullable |

Table constraints:
- `CHECK (total_amount = subtotal_amount - discount_amount + shipping_amount - shipping_discount_amount + tax_amount)`

Indexes:
- Partial index: `(reservation_expires_at) WHERE status = 'pending_payment'` for the reservation expiry worker.
- Index: `(status, placed_at DESC)` for admin panel listing and filtering.
- Index: `(customer_email)` for customer service lookups.

### 3.2 `order_lines`

Immutable snapshot of purchased items. No `updated_at`.

| Column | Type | Rules |
|---|---|---|
| `order_id` | `uuid` | FK → `orders(id)` ON DELETE CASCADE; indexed |
| `product_id` | `uuid` | Not null; plain catalog product identifier (no cross-schema FK) |
| `variant_id` | `uuid` | Not null; plain catalog variant identifier (no cross-schema FK) |
| `sku` | `text` | Not null; snapshot of SKU |
| `product_slug` | `text` | Not null; snapshot of product slug, used by the guest order view to read image and origin from the catalog |
| `product_title` | `text` | Not null; snapshot of product name |
| `variant_label` | `text` | Not null; snapshot of variant options (e.g. "250 g / Whole Bean") |
| `unit_price_amount` | `bigint` | Not null; `CHECK (unit_price_amount > 0)` |
| `quantity` | `integer` | Not null; `CHECK (quantity > 0)` |
| `discount_amount` | `bigint` | Not null, default `0`; allocated merchandise discount; `CHECK (discount_amount >= 0)` |
| `tax_category` | `text` | Not null; `CHECK (tax_category IN ('excluded','exempt','reduced','standard'))` |
| `tax_rate_bps` | `integer` | Not null; `CHECK (tax_rate_bps >= 0)`; tax rate in basis points (e.g. 1900 = 19%, 500 = 5%) |
| `tax_amount` | `bigint` | Not null; `CHECK (tax_amount >= 0)` |
| `line_total_amount` | `bigint` | Not null; `CHECK (line_total_amount >= 0)` |
| `weight_grams` | `integer` | Not null; `CHECK (weight_grams > 0)` |

### 3.3 `order_line_lot_allocations`

Immutable snapshot of catalog inventory allocations per order line. No `updated_at`.

| Column | Type | Rules |
|---|---|---|
| `order_line_id` | `uuid` | FK → `order_lines(id)` ON DELETE CASCADE; indexed |
| `lot_id` | `uuid` | Not null; plain catalog lot identifier (no cross-schema FK) |
| `lot_code` | `text` | Not null; snapshot of lot code |
| `production_date` | `date` | Not null; snapshot of roast/production date |
| `quantity` | `integer` | Not null; `CHECK (quantity > 0)` |

### 3.4 `order_shipping_addresses`

Delivery address snapshot. 1:1 relation with `orders`.

| Column | Type | Rules |
|---|---|---|
| `order_id` | `uuid` | FK → `orders(id)` ON DELETE CASCADE; `UNIQUE` (indexed) |
| `recipient_name` | `text` | Not null |
| `phone` | `text` | Not null |
| `address_line1` | `text` | Not null |
| `address_line2` | `text` | Nullable |
| `department_name` | `text` | Not null |
| `municipality_code` | `text` | Not null; 5-digit DANE code, `CHECK (municipality_code ~ '^[0-9]{5}$')` |
| `municipality_name` | `text` | Not null |
| `postal_code` | `text` | Nullable |
| `delivery_notes` | `text` | Nullable |

### 3.5 `order_status_history` (append-only)

Audit ledger tracking all status changes with actor provenance. No `updated_at`.

| Column | Type | Rules |
|---|---|---|
| `order_id` | `uuid` | FK → `orders(id)` ON DELETE CASCADE; indexed |
| `from_status` | `text` | Nullable; `CHECK (from_status IS NULL OR from_status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired'))` |
| `to_status` | `text` | Not null; `CHECK (to_status IN ('pending_payment','paid','preparing','shipped','delivered','cancelled','expired'))` |
| `actor_type` | `text` | Not null; `CHECK (actor_type IN ('system','admin','customer'))` |
| `actor_id` | `uuid` | Nullable; admin user ID from `identity` (plain uuid, no cross-schema FK) |
| `note` | `text` | Nullable |
| `created_at` | `timestamptz` | Not null, default `now()` |

Index: `(order_id, created_at)` for chronology audits.

### 3.6 Domain Events (schema `orders.outbox`)

Outbox table and consumer tracking follow [data-modeling.md](../architecture/data-modeling.md) section 11.

- **`orders.order_placed`**: Published upon initial persistence of a pending order.
  - Attributes: `order_id`, `order_number`, `customer_email`, `total_amount`, `currency`, `reservation_expires_at`.
- **`orders.order_paid`**: Published when payment is confirmed.
  - Attributes: `order_id`, `order_number`, `customer_email`, `total_amount`, `currency`, `paid_at`.
  - Consumers: `invoicing` (issue invoice), `notifications` (confirmation email), `shipping` (create pending shipment).
- **`orders.order_expired`**: Published when a pending order passes its reservation expiration window.
  - Attributes: `order_id`, `order_number`, `expired_at`.
  - Consumers: `catalog` (release allocated stock reservations).
- **`orders.order_cancelled`**: Published when an order is cancelled.
  - Attributes: `order_id`, `order_number`, `reason`, `cancelled_at`.
  - Consumers: `catalog` (release stock if unpaid), `payments` (trigger refund if paid), `notifications` (cancellation notice).
- **`orders.order_shipped`**: Published when order transitions to `shipped` following shipment dispatch.
  - Attributes: `order_id`, `order_number`, `customer_email`, `shipped_at`.

### 3.7 `idempotency_keys`

Stores order-placement results so a retried `POST /api/v1/orders` with the same `Idempotency-Key` returns the original response for 24 hours ([api-conventions.md](../architecture/api-conventions.md) section 8). Rows are written in the same transaction as the order.

| Column | Type | Rules |
|---|---|---|
| `key` | `uuid` | Primary key; client-generated `Idempotency-Key` |
| `request_hash` | `text` | Not null; SHA-256 of the canonical request body; a different body with the same key returns `422 idempotency_key_reused` |
| `order_id` | `uuid` | Not null; FK → `orders(id)` ON DELETE CASCADE |
| `response_status` | `integer` | Not null |
| `response_body` | `jsonb` | Not null; original response body **without** `tracking_token`; a retry recomputes the token from the key (section 2, Guest tracking) |
| `created_at` | `timestamptz` | Not null, default `now()` |
| `expires_at` | `timestamptz` | Not null; `created_at + 24 hours`; indexed for cleanup |

Only successful placements (`201`) are stored; failed requests store nothing and may be retried with the same key. Expired rows are deleted by a periodic cleanup.

The key is normalized to canonical lowercase UUID text before hashing, HMAC derivation, and locking. Because the tracking token is derived from the key, a key whose idempotency row has expired can never place a second order: its reuse returns `422 idempotency_key_reused` (detected through the retained `tracking_token_hash`). Clients generate a fresh UUID key for every new checkout attempt.

## 4. Open Items

- **Retention policy for orders:** Commercial and fiscal records in Colombia require long-term preservation (e.g. Código de Comercio art. 60 — 10 years, Estatuto Tributario art. 632). Confirm exact archiving policy with merchant's accountant.
- **Personal data retention and privacy policy:** Customer PII lifecycle (email, phone, address, national ID) under statutory Habeas Data (Ley 1581 de 2012).

## 5. Sources

- Código de Comercio de Colombia, art. 60 (libros y papeles de comercio): http://secretariasenado.gov.co/senado/basedoc/codigo_comercio.html
- Estatuto Tributario, art. 632 (deber de conservar informaciones y pruebas): http://secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr026.html
- Ley 1581 de 2012 (Protección de Datos Personales): http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html
- RFC 4648 / Douglas Crockford Base32 encoding: https://www.crockford.com/base32.html
- RFC 9562 (UUIDv7): https://www.rfc-editor.org/rfc/rfc9562.html
