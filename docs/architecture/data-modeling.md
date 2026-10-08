# Data Modeling Conventions

Canonical rules for designing, evolving, and querying the PostgreSQL database. Every module schema must follow them. Concrete table designs are defined per module in later documents and must comply with this one.

Related documents:
- System architecture: [system-architecture.md](system-architecture.md)
- Infrastructure limits: [infrastructure.md](infrastructure.md)
- Invoicing and taxes: [invoicing-and-taxes.md](invoicing-and-taxes.md)

## 1. Status

| Item | Status |
|---|---|
| Engine: PostgreSQL 18 | Approved |
| Conventions in sections 2–13 | Approved |
| Concrete table design per schema | Pending (Phase 3 in progress) |
| Migration tool: `goose` | Approved |
| Outbox operating values (section 11) | Approved |

## 2. Normalization Policy

- **Default:** normalize to third normal form (3NF) within each module. Each fact is stored in one place.
- **Deviations must be deliberate and documented.** Accepted cases:

| Case | Rule |
|---|---|
| Order line snapshots | Orders copy product name, SKU, and unit price at purchase time. This records a historical fact; it is not a copy of live catalog data. |
| Variable descriptive attributes | Stored in `JSONB` (see section 5) instead of entity-attribute-value (EAV) tables or many nullable columns. |
| Cross-module reports | Served by read models fed by domain events, never by joins across schemas. |

## 3. Identifiers

- **Primary keys:** `uuid` columns holding **UUIDv7** values. They are time-ordered, so inserts append to the end of the B-tree index instead of writing to random pages.
- **Generation:** in Go (`uuid.NewV7()`) or in PostgreSQL with the native `uuidv7()` function.
- **UUIDs are not security tokens.** A UUIDv7 reveals its creation time (millisecond precision), and RFC 9562 states that UUIDs must not be used as capabilities.
  - Public links that grant access (guest order tracking, password reset, email verification) use a **separate random token** stored in its own column.
  - Authorization is always checked server-side, regardless of how hard an identifier is to guess.
- **Business keys:** human-facing identifiers (`slug`, `sku`) have their own `UNIQUE` constraints.
- **Integer surrogate keys**, if ever needed, use `GENERATED ... AS IDENTITY`, never `serial`.

## 4. Data Type and SQL Conventions

| Use | Avoid | Reason |
|---|---|---|
| `timestamptz` | `timestamp` without time zone | Stores an actual point in time. |
| `text` plus `CHECK` constraints | `varchar(n)` by default, `char(n)` | No performance difference; `CHECK` can validate format, not only length. |
| `bigint` amount in minor currency units plus a `currency` column | `money`, floating-point types | `money` depends on locale settings and stores no currency. `bigint` maps to Go `int64` without a decimal library. |
| `snake_case`, lowercase names | Mixed-case or quoted names | PostgreSQL folds unquoted names to lowercase. |
| `NOT EXISTS (...)` | `NOT IN (SELECT ...)` | `NOT IN` returns no rows when a `NULL` is present and optimizes poorly. |
| Half-open ranges: `>= start AND < end` | `BETWEEN` on timestamps | `BETWEEN` includes both ends and double-counts boundary values. |

Every mutable table includes `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()`.

## 5. JSONB Policy

`JSONB` holds **descriptive, variable attributes only** (for example: grind, roast, origin, material, honey variety).

- **Promote to a typed column** any attribute that affects money, logistics, stock, or frequent filtering. Example: product weight determines shipping cost, so `weight_grams integer NOT NULL CHECK (weight_grams > 0)` is a column, not a JSON key.
- **Keep documents small.** Updating a `JSONB` value locks the whole row.
- **Query with containment** so indexes apply: `attributes @> '{"grind": "whole_bean"}'`. Expressions such as `attributes->>'grind' = '...'` do not use a GIN index on the column.
- **Index** with `GIN (attributes jsonb_path_ops)` when filtering by attributes is required. This operator class supports `@>`, `@?`, and `@@` only.
- **Validate** allowed keys and value types in the Go domain layer before writing.

## 6. Indexing

