---
name: backend-go-modules
description: "Trigger: Go backend, backend/, internal module, use case, port, adapter, HTTP handler. Build Go modular-monolith code with hexagonal layers and strict module boundaries."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when creating or changing Go code under `backend/`.

Do not use alone for: repository layout, root files, or Taskfile tasks (`monorepo`); testing strategy or determinism rules (`testing`); dependency vetting (`dependency-audit`); SQL, migrations, or sqlc queries (`database-postgres`); cross-module side effects (`domain-events-outbox`); taxes or invoices (`invoicing-taxes`). Load those skills alongside when the change touches them.

## Hard Rules

- Read `docs/architecture/system-architecture.md` sections 3–6 before structural changes.
- Layout: `go.mod` and `go.sum` reside in `backend/`, never at the repository root. `backend/cmd/server/main.go` wires dependencies; business code lives in `backend/internal/<module>/{domain,app,adapters}`; shared infrastructure only in `backend/internal/platform`.
- Go developer tools are never installed globally. `govulncheck` is pinned via the `tool` directive in `backend/go.mod` (`go tool govulncheck`); tools with a large dependency graph (`golangci-lint`, `sqlc`) live in `backend/tools.mod` (`go tool -modfile=tools.mod <name>`). `goose` is not a tool: it is a library used by `backend/cmd/migrate` to apply embedded SQL migrations.
- Configuration: read strictly from environment variables, validated at application startup, and fails fast on missing or invalid settings. Do not embed dotenv libraries in Go code (Taskfile handles dotenv for local development).
- `domain`: pure Go entities, invariants, and port interfaces. Never import `net/http`, `pgx`, sqlc output, `platform`, or another module.
- `app`: use cases that depend only on `domain` types and ports.
- `adapters`: `net/http` handlers, sqlc/pgx repositories, cache and gateway implementations of domain ports.
- HTTP handlers implement the module's approved contract in `contracts/openapi/<module>.yaml`; never add or change an endpoint that is not in the contract. Handler tests validate every request and response against that document. Follow `docs/architecture/api-conventions.md` for paths, JSON, money, errors, pagination, and idempotency.
- A module's public contract lives only in its root package `backend/internal/<module>`. Other modules may import that root package, never its `domain`, `app`, or `adapters`.
- Cross-module reads go through a port in the consumer's `domain`, implemented by an adapter that calls the producer's root package. Never read another module's tables.
- Routing: standard library `net/http` patterns (for example `GET /products/{slug}`). No third-party router.
- No ORM. No package-level mutable state. Functions doing I/O take `context.Context` first. Wrap errors with `%w`.
- Money is `int64` in minor units plus a currency code. Entity IDs are UUIDv7.
- Cache only through `CachePort`; invalidate affected keys after every successful write.
- Go toolchain: latest stable minor of the newest major version, never below 1.25.1; keep the `go.mod` `go` and `toolchain` lines current. See section 6 of the architecture doc.
- Admin authentication uses only the approved stack: SCS sessions stored in PostgreSQL through a schema-qualified store, Argon2id passwords, `http.CrossOriginProtection`, `HttpOnly` + `Secure` + `SameSite` cookies. Never JWTs in browser storage.
- Rate limiting: implemented in the Go application (per account and per IP for admin login and other sensitive endpoints), not in the reverse proxy; any rate-limiting library must pass `dependency-audit` before user approval (none chosen yet).
- Load `monorepo` when changing repository structure, root files, or Taskfile tasks.
- Load `dependency-audit` before proposing, adding, or updating any dependency; installation still requires explicit user approval.

## Decision Gates

| Situation | Action |
| --- | --- |
| New behavior inside an existing module | Add to its `domain`/`app`; expose in the root package only if another module needs it |
| New bounded context | Stop and ask: the module list is a canonical decision |
| Needs another module's data | Consumer-side port + adapter calling the producer's root package |
| Side effect in another module | Load `domain-events-outbox` |
| Database access | Load `database-postgres` |
| `govulncheck` reports a reachable vulnerability | Upgrade the Go toolchain or dependency before finishing; report it |
| Rule not covered by canonical docs | Ask the user; do not invent it |

## Execution Steps

1. Load `testing` and apply TDD to `domain` and `app` logic: observe RED, implement minimal code for GREEN, and refactor.
2. Implement or update adapters; cover them with PostgreSQL 18 integration tests per `testing`.
3. Wire new dependencies in `backend/cmd/server/main.go`.
4. Run every verification gate.

## Output Contract

Report:
- Files created or modified, grouped by module and layer.
- Results of: `go build ./...`, `go vet ./...`, `golangci-lint run` (including `depguard` boundaries), `govulncheck ./...`, `go test ./...`, and integration tests for touched adapters.
- Canonical docs updated, or why none needed updating.
- Open questions and residual risks.

## References

Paths are relative to the repository root.

- `docs/architecture/system-architecture.md` — modules, hexagonal layers, isolation rules, tooling.
- `docs/architecture/data-modeling.md` — identifiers, money, module boundaries in the database.
- `.agents/skills/monorepo/SKILL.md` — monorepo layout, Taskfile tasks, and repository conventions.
- `.agents/skills/testing/SKILL.md` — testing strategy, TDD workflow, Testcontainers, determinism rules.
- `.agents/skills/dependency-audit/SKILL.md` — dependency evaluation, pinning, and security audits.
