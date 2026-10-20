# Backend commands

Run Go commands from `backend/`. Canonical schema: [Catalog domain](../docs/domain/catalog.md),
with [data modeling conventions](../docs/architecture/data-modeling.md).

## Run the read API

```sh
go run ./cmd/api
```

The API requires `API_ADDR` (unchanged), `DATABASE_URL`, and `MEDIA_BASE_URL`.
Configuration is validated before listening; missing values produce clear errors,
and database connection errors never echo the connection string. The catalog pool
is pinged at startup with a 15-second timeout and closed on shutdown.

`MEDIA_BASE_URL` is the public HTTP(S) base serving media objects, not an S3 API
endpoint or credential-bearing URL. It may include a path prefix, but no user info,
query, or fragment. For example, `http://127.0.0.1:4321/` resolves
`images/packaging-finca-el-mirador.webp` to
`http://127.0.0.1:4321/images/packaging-finca-el-mirador.webp`.
The backend only resolves URLs: it does not download, upload, or serve images.
In local development, demo media reuses the design asset images in `frontend/public/images/`
served directly by Astro, with `MEDIA_BASE_URL` pointing to the frontend server
(e.g., `http://127.0.0.1:<FRONTEND_PORT>/`). Storage keys in demo fixtures are relative
paths matching those static assets (such as `images/packaging-finca-el-mirador.webp` and
`images/photo-coffee-cherries.jpg`). Brand logo is set to `NULL` (`logo_storage_key` is
nullable and no logo file exists in demo assets). The coordinator wires `MEDIA_BASE_URL`
into the root environment example/Taskfile; this backend-only task deliberately leaves
those files unchanged.

Public GET paths under `/api/v1`:

| Path | Purpose |
| --- | --- |
| `/products` | Stable product listing with exact category/type filters |
| `/products/{slug}` | Stable product detail, without authoritative price/stock |
| `/categories` | Active categories, including nullable active parent slug |
| `/origins` | Active origin enumeration for static routes |
| `/origins/{slug}` | Origin facts only |
| `/origins/{slug}/products` | Published products linked to an active origin |
| `/product-availabilities` | One live batch read using repeated `product_slug` |

The approved [catalog contract](../contracts/openapi/catalog.yaml) defines response
shapes, filters, sorts, and error codes. Collections default to 24 items, maximum
100; opaque keyset cursors bind endpoint, slug, normalized filter sets, sort, and
page limit. Follow `next_cursor` with the same query; reordered repeated filter
values remain equivalent. Invalid/mismatched cursors return `invalid_cursor` (400),
unknown query parameters return `validation_failed` (422) with `unknown_parameter`.

Stable reads send `public, max-age=60`; live responses **including errors** send
`no-store`. Stable product composition batches related reads within a read-only
repeatable-read transaction. Live reads use one SQL statement, so all variant
prices, summed active-lot stock and earliest positive active-lot production dates
in a page share one snapshot. Missing/unpublished batch slugs are omitted, not
misrepresented as sold-out variants; active products with no active variants have
an empty variants array. No HTTP read allocates or mutates stock.

## Read-only checkout quotes

`POST /api/v1/orders/quote` implements `calculateOrderQuote` in the approved
[orders contract](../contracts/openapi/orders.yaml). Send `items` (one unique
UUIDv7 `variant_id` and integer quantity 1–99 per line, 1–50 lines) and a five-digit
DIVIPOLA `municipality_code`. Unknown fields, including client-supplied prices,
are rejected with 422. Duplicates are rejected at the repeated line's variant field.
Malformed JSON returns 400. Every response, including errors, sends `no-store`.

The orders application calls consumer-side ports in this order: catalog for live
price, published/active state, weight, tax category and stock; shipping for coverage
and business-day estimates; invoicing for taxes. Catalog's new root-facade
`CheckoutVariants(ctx, ids)` reads all live values and ordered, human-readable
variant labels in a read-only repeatable-read snapshot; missing IDs are omitted.
Consumers never query catalog tables or import its private packages.

