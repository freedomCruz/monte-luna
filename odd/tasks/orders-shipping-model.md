# Orders and Shipping Domain Models

## Goal and scope

Document the approved `orders` and `shipping` data models, remove the `cart` module, and add the `release` inventory movement reason to the catalog.

Approved decisions (2026-10-08):
1. Cart lives in the browser; `orders` computes a checkout quote by calling `catalog` (prices, stock), `shipping` (rate), and the `TaxCalculator`. The `internal/cart` module and `cart` schema are removed.
2. Stock is allocated (oldest lot first) when the order is placed and held 30 minutes; expired orders release it.
3. Shipping v1: merchant-configured rates by zone (DANE department or municipality) and weight band, free-shipping threshold, manual dispatch with tracking number entered in admin.
4. Shipping is its own module `internal/shipping`; orders snapshot the applied shipping cost and rate name.
5. Orders model: `orders` ✎, `order_lines`, `order_line_lot_allocations`, `order_shipping_addresses`, `order_status_history`, `outbox`, `processed_events`. Random short order number. Statuses: `pending_payment`, `paid`, `preparing`, `shipped`, `delivered`, `cancelled`, `expired`.
6. Shipping model: `shipping_zones` ✎, `shipping_zone_areas`, `shipping_rates` ✎, `shipments` ✎, `outbox`, `processed_events`.
7. Catalog `inventory_movements.reason` gains `release`.

Open: payment arriving after reservation expiry (decide with `payments`); discount detail (`promotions`).

## Tasks

- [x] T1 — Write `docs/domain/orders.md` and `docs/domain/shipping.md`; update `catalog.md`, `system-architecture.md`, `data-modeling.md`, and `AGENTS.md`. (Completed: domain docs authored and canonical references aligned)
- [x] T2 — Read-only consistency check.
  - Result: no remaining `internal/cart` or "active offers" references in docs, skills, or `AGENTS.md`; catalog reason CHECK includes `release`; `AGENTS.md` links resolve.
- [x] T3 — Commit and report.

## Verification and delivery

- TDD: not applicable; documentation only.
- Commit: authorized by the user on 2026-10-08.
