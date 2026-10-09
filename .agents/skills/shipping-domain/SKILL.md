---
name: shipping-domain
description: "Trigger: shipping, shipping zone, shipping rate, fulfillment, shipment, dispatch, delivery, DANE, envío, flete, transportadora, despacho. Apply shipping domain invariants, quote resolution, and fulfillment tracking."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/shipping`, the `shipping` schema or migrations, shipping zones, rates, fulfillment dispatch endpoints, or `/admin` shipping screens.

Do not use alone for checkout order workflows. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `frontend-astro-islands` for `/admin` fulfillment; `dependency-audit` before adding libraries.

## Hard Rules

- Read `docs/domain/shipping.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; shipments reference external entities by plain `uuid`.
- Other modules access shipping exclusively through root package `backend/internal/shipping`.
- Monetary amounts stored as `bigint` minor units with `currency` (default `'COP'`).
- Primary keys are UUIDv7 (`id uuid PRIMARY KEY`).
- Optimistic locking with `version integer NOT NULL DEFAULT 1` on admin-edited tables (`shipping_zones`, `shipping_rates`, `shipments`).
- Geographic resolution: 5-digit DANE municipality code in `shipping_zone_areas` strictly wins over 2-digit department match (`municipality_code IS NULL`).
- Partial unique indexes enforce that a municipality or department belongs to at most one zone.
- Weight bands within the same active zone must not overlap; validated in Go domain before persisting.
- Free-shipping threshold: if `free_shipping_threshold_amount IS NOT NULL` and order subtotal reaches it, shipping cost resolves to `0`; otherwise resolves to `price_amount`.
- Unserviceable destinations: if no active zone or rate covers destination and weight, shipping is unavailable and checkout is blocked.
- Central warehouse and one shipment per order in v1 (`UNIQUE (order_id)`).
- Manual dispatch: records `carrier_name`, `tracking_number`, optional `tracking_url`, sets status to `'shipped'`, `shipped_at = now()`, and emits `shipping.shipment_shipped`.
- Consumes `orders.order_paid` via `shipping.processed_events` to create a shipment with `status = 'pending'`.
- Carrier integrations and split shipments deferred post-v1; carrier adapters must sit behind a future `CarrierPort`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Carrier API integration | Reject; deferred post-v1 (manual dispatch in v1) |
| Split shipments | Reject; deferred post-v1 (one shipment per order) |
| Municipality vs department | Municipality rule strictly wins |
| Overlapping weight ranges | Reject in Go domain validation |
| Uncovered destination or weight | Return unserviceable result to block checkout |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/shipping.md` and data modeling architecture sections.
2. Write failing tests first for critical shipping invariants:
   - Municipality match wins over department fallback.
   - Overlapping weight bands for same zone are rejected.
   - Subtotal meeting threshold resolves to zero cost.
   - Uncovered destination or weight blocks checkout.
   - Consuming `orders.order_paid` creates pending shipment idempotently.
   - Manual dispatch sets `'shipped'` and emits `shipping.shipment_shipped`.
3. Implement `domain/`, `app/`, and `adapters/` packages.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Shipping services, ports, adapters, and migrations.
- Invariants covered by passing tests.
- Domain events published and consumed.
- Deferred items or geographic ambiguities escalated to user.

## References

- `docs/domain/shipping.md` — Canonical shipping specifications.
- `docs/architecture/data-modeling.md` — Sections 3, 4, 8, 11 (data modeling, outbox).
- `docs/architecture/system-architecture.md` — Sections 4–5 (hexagonal design, boundaries).
- `docs/domain/orders.md` — Checkout quote and shipment contracts.