Quotes return verified lines, shipping details, subtotal, shipping, tax and total.
`unknown_municipality` / `unsupported_destination` identify `municipality_code`;
`variant_unavailable` (422) identifies `items[n].variant_id`;
`insufficient_stock` (409) identifies `items[n].quantity`. Validation failures
identify the exact request path. Internal failures expose no provider or SQL details.
The quote does not write orders, reserve stock, or publish events; order placement,
tracking and stock allocation are described below.
The quote is recomputed from current data every time, never cached as an authority.

## Order placement and guest tracking

`POST /api/v1/orders` implements `placeOrder` in the approved
[orders contract](../contracts/openapi/orders.yaml). The endpoint requires an
`Idempotency-Key` header (normalized to canonical lowercase UUID format) and a
JSON body containing `items`, `customer`, `shipping_address`, `fiscal_data` (or null),
and `accepts_data_policy: true`. Client-supplied amounts and unknown root or nested
fields are strictly rejected with 422.

Order placement performs the following atomic orchestration:
1. Locks the idempotency key row within PostgreSQL. If a matching unexpired record exists,
   the identical 201 response is replayed without re-allocating stock or inserting records.
2. If the idempotency key was previously used with a different payload or after its 24-hour
   expiry, the request is rejected with 422 `idempotency_key_reused`.
3. Validates recipient municipality against DIVIPOLA via the shipping reference catalog.
4. Atomically allocates stock from `catalog` using oldest active lot first (FIFO). If any
   variant has insufficient stock or is unavailable, the whole cart allocation is rolled back
   and rejected with 409 `insufficient_stock` or 422 `variant_unavailable`.
5. Recomputes the authoritative quote snapshot (subtotal, shipping amount and business-day
   estimates, taxes, and total).
6. Derives an HMAC-SHA256 tracking token from `TRACKING_TOKEN_SECRET` and stores only its
   SHA-256 hash in `orders.orders.tracking_token_hash`. The raw token is returned once in the
   201 response payload and `Location` header (`/api/v1/orders/track?token=...`).
7. Persists order header, lines, lot allocation snapshots, address, status history, outbox
   event `orders.order_placed`, and the 24-hour idempotency result within a single transaction.
   If persistence fails, catalog stock is automatically compensated via idempotent release.

`GET /api/v1/orders/track?token=...` implements `trackGuestOrder`. The endpoint verifies
the raw token format (43-character base64url string), hashes it with SHA-256, and queries
the order snapshot. The response excludes sensitive buyer data (phone, document numbers,
and fiscal profiles) and sends `Cache-Control: no-store`.

### Background reservation expiry and maintenance

Orders in `pending_payment` status expire after 30 minutes. A background worker periodically:
- Finds expired reservations using `FOR UPDATE SKIP LOCKED`.
- Transitions order status to `expired` and logs status history.
- Idempotently releases reserved stock back to `catalog` active lot inventory.
- Emits outbox event `orders.order_expired`.
- Deletes idempotency key records older than 24 hours.

Configuration parameters in `cmd/api`:
- `TRACKING_TOKEN_SECRET`: Base64-encoded secret containing at least 32 bytes (required).
- `ORDER_MAINTENANCE_INTERVAL`: Polling interval for expiry and cleanup (default: 1m).

### Wompi payment initiation

`POST /api/v1/payments` follows the approved [payments contract](../contracts/openapi/payments.yaml).
Send only `tracking_token` in JSON and a UUID `Idempotency-Key`. The orders facade
hash-authorizes the capability and supplies the order total, currency and reservation
expiry. Unexpired `pending_payment` orders without an approved or pending attempt
can start; declined/error attempts can be retried. New references use 24 random
bytes, and only the backend computes the exact Wompi integrity signature.

A successful response is 201 with `Location: /api/v1/payments/verify` and `no-store`.
A matching key/body replays the original checkout for 24 hours, even when the order
has since expired or been paid. A changed body returns `idempotency_key_reused`.
The replay ledger never stores the raw tracking token or token-bearing redirect.

