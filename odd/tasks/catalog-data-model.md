# Catalog Data Model Proposal

## Goal and scope

Record approvals (identity module, origin entity, per-lot stock option A) and propose the concrete `catalog` table design for user approval.

Changed: `docs/architecture/system-architecture.md` (identity module, auth owner), `docs/architecture/data-modeling.md` section 9 (stock per variant and lot, oldest lot first), `docs/domain/catalog.md` (status, requirements, proposed data model).

No migrations, code, dependencies, or commits until the model is approved.

## Tasks

- [x] T1 — Record approvals and write the proposed model.
- [x] T2 — Independent read-only verification against conventions and PostgreSQL behavior.
  - Result: FAIL with three blocking issues, all fixed: missing indexes on `product_images (variant_id, product_id)` and `variant_lot_stock (lot_id, product_id)`; ambiguous FK in `inventory_movements` (now composite FK to `variant_lot_stock`); unstated order-line lot snapshot (now section 2 and section 3.11 contract with `orders`). Suggestions applied: explicit uuid PK and category index on `product_categories`, version on image tables, CHECK constraints on `attribute_definitions`, storefront roast date from the oldest lot with stock. PostgreSQL validity of composite FKs and jsonb UNIQUE confirmed.
- [ ] T3 — Present to user; after approval, write the `catalog` domain skill and the first migrations.

## Open questions for the user

- Confirm price per variant.
- Media storage location.
- Stock reservation strategy (orders design).