- Primary keys: B-tree on UUIDv7 (automatic).
- Business keys: unique B-tree on `slug` and `sku`.
- **Foreign key columns within a module must be indexed explicitly.** PostgreSQL does not create these indexes automatically.
- **Partial indexes** for hot subsets, for example the public catalog: `WHERE status = 'published'`.
- GIN on `JSONB` only where attribute filtering is required.
- Every index adds cost to each insert and update. Add an index for a known query, not "just in case".

## 7. Module Boundaries in the Database

- **One schema per module:** `catalog`, `cart`, `orders`, `payments`, `promotions`, `identity`, `notifications`, and others as modules are added.
- **Foreign keys are allowed and encouraged within a module** (for example `orders.order_items.order_id` → `orders.orders.id`).
- **Foreign keys and joins across schemas are prohibited.** A module stores the other module's identifier as a plain `uuid` column.
- **Cross-module reads** use one of:
  - **API composition:** the Go use case calls each module's exported interface and combines results.
  - **Read models:** a dedicated table updated from domain events, for reports that are too expensive to compose.
- **Access enforcement:** start with a single application database role plus automated Go import checks. Per-module roles with `GRANT`s are a stricter future option; they require separate connection pools.
- **Schema hygiene:** the application role does not own the database; `CREATE` is revoked on the `public` schema; queries use schema-qualified names.

## 8. Lifecycle and History

- **Products are never hard-deleted.** Removal from sale uses the `archived` status. Order snapshots keep history intact regardless of catalog changes.
- **Optimistic locking:** tables edited from the admin panel include `version integer NOT NULL DEFAULT 1`. Updates include `WHERE version = $expected`; zero affected rows means a conflicting edit, which is reported to the user instead of silently overwritten.

## 9. Inventory

- **Stock counter per variant and lot**, decremented atomically: `UPDATE ... SET quantity = quantity - $n WHERE id = $id AND quantity >= $n`. Zero affected rows means insufficient stock in that lot.
- **Available stock of a variant** is the sum of its lot counters; zero means out of stock.
- **Allocation takes the oldest lot first** (earliest production date, which for coffee is the roast date). A sale spanning several lots records each lot and quantity, so every sold unit is traceable.
- **Movement ledger:** every stock change also inserts a row into an `inventory_movements` table **in the same transaction**, recording quantity, reason, and reference. The counter answers "how many now"; the ledger answers "why".

## 10. Statuses and Reference Data

- **System-defined states** (order, payment, and product lifecycle): `text` column with a `CHECK (status IN (...))` constraint. PostgreSQL enums make removing a value difficult.
- **Merchant-managed data** (categories, collections): regular tables.

## 11. Domain Events: Transactional Outbox

Cross-module side effects with business consequences use a **transactional outbox**. This replaces an in-memory-only event bus, which loses events if the process stops between committing data and publishing.

**Write side**
- Each module owns an outbox table in its own schema (for example `payments.outbox`).
- The event row is inserted **in the same transaction** as the business change. Both are committed, or neither is.

**Relay**
- A goroutine inside the same Go binary reads pending events, dispatches them to subscribers, and marks them as delivered.
- Rows are claimed with `SELECT ... FOR UPDATE SKIP LOCKED` so concurrent relays never process the same row.
- `LISTEN/NOTIFY` may be used to wake the relay immediately instead of waiting for the next poll (optional).
- Delivered events are deleted periodically.

**Consumers**
- Delivery is **at least once**, so every consumer must be idempotent.
- Each consumer records processed event IDs in its own schema (for example `orders.processed_events`), inside the same transaction as its state change. A duplicate insert means the event was already handled.
- Incoming payment webhooks are also deduplicated by the provider's event identifier, because providers retry deliveries.

**Scope**

| Effect | Mechanism |
|---|---|
| Cross-module effect with business consequences (payment → order, order → email, order → invoice) | Outbox |
| Cache invalidation | Direct in-memory call; a lost invalidation is harmless because the cache starts empty after a restart |
| Rules within a single module | The same SQL transaction; no event needed |

**Operating values** (configurable; defaults below)