Startup requires `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET`,
`WOMPI_EVENTS_SECRET`, `WOMPI_ENVIRONMENT` (`sandbox` or `production`) and
`STOREFRONT_BASE_URL` (absolute HTTP(S) storefront origin). Values are read only
from the environment and are never logged. The redirect is always the server-built
`/pedido?token=...` capability URL; the browser never supplies prices or status.

Apply payments migrations with `go run ./cmd/migrate -module payments`; the default
`all` now migrates catalog, shipping, orders, payments and identity, in that order
(`-module identity` applies identity alone). The payments migration
creates attempts, refunds (including `duplicate_payment`), webhook deduplication,
outbox, consumer guards and the payment-start replay ledger. Settlements are deferred.
Seed behavior and its module filters are unchanged; payments has no demo seed.

The `PaymentGateway` port uses a bounded `net/http` adapter with the private Bearer
key. The reference-query fallback is **undocumented and unverified**; its response
shape/filter behavior must be confirmed with sandbox keys (M1) before production.
Tests use only an `httptest` provider and signed fixtures, never live Wompi calls.

### Verified provider outcomes

`POST /api/v1/payments/webhooks/wompi` verifies the required `X-Event-Checksum`
against dynamic, ordered `signature.properties`, the timestamp and events secret.
Missing, unresolved or altered signed values are rejected without writes. Checksums
are normalized for deduplication; repeated events return an empty 200. Status,
provider details, deduplication and `payments.payment_approved`/`payment_failed`
commit in one transaction. Terminal attempts cannot move backwards.

`POST /api/v1/payments/verify` requires the tracking token and a nullable
`transaction_id`. The hint is fetched server-side and accepted only if reference,
amount and currency match an attempt of that order. A mismatch returns 422 without
writes. No known transaction ID returns the current payment unchanged, without a
provider request. Successful reconciliation does not synchronously mark orders paid.

`PAYMENT_WEBHOOK_RETENTION` is a positive Go duration (default `720h`, 30 days).
The API runs bounded webhook-ledger cleanup at the configured outbox cleanup
interval and joins it before closing the payments pool.

### Order payment confirmation, late payments and refunds

Startup registers `orders` for `payments.payment_approved` and `payments` for
`orders.order_cancelled`. Consumers commit their own `processed_events` guard with
their state/history/outbox effects. Pending orders become paid once; expired orders
reallocate stock through the catalog facade and become paid, or cancelled with
`late_payment_no_stock`. Fulfillment and terminal orders never move backwards.
Catalog's late reallocation is idempotent by order reference, including retries
after a consumer persistence failure; ordinary allocation still rejects reused references.

Before expiry, orders queries payments through an in-process port. Only a private
provider-confirmed `PENDING` result extends the reservation by 15 minutes, capped
at `placed_at + 2h`. Provider-query failures leave the reservation unchanged for a
retry; the hard ceiling expires orders using the existing history/event/release path.
Background reconciliation can use the explicitly unverified adapter reference fallback.

A second provider approval becomes terminal `duplicate_approved`, preserving the
unique canonical `approved` attempt. It emits no approval event and creates one
pending manual `duplicate_payment` refund. Cancelled orders with an approved attempt
create a pending manual refund with the cancellation reason. Refund creation logs
an ERROR with order number and amount, without tokens, idempotency keys or secrets.
Refund execution, admin workflows and emails remain deferred.

`GuestOrder.payment` and payment verification project the canonical approved attempt
when present; otherwise they project the latest attempt. `duplicate_approved` is never
exposed. Provider methods are lowercase actual values, or null until known.

### Transactional outbox relay

The API starts an in-process relay for registered catalog, orders and payments outboxes,
using `FOR UPDATE SKIP LOCKED` claims. It dispatches registered consumers before
marking a source event delivered. Events with no registered consumer have no
side effects. `platform.ConsumeOnce` inserts the source UUID into the consumer's
`processed_events` in the same transaction as its effect; failed effects roll
back both. Register subscriptions at startup before running the relay.

