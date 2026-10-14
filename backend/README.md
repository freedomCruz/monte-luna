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

## Verify persistence

```sh
go test -count=1 ./internal/catalog/adapters/postgres/...
```

Docker must be running. Every integration test starts its own PostgreSQL 18 container,
using the digest pinned in `compose.yaml`; tests never connect to the worktree's database.
The migration tests exercise up/down/up, cross-product composite foreign keys,
reference-price rejection, and nonnegative stock; CLI tests exercise exit codes,
stdout, JSON stderr, help, repeated migration runs, and the absence of demo rows.
