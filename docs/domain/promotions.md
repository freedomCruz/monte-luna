# Promotions Domain

Canonical requirements and data model for the `promotions` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Dedicated module (`internal/promotions`, schema `promotions`) | Approved |
| Coupons only (merchant-issued codes; no automatic promotions in v1) | Approved |
| One coupon per order | Approved |
| Coupon types: `percentage` (with optional cap) and `free_shipping` | Approved |
| Uppercase code constraint (`^[A-Z0-9-]{4,32}$`) | Approved |
| Validation rules: date window, minimum order amount, total uses, per-email limit | Approved |
| Two-phase redemption lifecycle (`reserved` at placement, `confirmed` at payment, `released` on expiry/cancel) | Approved |
| Atomic usage counter updates with concurrency protection | Approved |
| Multi-line proportional discount allocation (remainder on largest line) | Approved |
| Late-payment promotion policy (honor quoted discount) | Approved |
| Separation from catalog reference prices (`compare_at_price_amount`) | Approved |
| Data model (section 3) | Approved |

## 2. Approved Requirements

**Module responsibility and scope**
- Resides in `internal/promotions` with isolated PostgreSQL schema `promotions`.
- Owns coupon definitions, eligibility validation, discount calculation, redemption reservations, and usage limits.
- Exposes synchronous evaluation and reservation APIs consumed by `orders` during checkout quote calculation and order placement.
- Consumes order lifecycle events (`orders.order_paid`, `orders.order_expired`, `orders.order_cancelled`) via the transactional outbox to transition redemptions and maintain usage counters.

**Promotion mechanisms and storefront behavior**
- **Coupons only:** In v1, promotions are triggered exclusively by customer-entered coupon codes. Automatic site-wide or category-wide promotion campaigns are excluded from v1.
- **Single coupon per order:** A checkout order may apply at most one coupon. Stacking multiple coupons is strictly prohibited.
- **Independence from catalog reference prices:** Variants in `catalog` support an optional `compare_at_price_amount` (e.g. crossed-out prices on product cards). Coupons apply directly on top of the active variant price. Catalog promotional pricing and coupon discounts operate independently without conflict.
- **Code formatting:** Coupon codes are case-insensitive on input, normalized to uppercase, and stored strictly in uppercase alphanumeric characters and hyphens, between 4 and 32 characters (`CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{4,32}$')`).

**Supported coupon types**
1. **`percentage`:**
   - Discount percentage specified in basis points (`percentage_bps` between 1 and 10,000; e.g. 1,000 = 10%, 2,500 = 25%).
   - Optional maximum discount cap (`max_discount_amount` in minor units `bigint > 0`). When the computed percentage discount exceeds `max_discount_amount`, the discount is capped at that amount.
   - **Scope:** Computed strictly on the merchandise subtotal (`orders.subtotal_amount`) before shipping and taxes.
   - **Line allocation rule:** The total discount is allocated proportionally across order lines based on each line's subtotal (`quantity * unit_price_amount`). To prevent minor-unit rounding discrepancies, any residual integer difference is assigned to the line with the largest monetary subtotal.
2. **`free_shipping`:**
   - Sets the order's shipping discount (`orders.shipping_discount_amount`) equal to the evaluated shipping cost (`orders.shipping_amount`).
   - The merchandise subtotal and item prices remain unaffected.

**Eligibility and usage rules**
- **Validity period:** Half-open time window `[starts_at, ends_at)`. The coupon is valid if `now() >= starts_at` and (`ends_at IS NULL OR now() < ends_at`).
- **Minimum order amount:** `min_order_amount` evaluated strictly against the merchandise subtotal (`subtotal_amount`), excluding shipping costs and taxes.
- **Total usage limit:** `max_total_uses` (positive integer or null for unlimited). Enforced atomically via `uses_count`.
- **Per-customer usage limit:** `max_uses_per_email` (defaults to 1; positive integer or null for unlimited). Enforced against normalized lowercase customer email (`customer_email = lower(customer_email)`), counting all non-released redemptions (`status IN ('reserved', 'confirmed')`).
- **Lifecycle status:** `active`, `paused`, `archived`. Only coupons with status `'active'` can be quoted or reserved.

**Validation and redemption lifecycle**
1. **Checkout quote (Validate & Compute):**
   - The storefront requests a checkout quote from `orders`.
   - `orders` calls `promotions.ValidateCoupon(...)` with the code, customer email, subtotal, and shipping cost.
   - `promotions` verifies coupon status, date window, minimum order threshold, global remaining capacity, and email usage limit.
   - Returns the computed discount amount and type. This step is read-only; no database rows are created or mutated.
2. **Order placement (Reserve):**
   - When the customer confirms order placement, `orders` calls `promotions.ReserveCoupon(...)`.
   - In a single SQL transaction within `promotions`:
     - The usage counter is atomically incremented:
       ```sql
       UPDATE promotions.coupons
       SET uses_count = uses_count + 1, updated_at = now()
       WHERE id = $1
         AND status = 'active'
         AND (max_total_uses IS NULL OR uses_count < max_total_uses)
       RETURNING id;
       ```
       If zero rows are returned, reservation fails due to exhausted total uses.
     - A redemption record is inserted into `promotions.coupon_redemptions` with `status = 'reserved'`.
3. **Payment confirmation (Confirm):**
   - Upon receiving `orders.order_paid`, `promotions` updates the redemption record:
     ```sql
     UPDATE promotions.coupon_redemptions
     SET status = 'confirmed', updated_at = now()
     WHERE order_id = $1 AND status = 'reserved';
     ```