| Parameter | Default | Rationale |
|---|---|---|
| Relay polling interval | 1 second, batches of up to 100 events | Near-immediate delivery; one indexed query per second on pending rows is negligible at this scale |
| Retention of delivered events | 7 days | Matches the NServiceBus outbox default for deduplication data; enough time to investigate incidents |
| Cleanup job | Every hour, deleting in batches | Keeps tables small without constant deletes at this volume |
| Retention of `processed_events` | 7 days | Duplicate deliveries happen shortly after delivery, not weeks later |
| Retention of payment webhook deduplication records | 30 days | Providers may retry for days; confirm against the selected payment gateway's retry window |
| Failed events | Retried with increasing backoff up to a maximum number of attempts, then marked failed and shown in the admin panel; never deleted automatically | A payment without its order must never disappear silently |

References: NServiceBus SQL persistence outbox (7-day deduplication retention, cleanup every minute by default); MassTransit Entity Framework outbox (`QueryDelay` default 10 seconds).

**Microservices path:** if a module is extracted, it keeps writing to its outbox unchanged; only the relay changes to publish to a message broker.

## 12. Schema Evolution

- Migrations are versioned `goose` SQL files, also used by `sqlc` as schema input. **An applied migration is never edited**; every change is a new migration.
- **Migrations are organized per module**, so each module can be extracted with its own history:
  - Location: `backend/internal/<module>/adapters/postgres/migrations/`; that module's sqlc queries live in `backend/internal/<module>/adapters/postgres/queries/`.
  - Each module has its own goose version table inside its schema (for example `catalog.goose_db_version`), configured with goose's table-name option.
  - The migration runner creates the module schema (`CREATE SCHEMA IF NOT EXISTS <module>`) before running that module's migrations, because the version table lives in it.
  - Modules migrate independently; there are no cross-schema dependencies to order.
- **Breaking changes use expand → migrate → contract:**
  1. Expand: add the new column or table without removing the old one.
  2. Migrate: the application writes to both and data is backfilled.
  3. Contract: remove the old structure once nothing depends on it.
- Indexes on populated tables are created with `CREATE INDEX CONCURRENTLY`, which cannot run inside a transaction block. Such migrations use the `-- +goose NO TRANSACTION` annotation and contain nothing else.

## 13. Tax, Fiscal, and Settlement Data

Detailed rules in [invoicing-and-taxes.md](invoicing-and-taxes.md). Data implications:

- **Variants** store a `tax_category` (`excluded`, `exempt`, `reduced`, `standard`) as `text` with a `CHECK` constraint. It is a plain code with no cross-schema reference.
- **Rates, tax units (UVT), and thresholds** are dated rows in the `invoicing` schema, with rates in basis points. No tax value is hard-coded.
- **Order lines** snapshot the tax category, code, rate, taxable base, and tax amount; orders snapshot totals, the merchant fiscal profile values in force, and the buyer's fiscal data.
- **Withholdings** are never stored on orders or invoices. They live in `payments` settlement records: gross amount, provider fee, each withholding as reported by the provider, and net amount.

## 14. Sources

- PostgreSQL versioning policy: https://www.postgresql.org/support/versioning/
- PostgreSQL UUID functions: https://www.postgresql.org/docs/current/functions-uuid.html
- PostgreSQL JSON types and indexing: https://www.postgresql.org/docs/current/datatype-json.html
- PostgreSQL constraints (foreign key indexing): https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL schemas and secure usage patterns: https://www.postgresql.org/docs/current/ddl-schemas.html
- PostgreSQL wiki, "Don't Do This": https://wiki.postgresql.org/wiki/Don%27t_Do_This
- RFC 9562, UUIDs (section 8, security considerations): https://www.rfc-editor.org/rfc/rfc9562.html
- Transactional outbox pattern: https://microservices.io/patterns/data/transactional-outbox.html
- Database per service pattern: https://microservices.io/patterns/data/database-per-service.html
- Parallel change (expand and contract): https://martinfowler.com/bliki/ParallelChange.html
- goose SQL annotations: https://pressly.github.io/goose/documentation/annotations/
- goose custom version table (`-table`, `WithTableName`): https://github.com/pressly/goose
- NServiceBus SQL outbox defaults: https://docs.particular.net/persistence/sql/outbox
- MassTransit EF outbox configurator: https://github.com/MassTransit/MassTransit/blob/develop/src/Persistence/MassTransit.EntityFrameworkCoreIntegration/Configuration/Configuration/EntityFrameworkOutboxConfigurator.cs
- sqlc migration parsing: https://docs.sqlc.dev/en/stable/howto/ddl.html
