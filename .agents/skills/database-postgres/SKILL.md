---
name: database-postgres
description: "Trigger: SQL, schema, table, migration, goose, sqlc, query, index, PostgreSQL. Write PostgreSQL 18 schemas, goose migrations, and sqlc queries that follow the data conventions."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when creating or changing tables, migrations, indexes, or sqlc queries.

Do not use for Go business logic alone (`backend-go-modules`) or outbox mechanics (`domain-events-outbox`).

## Hard Rules

- Read `docs/architecture/data-modeling.md` completely before any schema work.
- Every table belongs to its module's schema; always use schema-qualified names in `snake_case`.
- Primary key: `id uuid PRIMARY KEY` holding UUIDv7 values.
- Types: `timestamptz`, `text` with `CHECK`, `bigint` minor units plus `currency`, `GENERATED ... AS IDENTITY` for integer surrogates. Never `money`, `serial`, `char(n)`, or `timestamp` without time zone.
- Mutable tables have `created_at` and `updated_at`; admin-edited tables have `version` for optimistic locking.
- Foreign keys only within the same schema, and every foreign key column gets an index. No cross-schema foreign keys or joins.
- `JSONB` only for descriptive attributes. Anything affecting money, logistics, stock, or frequent filters is a typed column. Query `JSONB` with `@>`.
- System states: `text` plus `CHECK`. Products are archived, never hard-deleted. Orders store immutable snapshots.
- Migrations are `goose` SQL files with `Up` and `Down`, stored per module in `backend/internal/<module>/adapters/postgres/migrations/`, with the version table in the module schema (`<module>.goose_db_version`). Never edit an applied migration.
- `CREATE INDEX CONCURRENTLY` goes alone in a migration annotated `-- +goose NO TRANSACTION`.
- sqlc reads the migrations as schema; generated code is used only inside `adapters`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Breaking change (rename, type change, drop) | Expand → migrate → contract across separate migrations |
| Need data owned by another module | Not SQL: use that module's root package or a read model |
| New index | Name the query it serves; skip it otherwise |
| Index on a populated table | Separate `NO TRANSACTION` migration with `CONCURRENTLY` |
| Convention conflict or gap | Ask the user; update `data-modeling.md` after approval |

## Execution Steps

1. Write the migration (`Up` and `Down`).
2. Write or update sqlc queries; regenerate code.
3. Add integration tests that run the migrations and queries against PostgreSQL 18 via Testcontainers.
4. Run every verification gate.

## Output Contract

Report:
- Migrations and queries created or modified.
- Results of: migrations applied up, down, and up again on PostgreSQL 18; `sqlc generate` with no uncommitted diff; integration tests.
- Indexes added and the query each one serves.
- Canonical docs updated, open questions, and residual risks.

## References

Paths are relative to the repository root.

- `docs/architecture/data-modeling.md` — all data conventions.
- `docs/architecture/invoicing-and-taxes.md` — tax, fiscal, and settlement data.