4. **Order expiration or cancellation before payment (Release):**
   - Upon receiving `orders.order_expired` or `orders.order_cancelled` for an unpaid order, `promotions`:
     - Updates the redemption to `status = 'released'`.
     - Decrements the usage counter:
       ```sql
       UPDATE promotions.coupons
       SET uses_count = uses_count - 1, updated_at = now()
       WHERE id = $1 AND uses_count > 0;
       ```
5. **Late-payment promotion policy:**
   - When a late payment arrives after an order transitioned to `expired`, `orders` attempts to re-allocate inventory.
   - For the promotion: `orders` requests `promotions` to re-reserve the coupon redemption if still active and within limits.
   - If the coupon has since expired, paused, or reached its limit, **the order keeps the discount it was originally quoted**.
   - **Decision rationale:** The customer authorized and paid the exact minor-unit total quoted at checkout. Revoking the discount post-payment would produce a financial discrepancy between the payment capture amount and the order ledger.

## 3. Approved Data Model (schema `promotions`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on admin-edited tables (marked ✎) for optimistic locking.

```text
coupons ✎ ──< coupon_redemptions (one-to-one with orders, plain order_id)

processed_events (outbox consumer deduplication)

outbox (transactional events)
```

### 3.1 `coupons` ✎

Defines promotional discount coupons created by store administrators.

| Column | Type | Rules |
|---|---|---|
| `code` | `text` | Not null; `UNIQUE`; uppercase alphanumeric and hyphen, `CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{4,32}$')` |
| `description` | `text` | Nullable; internal or customer-facing description |
| `discount_type` | `text` | Not null; `CHECK (discount_type IN ('percentage','free_shipping'))` |
| `percentage_bps` | `integer` | Nullable; required iff `percentage`, `CHECK ((discount_type = 'percentage' AND percentage_bps BETWEEN 1 AND 10000) OR (discount_type != 'percentage' AND percentage_bps IS NULL))` |
| `max_discount_amount` | `bigint` | Nullable; `CHECK (max_discount_amount IS NULL OR max_discount_amount > 0)` |
| `min_order_amount` | `bigint` | Nullable; evaluated against merchandise subtotal; `CHECK (min_order_amount IS NULL OR min_order_amount > 0)` |
| `currency` | `text` | Not null, default `'COP'`; `CHECK (currency ~ '^[A-Z]{3}$')` |
| `starts_at` | `timestamptz` | Not null; inclusive start timestamp |
| `ends_at` | `timestamptz` | Nullable; exclusive end timestamp; `CHECK (ends_at IS NULL OR ends_at > starts_at)` |
| `max_total_uses` | `integer` | Nullable; open-ended when null; `CHECK (max_total_uses IS NULL OR max_total_uses > 0)` |
| `max_uses_per_email` | `integer` | Nullable, default `1`; `CHECK (max_uses_per_email IS NULL OR max_uses_per_email > 0)` |
| `uses_count` | `integer` | Not null, default `0`; `CHECK (uses_count >= 0)` |
| `status` | `text` | Not null, default `'active'`; `CHECK (status IN ('active','paused','archived'))` |

Indexes:
- `UNIQUE (code)` for case-normalized code lookups.
- Index: `(status, starts_at, ends_at)` for coupon validation queries.

### 3.2 `coupon_redemptions`

Tracks individual coupon reservations and confirmations tied to orders.

| Column | Type | Rules |
|---|---|---|
| `coupon_id` | `uuid` | FK → `coupons(id)` ON DELETE RESTRICT; indexed |
| `order_id` | `uuid` | Not null; plain `orders.orders(id)` identifier (no cross-schema FK); `UNIQUE` |
| `customer_email` | `text` | Not null; lowercase email snapshot, `CHECK (customer_email = lower(customer_email))` |
| `discount_amount` | `bigint` | Not null, default `0`; merchandise discount in minor units; `CHECK (discount_amount >= 0)` |
| `shipping_discount_amount` | `bigint` | Not null, default `0`; shipping discount in minor units; `CHECK (shipping_discount_amount >= 0)` |
| `status` | `text` | Not null; `CHECK (status IN ('reserved','confirmed','released'))` |

Table constraints:
- `CHECK (discount_amount > 0 OR shipping_discount_amount > 0)`

Indexes:
- `UNIQUE (order_id)`: guarantees at most one coupon redemption per order.
- Index: `(coupon_id, customer_email)`: for fast evaluation of customer usage against `max_uses_per_email`.

### 3.3 Domain Events (schema `promotions.outbox`)

Outbox table and consumer tracking follow [data-modeling.md](../architecture/data-modeling.md) section 11.

- **`promotions.coupon_redeemed`**: Emitted when a redemption transitions to `confirmed`.
  - Attributes: `redemption_id`, `coupon_id`, `order_id`, `customer_email`, `discount_amount`, `shipping_discount_amount`, `confirmed_at`.

**Consumed Events:**
- `orders.order_paid`: Transitions matching `coupon_redemptions` row from `reserved` to `confirmed`.
- `orders.order_expired`: Transitions matching `coupon_redemptions` row from `reserved` to `released` and decrements `coupons.uses_count`.
- `orders.order_cancelled`: If the order was unpaid, transitions `coupon_redemptions` to `released` and decrements `coupons.uses_count`.

## 4. Open Items

None. All coupon, discount, and redemption requirements are approved for v1.

## 5. Sources

- RFC 9562 (UUIDv7): https://www.rfc-editor.org/rfc/rfc9562.html
- Transactional Outbox Pattern: https://microservices.io/patterns/data/transactional-outbox.html
