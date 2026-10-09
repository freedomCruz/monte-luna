---
name: catalog-domain
description: "Trigger: catalog, product, variant, lot, stock, inventory, category, brand, origin, SKU, barcode, catálogo, inventario, lote, café. Apply catalog domain invariants, lot inventory, and pricing rules."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/catalog`, the `catalog` schema or migrations, HTTP endpoints, `/admin` screens, or domain events.

Do not use alone for cross-cutting workflows. Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`; `frontend-astro-islands` for storefront or `/admin` screens; `invoicing-taxes` when variant tax categories touch fiscal rules; `dependency-audit` before adding dependencies.

## Hard Rules

- Read `docs/domain/catalog.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; reference external entities strictly by plain `uuid`.
- Other modules access catalog exclusively through its root package `backend/internal/catalog`.
- Money stored as `bigint` minor units with `currency` (default `'COP'`).
- Primary keys are UUIDv7 (`id uuid PRIMARY KEY`).
- Optimistic locking with `version integer NOT NULL DEFAULT 1` on admin-edited tables (`WHERE version = $expected`).
- Products never hard-deleted; removal sets status to `'archived'`.
- Physical products only in v1. Product types and attribute definitions are dynamic; coffee and cacao are configurations.
- Roast level is a product attribute; presentation and grind are variant options.
- `JSONB` holds descriptive attributes only, validated in Go before writing.
- `compare_at_price_amount` must exceed `price_amount`.
- Stock tracked per variant and lot in `variant_lot_stock`.
- Composite FKs guarantee variants are stocked only from lots of their own product.
- Allocation picks oldest lot first (`production_date`), decrements atomically (`WHERE quantity >= $n`), and writes an `inventory_movements` row in the same transaction.
- Allocation reserved by `orders` for 30 minutes; cancellation or expiration calls release with reason `'release'`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Media storage location requested | Stop and ask user (pending: VPS disk vs object storage) |
| Food health or INVIMA rules needed | Stop and ask user (open item in domain doc) |
| Digital products requested | Reject; physical products only in v1 |
| Concurrent stock allocation | Atomic decrement on oldest lot; fallback to next lot if insufficient |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/catalog.md` and data modeling architecture sections.
2. Write failing tests first for critical invariants:
   - Concurrent allocation never oversells across lots.
   - Oldest lot allocated first by `production_date`.
   - Variant cannot link to lots of another product.
   - `compare_at_price_amount` <= `price_amount` rejected.
   - Stock release increments inventory with movement reason `'release'`.
   - Optimistic locking aborts when `version` mismatches.
3. Implement models in `domain/`, orchestration in `app/`, and sqlc repositories in `adapters/`.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Entities, ports, adapters, and migrations touched.
- Invariants covered by passing tests.
- Outbox events published or consumed.
- Open questions or pending decisions escalated to user.

## References

- `docs/domain/catalog.md` — Canonical catalog domain specifications.
- `docs/architecture/data-modeling.md` — Sections 3–9, 11 (data modeling, inventory, outbox).
- `docs/architecture/system-architecture.md` — Sections 4–5 (hexagonal design, module boundaries).
- `docs/domain/orders.md` — Section 2 (stock allocation and release contract).
