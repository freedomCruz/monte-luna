# Backend commands

Run Go commands from `backend/`. Canonical schema: [Catalog domain](../docs/domain/catalog.md),
with [data modeling conventions](../docs/architecture/data-modeling.md).

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
| Types | Coffee and Cacao, with 16 labelled attribute definitions |
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
go test -count=1 ./internal/catalog/adapters/postgres/...
```

Docker must be running. Every integration test starts its own PostgreSQL 18 container,
using the digest pinned in `compose.yaml`; tests never connect to the worktree's database.
The migration tests exercise up/down/up, cross-product composite foreign keys,
reference-price rejection, and nonnegative stock; seed tests assert complete fixture
coverage, identical persisted data on repeat runs (including after a sale), agreement
between counters and receipts, and full rollback after a rejected variant. CLI tests
exercise exit codes, stdout, JSON stderr, help, repeated migrate/seed runs, and the
absence of demo rows after migration alone.
