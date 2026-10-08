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
| Payment arriving after reservation expiry | Open Item |
| Detailed discount breakdown by promotions | Open Item |
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
- A periodic background expiry worker checks for orders where `status = 'pending_payment' AND reservation_expires_at <= now()`.
- Expired orders transition to `status = 'expired'`, write an entry to `order_status_history`, and publish `orders.order_expired`.
- The `catalog` module handles stock release upon receiving `orders.order_expired` (or via reconciliation), inserting an `inventory_movements` record with reason `'release'`.

**Payment confirmation**
- When payment succeeds, `payments` emits a payment confirmation event consumed by `orders`.
- `orders` transitions status from `pending_payment` to `paid`, sets `paid_at = now()`, records the transition in `order_status_history`, and emits `orders.order_paid`.
- `orders.order_paid` is consumed by:
  - `invoicing`: to issue the electronic invoice or fiscal receipt from the immutable tax snapshot.
  - `notifications`: to email the order confirmation and tracking link to the buyer.
  - `shipping`: to initialize a fulfillment shipment in `pending` status.

**Guest tracking and security**
- Every order generates a cryptographically secure random tracking token (at least 32 bytes).
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
- Once in a terminal status (`delivered`, `cancelled`, `expired`), no further transitions are allowed.
- Every status transition is validated in the Go domain and recorded in `order_status_history`.
- Status `shipped` is set when `shipping` publishes `shipping.shipment_shipped`.

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
| `discount_amount` | `bigint` | Not null, default `0`; `CHECK (discount_amount >= 0)` |
| `shipping_amount` | `bigint` | Not null; `CHECK (shipping_amount >= 0)` |
| `tax_amount` | `bigint` | Not null; `CHECK (tax_amount >= 0)` |
| `total_amount` | `bigint` | Not null; `CHECK (total_amount >= 0)` |
| `shipping_rate_name` | `text` | Not null; snapshot of applied shipping rate name |
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
- `CHECK (total_amount = subtotal_amount - discount_amount + shipping_amount + tax_amount)`

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
| `product_title` | `text` | Not null; snapshot of product name |
| `variant_label` | `text` | Not null; snapshot of variant options (e.g. "250 g / Whole Bean") |
| `unit_price_amount` | `bigint` | Not null; `CHECK (unit_price_amount > 0)` |
| `quantity` | `integer` | Not null; `CHECK (quantity > 0)` |
| `discount_amount` | `bigint` | Not null, default `0`; `CHECK (discount_amount >= 0)` |
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

## 4. Open Items

- **Payment arriving after reservation expiry:** When an asynchronous webhook confirms payment for an order that has already transitioned to `expired`, decide coordination with `payments`: attempt immediate re-allocation in `catalog` if stock exists; if insufficient stock remains, trigger an automated refund.
- **Detailed discount breakdown:** Allocation of multi-line or coupon discounts across order lines once `promotions` module is defined.
- **Retention policy for orders:** Commercial and fiscal records in Colombia require long-term preservation (e.g. Código de Comercio art. 60 — 10 years, Estatuto Tributario art. 632). Confirm exact archiving policy with merchant's accountant.
- **Personal data retention and privacy policy:** Customer PII lifecycle (email, phone, address, national ID) under statutory Habeas Data (Ley 1581 de 2012).

## 5. Sources

- Código de Comercio de Colombia, art. 60 (libros y papeles de comercio): http://secretariasenado.gov.co/senado/basedoc/codigo_comercio.html
- Estatuto Tributario, art. 632 (deber de conservar informaciones y pruebas): http://secretariasenado.gov.co/senado/basedoc/estatuto_tributario_pr026.html
- Ley 1581 de 2012 (Protección de Datos Personales): http://www.secretariasenado.gov.co/senado/basedoc/ley_1581_2012.html
- RFC 4648 / Douglas Crockford Base32 encoding: https://www.crockford.com/base32.html
- RFC 9562 (UUIDv7): https://www.rfc-editor.org/rfc/rfc9562.html