Configuration overrides (all positive, validated at startup):

| Environment variable | Default |
| --- | --- |
| `OUTBOX_POLL_INTERVAL` | `1s` |
| `OUTBOX_BATCH_SIZE` | `100` |
| `OUTBOX_CLEANUP_INTERVAL` | `1h` |
| `OUTBOX_RETENTION` | `168h` (7 days) |
| `OUTBOX_MAX_ATTEMPTS` | `10` |
| `OUTBOX_INITIAL_BACKOFF` | `1s` |
| `OUTBOX_MAX_BACKOFF` | `15m` |

Delivery retries use exponential backoff; exhausted events become `failed`,
produce an ERROR log, and are never deleted automatically. Hourly bounded cleanup
removes only delivered events and successful consumer guards older than retention.
Consumer errors are not persisted verbatim, to avoid leaking private data.
Shutdown cancels and joins the relay before closing database pools.

### Scenario A tax calculation

`internal/invoicing` exposes `TaxCalculator`. Its explicit demo configuration is
`internal/invoicing/demo-profile.json`: CO, natural person, VAT responsibility false,
and unknown (`null`) tax regime (coordinator-approved; no ordinary/simple guess).
Every valid catalog tax category resolves to excluded with zero VAT under this
profile. The configured profile and each returned snapshot are isolated copies.
Only invoicing computes tax; orders retains the result for later snapshots.

This minimal implementation contains no statutory rates, UVT values, thresholds,
fiscal documents or provider integration. VAT-responsible profiles fail closed
because their pricing policy and dated data are not implemented or approved for
B2. They must not silently receive Scenario A treatment. `New(profile)` accepts
explicit profile configuration; `NewDemo()` is the approved demo-only default.

### Orders schema

`internal/orders/adapters/postgres/migrations/00001_orders.sql` creates the isolated
`orders` schema tables: orders, order_lines, order_line_lot_allocations,
order_shipping_addresses, order_status_history and outbox. `product_slug` and
required shipping-day snapshots are included. There are no cross-schema foreign
keys or joins. Orders' goose history lives in `orders.goose_db_version`; sqlc read
queries stay in orders adapters. The outbox is prepared for B3 but never written
or relayed in B2. The orders seed intentionally inserts nothing and only verifies
that its schema exists; it never invents customer orders or events.

## Shipping quotes (in-process only)

The `internal/shipping` root package exposes `QuotePort`, `QuoteInput`, `Quote`,
`New`, and `LookupMunicipality`. Construct the module with a database URL, call
`Quote(ctx, input)` from a consumer-side orders adapter, and close it on shutdown.
There is no shipping HTTP endpoint. Amounts are `int64` COP minor units; weight is
positive grams. Unknown DIVIPOLA codes return `*UnknownMunicipalityError`;
no active zone or matching weight band returns `*UnsupportedDestinationError`.
Both support `errors.As`, including through wrapped errors.

An active municipality zone wins over an active department zone **before** weight
resolution. Missing rates in a specific zone do not trigger department fallback.
Bands include both endpoints, with null maximum meaning unbounded. A subtotal
at or above the configured threshold produces amount zero and `FreeShipping=true`.
Estimated delivery business days are required integer values on every rate and
quote (`min >= 1`, `max >= min`), as in the canonical model (decision L12).

`LookupMunicipality` returns department/municipality display names for snapshots.
The backend embeds `internal/shipping/domain/divipola.json`, byte-identical to
`contracts/reference/divipola.json`. The test checks bytes and all 33 departments /
1,122 municipalities. DANE attribution and CC BY-SA 4.0 license metadata are retained;
see [reference attribution](../contracts/reference/README.md). Update both snapshots
after running the repository's `task divipola:update`.

### Shipping persistence and fictional demo data

