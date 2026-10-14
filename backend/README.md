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
query, or fragment. For example, `https://media.example/store/` resolves
`demo/products/finca-el-mirador.jpg` to
`https://media.example/store/demo/products/finca-el-mirador.jpg`.
The backend only resolves URLs: it does not download, upload, or serve images.
The configured origin must actually serve the relative demo keys to show images.
The coordinator must wire this value into the root environment example/Taskfile;
this backend-only task deliberately leaves those files unchanged.

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

## Generate catalog queries

```sh
go tool -modfile=tools.mod sqlc generate
```

sqlc v1.31.1 is pinned in `tools.mod`. It reads the existing goose migrations plus
a schema-only prelude (`internal/catalog/adapters/postgres/schema.sql`), because
the runtime migration runner creates the schema before goose. Generated files live
only under `internal/catalog/adapters/postgres/sqlc`; never edit them by hand.
Root consumers import only `internal/catalog`; depguard rejects private-layer and
generated-model imports outside their allowed surfaces. Migrate/seed command entry
points use the same root facade, preserving their existing behavior.

## Apply catalog migrations

```sh
go run ./cmd/migrate
# From the repository root instead:
# task backend:migrate
```

- `DATABASE_URL` must be supplied by the environment. Commands do not load `.env`.
- Missing configuration fails immediately with `DATABASE_URL is required` and exit code 1.
- `go run ./cmd/migrate -h` prints help without connecting to a database.
- SQL migrations are embedded from `internal/catalog/adapters/postgres/migrations/`.
- The runner creates the `catalog` schema before goose creates `catalog.goose_db_version`.
- Re-running migrate applies only pending versions; migrations contain no demo rows.
- The command writes JSON `slog` records to stderr, leaves stdout empty, and exits 0 on success.
- Work is cancelled on SIGINT/SIGTERM or after two minutes; connection strings are never logged.
- Rollback is deliberately not a command-line operation. Integration tests exercise `postgres.Down`
  only on disposable databases, leaving the module schema and goose version history intact.

## Load the demo catalog

```sh
go run ./cmd/seed
# From the repository root instead:
# task backend:seed
```

Run migrate first and explicitly target a **development database**, never production.
The seed does not run automatically with migrations. `go run ./cmd/seed -h` prints
help without connecting. Configuration, logging, cancellation, and exit codes follow
migrate's conventions above.

The seed validates product attributes and variant options in Go against stored
attribute definitions, then inserts everything in one transaction. A failure rolls
back metadata, products, and stock together. Natural-key conflicts preserve existing
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
classification or a schema default. Media paths are relative `demo/...` storage keys:
no image files are added or uploaded, and media URL resolution remains B2 work.

## Verify persistence

```sh
go test -count=1 ./internal/catalog/...
```

Docker must be running. Every integration test starts its own PostgreSQL 18 container,
using the digest pinned in `compose.yaml`; tests never connect to the worktree's database.
The migration tests exercise up/down/up, cross-product composite foreign keys,
reference-price rejection, and nonnegative stock; seed tests assert complete fixture
coverage, identical persisted data on repeat runs (including after a sale), agreement
between counters and receipts, and full rollback after a rejected variant. CLI tests
exercise exit codes, stdout, JSON stderr, help, repeated migrate/seed runs, and the
absence of demo rows after migration alone.
