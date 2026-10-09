---
name: promotions-domain
description: "Trigger: promotions, promotion, coupon, discount, voucher, code, promo, cupón, descuento, promoción. Apply promotions domain invariants, coupon validation, and usage limits."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/promotions`, the `promotions` schema or migrations, coupon validation endpoints, `/admin` coupon screens, or promotion lifecycle events.

Do not use alone for order quote calculation. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `frontend-astro-islands` for storefront coupon input or `/admin` screens; `dependency-audit` before adding dependencies.

## Hard Rules

- Read `docs/domain/promotions.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; order references use plain `uuid`.
- Access promotions exclusively through `backend/internal/promotions`.
- Primary keys UUIDv7. Optimistic locking with `version integer NOT NULL DEFAULT 1` on `coupons`.
- Code-only coupons in v1; automatic promotions and cart rules excluded.
- At most one coupon per order (`UNIQUE (order_id)`); stacking forbidden.
- Coupon codes case-insensitive on input, stored uppercase: `CHECK (code = upper(code) AND code ~ '^[A-Z0-9-]{4,32}$')`.
- Catalog compare-at prices are catalog concerns; coupons apply directly on active variant prices.
- Coupon types: `percentage` (1–10,000 bps, optional cap `max_discount_amount`) on merchandise subtotal before tax/shipping; `free_shipping` sets shipping discount to shipping cost.
- Validity: half-open `[starts_at, ends_at)`, subtotal minimum, total limit (`max_total_uses`), and per-email limit on non-released redemptions (`status IN ('reserved','confirmed')`).
- Lifecycle: quote validates read-only; placement atomically increments `uses_count` and reserves redemption; `orders.order_paid` confirms; `orders.order_expired` or unpaid cancellation releases and decrements counter.
- Late payment honors quoted discount even if coupon expired or capped post-expiry.
- Multi-line proportional allocation: discount allocated proportionally across lines; rounding remainder goes to largest line subtotal.

## Decision Gates

| Situation | Action |
| --- | --- |
| Automatic promotions without code | Reject; coupons only in v1 |
| Multiple stacked coupons per checkout | Reject; at most one coupon per order |
| Line-item or category coupon targeting | Stop and ask user (not specified in v1 domain doc) |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/promotions.md` and related architecture sections.
2. Write failing tests first for critical promotions invariants:
   - Atomic reservation never exceeds `max_total_uses` under concurrent placement.
   - Per-email usage limit rejects duplicate redemptions across non-released records.
   - Expired or out-of-window coupon rejected by validation.
   - Order subtotal below `min_order_amount` rejects coupon application.
   - Percentage discount cap enforces ceiling on large subtotals.
   - Consuming `orders.order_paid` confirms; `orders.order_expired` releases and decrements counter.
   - Stacking attempt rejected (`UNIQUE (order_id)`).
3. Implement `domain/`, `app/`, and `adapters/` packages.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Entities, services, ports, adapters, and migrations touched.
- Invariants covered by passing tests (concurrency, limits, lifecycle).
- Outbox events emitted (`promotions.coupon_redeemed`) and consumed.
- Unspecified coupon scopes escalated to user.

## References

- `docs/domain/promotions.md` — Canonical promotions specifications.
- `docs/architecture/data-modeling.md` — Sections 3, 11 (data modeling, outbox).
- `docs/architecture/system-architecture.md` — Hexagonal design and boundaries.
- `docs/domain/orders.md` — Checkout quote, placement reservation, and event contracts.