```sh
# From backend/, with DATABASE_URL supplied by the environment:
go run ./cmd/migrate -module shipping
go run ./cmd/seed -module shipping
```

Without flags, both commands process all modules in dependency order: catalog,
then shipping, then orders. This also applies to `task backend:migrate` / `task backend:seed`.
`-module` accepts `all` (the default), `catalog`, `shipping`, or `orders` as an optional filter;
unknown modules fail before connecting. The shipping migration creates only zones, zone areas and
rates, with its own `shipping.goose_db_version`. Fulfillment, orders and HTTP
checkout are outside this work unit. Both commands retain catalog's logging,
configuration, cancellation and help conventions. Use a development database only.
Each module commits independently; if a later module fails, earlier completed
modules are preserved and the command fails. Fix the cause and rerun safely.
Direct commands above select only shipping; `-module catalog` selects only catalog.

The seed inserts three explicitly fictional zones: Demo Bogotá (`11001`), Demo
Medellín (`05001`), and Demo Antioquia (department `05`). Standard rates cover 0–1,000 g
and heavy rates 1,001 g upward. Standard demo amounts are 800000, 1000000 and 1500000
COP minor units respectively; heavy parcels add 500000. Every demo rate has a
15000000 threshold. All newly seeded demo rates estimate 3–5 business days.
These are fixtures, not production pricing or coverage commitments.

Seeding is transactional, repeatable, preserves existing rows/prices/status/timestamps,
and does not reset merchant edits. Existing geographic mappings are not reassigned.
Existing valid merchant estimates are preserved on repeat seeds, not reset to demo
values. Migration `00002_required_estimated_days.sql` makes both estimate columns
`NOT NULL` and enforces `min >= 1`, `max >= min`, without editing migration 00001
or backfilling data. If existing rows contain null or zero estimates, PostgreSQL
rejects the upgrade with a column/check error and goose rolls back the migration
and its version record. A merchant must explicitly correct those values before
retrying; the application does not guess delivery promises. Down restores the
previous nullable/nonnegative checks without rewriting stored values.

Rate creation and the seed validate inclusive bands under a zone-row lock; area
writes validate existing department/municipality codes and their association against
DIVIPOLA before insertion. Raw SQL imports must not bypass those write boundaries.

## Generate module queries

```sh
go tool -modfile=tools.mod sqlc generate
```

sqlc v1.31.1 is pinned in `tools.mod`. It reads the existing goose migrations plus
a schema-only prelude (`internal/catalog/adapters/postgres/schema.sql`), because
the runtime migration runner creates the schema before goose. Generated files live
under each module's `internal/<module>/adapters/postgres/sqlc`; never edit them by hand.
The shipping entry uses the same goose/prelude pattern. Regenerate both modules and
check for generated-file drift before committing.
Root consumers import only `internal/catalog`; depguard rejects private-layer and
generated-model imports outside their allowed surfaces. Migrate/seed command entry
points use the same root facades, preserving catalog behavior while also running
shipping and orders by default.

## Apply module migrations

```sh
go run ./cmd/migrate
# From the repository root instead:
# task backend:migrate
```

- `DATABASE_URL` must be supplied by the environment. Commands do not load `.env`.
- Missing configuration fails immediately with `DATABASE_URL is required` and exit code 1.
- `go run ./cmd/migrate -h` prints help without connecting to a database.
- SQL migrations are embedded from each module's `internal/<module>/adapters/postgres/migrations/`.
- Each runner creates its module schema before goose creates `<module>.goose_db_version`.
- Re-running migrate applies only pending versions; migrations contain no demo rows.
- The command writes JSON `slog` records to stderr, leaves stdout empty, and exits 0 on success.
- Work is cancelled on SIGINT/SIGTERM or after two minutes; connection strings are never logged.
- Rollback is deliberately not a command-line operation. Integration tests exercise `postgres.Down`
  only on disposable databases, leaving the module schema and goose version history intact.

## Load demo data

```sh
go run ./cmd/seed
# From the repository root instead:
# task backend:seed
```

