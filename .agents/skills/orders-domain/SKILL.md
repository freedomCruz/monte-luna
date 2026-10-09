---
name: orders-domain
description: "Trigger: orders, order, checkout, cart, quote, order number, line snapshot, order status, pedido, orden, compra. Apply orders domain invariants, stock reservation hold, and order lifecycle."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/orders`, the `orders` schema or migrations, checkout or quote endpoints, `/admin` order screens, or order domain events.

Do not use alone for checkout workflows. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `frontend-astro-islands` for checkout or `/admin`; `invoicing-taxes` for tax snapshots; `dependency-audit` before adding dependencies.

## Hard Rules

- Read `docs/domain/orders.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; foreign entities use plain `uuid`.
- Access orders exclusively through root package `backend/internal/orders`.
- Money stored as `bigint` minor units with `currency` (default `'COP'`). Primary keys are UUIDv7 (`id uuid PRIMARY KEY`).
- Optimistic locking with `version integer NOT NULL DEFAULT 1` on admin-edited `orders`.
- Guest checkout only. Cart in browser localStorage; browser never decides prices, taxes, or discounts.
- Server-side quote composes `catalog` (pricing, stock), `shipping` (rates), `promotions` (coupons), and `TaxCalculator`.
- Placement generates UUIDv7 and random Crockford base32 `order_number`.
- Placement allocates catalog stock (oldest lot first, 30-minute hold); persistence failure triggers compensating release.
- In-flight payment extends hold up to 2-hour hard ceiling. Expiration releases stock via `orders.order_expired`.
- Late payment on expired order re-allocates stock: transitions to `'paid'` if available, or cancels (reason `'late_payment_no_stock'`) to trigger refund.
- Statuses: `pending_payment`, `paid`, `preparing`, `shipped`, `delivered`, `cancelled`, `expired`. Transitions recorded in `order_status_history`.
- Immutable snapshots: `order_lines`, `order_line_lot_allocations`, `order_shipping_addresses`, `fiscal_profile_snapshot`.
- Total CHECK: `total_amount = subtotal_amount - discount_amount + shipping_amount - shipping_discount_amount + tax_amount`.
- Merchandise discount allocated proportionally; rounding remainder goes to largest line subtotal.
- Tracking token (≥ 32 bytes) stored as SHA-256 hash (`tracking_token_hash`); authorized server-side.

## Decision Gates

| Situation | Action |
| --- | --- |
| Order and fiscal data retention | Stop and ask user (open item in domain doc) |
| Personal data retention (Ley 1581) | Stop and ask user (open item in domain doc) |
| Customer accounts or registration | Reject; deferred (guest checkout only) |
| Client-side price or discount submission | Reject; quote is strictly server-side |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/orders.md` and data modeling architecture.
2. Write failing tests first for critical orders invariants:
   - Concurrent placement never oversells lots.
   - Persistence failure triggers compensating release.
   - In-flight payment grace caps at 2-hour ceiling.
   - Expired order with late payment re-allocates or cancels with refund.
   - Proportional discount rounding remainder goes to largest line.
   - Total CHECK formula holds with discounts.
   - Tracking token authorizes by SHA-256 hash only.
   - State transitions write `order_status_history`.
3. Implement `domain/`, `app/`, and `adapters/` packages.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Entities, ports, adapters, and migrations touched.
- Invariants covered by passing tests.
- Outbox events published or consumed.
- Open retention items escalated to user.

## References

- `docs/domain/orders.md` — Canonical orders specifications.
- `docs/architecture/data-modeling.md` — Data modeling and outbox.
- `docs/architecture/system-architecture.md` — Hexagonal design and boundaries.
- `docs/architecture/invoicing-and-taxes.md` — Tax calculation and snapshot.
- `docs/domain/catalog.md`, `docs/domain/payments.md`, `docs/domain/promotions.md` — Contracts.