Run migrate first and explicitly target a **development database**, never production.
The seed does not run automatically with migrations. `go run ./cmd/seed -h` prints
help without connecting. Configuration, logging, cancellation, and exit codes follow
migrate's conventions above.

The catalog seed validates product attributes and variant options in Go against
stored attribute definitions, then inserts its data in one transaction. A failure
rolls back catalog metadata, products, and stock together. The shipping seed runs
next in a separate transaction, using its own validation and rollback. Natural-key conflicts preserve existing
records; repeat runs do not change prices, timestamps, sold stock, or the movement
ledger. This is an initial fixture loader, not a catalog reset tool. Use a fresh,
migrated development database to obtain the complete unmodified demo fixture.

### Data for Catalog v1 reads

| Fixture | Details |
| --- | --- |
| Types | Café and Cacao, with 16 labelled attribute definitions |
| Origins | `finca-el-mirador` and `demo-cacao-origin`; region, DANE code, altitude, story, image |
| Products | `finca-el-mirador`, `finca-la-maria`, `chocolate-70`, `chocolate-85` |
| No origin | `chocolate-85` has a commercial brand but null `origin_id` |
| Categories | `coffee`, `cacao`, and child `chocolate`; six product-category links |
| Variants | Eight Mirador combinations (250/500 g × four grinds), one María, two chocolate bars |
| Reference price | `MIRADOR-250-WHOLE_BEAN`: 3800000, compare-at 4500000, COP minor units |
| Sold out | `MIRADOR-500-COARSE`: zero stock in both lots |
| Oldest available | Mirador whole bean: 2026-10-01; Mirador 250 g fine: 2026-10-08 because its earlier lot is empty |
| Ledger | Every newly initialized positive counter has a receipt movement; zero counters do not |

`allowed_values` is an ordered array of `{ "value": "stable_key", "label": "Buyer label" }`
objects. Product and variant JSON contains the stable keys, not labels. Presentation
keys are `250_g`, `500_g`, or `80_g`; their labels exclude the unit suffix because
`unit` is `g`. Grind keys are `whole_bean`, `fine`, `medium`, and `coarse`. Roast is
strictly a product attribute. Cupping score/protocol and other unknown product values
are nullable. No product attributes are stored as origin facts.

All agronomic facts, assessments, cacao merchant declarations, dates, and 500 g prices
are explicitly fictional demo content. The placeholder prices/names follow the design
system. The explicit `excluded` tax category is demo Scenario A, not a production tax
classification or a schema default. Media paths are relative storage keys matching the
local design assets in `frontend/public/images/` (e.g. `images/packaging-finca-el-mirador.webp`,
`images/photo-coffee-cherries.jpg`), resolved against `MEDIA_BASE_URL`: no external image
files are added or uploaded, and the brand logo storage key is `NULL`.

## Verify persistence

```sh
go test -count=1 -cover ./internal/catalog/... ./internal/shipping/... ./internal/orders/... ./internal/invoicing/...
```

Docker must be running. Every integration test starts its own PostgreSQL 18 container,
using the digest pinned in `compose.yaml`; tests never connect to the worktree's database.
The migration tests exercise up/down/up, cross-product composite foreign keys,
reference-price rejection, and nonnegative stock; seed tests assert complete fixture
coverage, identical persisted data on repeat runs (including after a sale), agreement
between counters and receipts, and full rollback after a rejected variant. CLI tests
exercise exit codes, stdout, JSON stderr, help, repeated migrate/seed runs, and the
absence of demo rows after migration alone. Shipping adapter tests exercise the same
PostgreSQL 18 up/down/up cycle, schema constraints and geographic uniqueness, domain
validation before persistence, inclusive rate boundaries, active-zone precedence,
free-shipping threshold, unsupported destinations, required estimated-day constraints,
legacy estimate upgrade rejection without backfill, new migration up/down/up with
unchanged stored values, seed preservation and rollback,
and the in-process public facade. No worktree database or `.env` values are read.
