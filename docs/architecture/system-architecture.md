# System Architecture Baseline: Modular Monolith (Go + Astro)

This document establishes the canonical system architecture for the e-commerce platform, approved to operate efficiently within the baseline VPS infrastructure (Contabo: 4 shared vCPU, 8 GB RAM, 100 GB SSD) while maintaining a strict modular design that enables extraction of modules into independent services without rewriting their domain logic, if future scale demands it.

---

## 1. High-Level Architectural Topology

The system is organized as a decoupled frontend and a single modular backend application sharing a private PostgreSQL database.

```text
                           Buyer / Admin Browser
                                     │
                                     ▼
                ┌─────────────────────────────────────────┐
                │          Frontend Layer (Astro)         │
                │  - Content-rich pages (Static HTML/SEO) │
                │  - Interactive React Islands            │
                │    (Storefront UI + Tailwind CSS)       │
                └────────────────────┬────────────────────┘
                                     │ (JSON / REST API)
                                     ▼
                ┌─────────────────────────────────────────┐
                │        Backend Layer (Go Monolith)      │
                │  - In-process modular bounded contexts  │
                │  - Pragmatic Hexagonal Architecture     │
                │  - In-Memory Cache (RAM via CachePort)  │
                └────────────────────┬────────────────────┘
                                     │ (pgx/v5 connection pool)
                                     ▼
                ┌─────────────────────────────────────────┐
                │        Database Layer (PostgreSQL 18)   │
                │  - Isolated schemas per domain module   │
                │  - Zero cross-schema Foreign Keys       │
                │  - Immutable historical order snapshots │
                └─────────────────────────────────────────┘
```

---

## 2. Frontend Architecture: Astro + React Islands

- **Core Framework:** **Astro** configured for high-performance static rendering by default, serving lightweight HTML and CSS with zero client-side JavaScript for marketing, catalog browsing, and SEO-critical content.
- **Interactive Islands:** **React** (`@astrojs/react`) components used exclusively where client interactivity is mandatory:
  - Product variant selectors and purchase controls (`client:load`).
  - Slide-over shopping cart and checkout interaction (`client:load` / `client:idle`).
  - Search auto-complete and catalog filters (`client:visible`).
- **Component Design System:** **Storefront UI** (`@storefront-ui/react`) and **Tailwind CSS**, providing accessible e-commerce component primitives.
- **Island Props:** Props passed to hydrated islands must be serializable data; functions cannot cross the server-to-client boundary.
- **Cross-Island State:** Independent React islands do not share a global React Context tree. Cross-island synchronization (e.g., header cart counter reacting to an "Add to Cart" event) uses lightweight reactive stores (e.g., Nano Stores) or grouped composite islands.
- **Merchant Admin Panel:** A compact, custom administrative interface located under `/admin`, built using the same Astro + React + Storefront UI stack and consuming Go REST endpoints.
- **Output Mode and Production Runtime:** Astro static output (`output: 'static'`). No Node.js process runs in production; all storefront pages and the `/admin` shell are pre-rendered to static assets. The `/admin` area remains a static shell that authenticates through the backend session cookie and loads private data client-side. Static assets in production are served directly by Caddy from a Caddy-based container image with pre-rendered assets baked in; Go `embed` for static files is rejected. Caddy proxies `/api` to the Go backend, leaving the Go application unexposed directly to the internet.

---

## 3. Backend Architecture: Go Modular Monolith

- **Runtime & Language:** **Go (Golang)** running as a single compiled binary, providing predictable low-latency execution, native multi-core utilization, and a small memory footprint (baseline to be measured once implemented).
- **HTTP Routing & Middleware:** Standard library `net/http` router (Go 1.22+ method and wildcard patterns) with standard `http.Handler` middleware. No third-party router.
- **Database Access:** **`pgx/v5`** connection pool with **`sqlc`**. No heavy Object-Relational Mappers (ORMs). Database interactions use compiled, strongly typed Go queries generated directly from verified raw SQL definitions.
- **Caching Strategy:** In-memory caching within the Go process (e.g., `otter` or `golang-lru`), protected behind an abstract `CachePort` interface. Redis is intentionally omitted for single-VPS deployment to eliminate unnecessary network socket overhead and memory overhead.
- **Domain Events:** Transactional outbox in PostgreSQL, relayed by a goroutine inside the same binary. No message broker is required. Details in [data-modeling.md](data-modeling.md#11-domain-events-transactional-outbox).

---

## 4. Module Decomposition & Hexagonal Design

Application business logic is strictly partitioned into domain-specific packages under `internal/`. Each module is structured following a **Pragmatic Hexagonal Architecture** with three clear layers:

```text
internal/<module>/
  ├── domain/         # Pure business entities, state invariants, and Ports (interfaces)
  │     ├── model.go  # Structs and validation rules (e.g., Product.Archive(), Order.Cancel())
  │     └── ports.go  # Outbound interfaces: Repository, CachePort, ExternalGateway
  │
  ├── app/            # Application use cases and business workflow orchestration
  │     └── service.go# CreateProduct, ArchiveProduct, PlaceOrder, ProcessPayment
  │
  └── adapters/       # Technical inbound and outbound implementations
        ├── http.go   # REST API HTTP handlers and JSON serialization
        ├── pg_repo.go# sqlc/pgx database repository implementation
        └── memory.go # In-memory cache adapter implementing CachePort
```

### Core Bounded Contexts:
1. **`internal/catalog`:** Products, variants, categories, images, compare-at reference price, pricing, and lifecycle states (`published`, `draft`, `archived`). The first version sells **physical products only**; merchant-defined product types and variant options allow any kind of physical product without schema changes. Design in [docs/domain/catalog.md](../domain/catalog.md).
2. **`internal/shipping`:** Shipping zones (DANE departments/municipalities), weight-band rates with optional free-shipping thresholds, and shipment tracking records. Exposes a quote API consumed by `orders` during checkout; records fulfillment shipments and dispatches. Design in [docs/domain/shipping.md](../domain/shipping.md).
3. **`internal/orders`:** Checkout quote calculation, order placement with stock reservation, state machines, guest tracking tokens, and order history. Cart lives in the browser; `orders` computes server-side quotes by querying `catalog`, `shipping`, and `invoicing`. Design in [docs/domain/orders.md](../domain/orders.md).
4. **`internal/payments`:** Payment provider gateway integrations (e.g., Wompi, Stripe), transactions, incoming webhook reconciliation, and settlement records (provider fees, withholdings, and net payouts).
5. **`internal/promotions`:** Discount coupons, percentage/fixed offers, and automatic promotional campaigns.
6. **`internal/identity`:** Admin users with two fixed roles (`owner`, `staff`), password credentials (Argon2id), mandatory TOTP 2FA, and server-side sessions for the `/admin` panel. Invariant ensures at least one active owner always exists. Designed so customer accounts can be added later without mixing authentication into other modules. Design in [docs/domain/identity.md](../domain/identity.md).
7. **`internal/invoicing`:** Extension point for country-specific tax policies and fiscal documents (e.g., Colombian electronic invoicing). Country rules are implemented as adapters behind Go ports, so new countries or providers are added without changing other modules. Design in [invoicing-and-taxes.md](invoicing-and-taxes.md).
8. **`internal/platform`:** Shared infrastructure primitives (database connection pools, configuration loader, structured logging, outbox relay).
9. **`internal/notifications`:** Transactional email triggered by domain events from other modules' outboxes. Resend provider integration via plain `net/http` behind an `EmailSender` port (no SDK). Design in [docs/domain/notifications.md](../domain/notifications.md).

---

## 5. Inter-Module Isolation & Microservices Readiness

To guarantee that any module can be extracted into an independent microservice in the future without rewriting core domain logic:

1. **Strict Package Boundaries:** Modules must not import the private packages or database models of other modules. For example, `internal/orders` is strictly forbidden from importing `internal/catalog/adapters`.
2. **Module Public Contract:** Each module exposes its public contract (facade interfaces and data transfer types) only in its root package `backend/internal/<module>`. Other modules may import that root package, never its `domain`, `app`, or `adapters` packages; `depguard` enforces this.
3. **Inter-Module Communication via Interfaces:** When a module requires data from another (e.g., `orders` validating product price during checkout), it accesses it exclusively through an exported Go interface (`CatalogGateway`). In the monolith, this is satisfied by an in-memory adapter; in a future distributed topology, it can be swapped for a gRPC/HTTP client adapter.
4. **Domain Events:** Side-effects across modules (e.g., notifying customer after payment capture) are triggered by domain events written to the owning module's outbox table in the same transaction as the business change, then delivered at least once to idempotent consumers. An event is never lost if the process stops after committing.
5. **PostgreSQL Schema Isolation:**
   - Each module owns an isolated schema: `catalog.*`, `orders.*`, `payments.*`.
   - Foreign keys are allowed within a module's schema.
   - **Cross-schema Foreign Keys and joins are strictly prohibited.** Cross-module reads use API composition or event-fed read models.
   - Orders store an **immutable historical snapshot** (`product_id`, `product_name`, `unit_price_at_purchase`, `sku`) rather than joining live catalog tables, preserving accounting history even if products are edited or archived.

---

## 6. Implementation Tooling

| Concern | Decision |
|---|---|
| **Repository layout** | Light monorepo: single Git repository without heavy build engines (no Turborepo, Nx, Bazel, or Pants). Layout: `backend/` (Go module; `go.mod` resides here, not at repository root), `frontend/` (Astro app containing storefront and `/admin`), `deploy/` (production Docker Compose file and deploy/backup scripts), `docs/`, `.agents/skills/`, `odd/`, and root files `AGENTS.md`, `CHANGELOG.md`, `Taskfile.yml`, `.node-version`, `compose.yaml` (local development services such as PostgreSQL), `.env.example`, `.gitattributes`, `.editorconfig`. Deferred files are created when their area is scaffolded |
| **Node.js runtime** | Node 26 LTS (Active LTS from 2026-10-28; Maintenance from 2027-10-20; end of life 2029-04-30). Exact version pinned in root `.node-version`, read by fnm (`fnm env --use-on-cd --version-file-strategy=recursive`). Same version used in production build containers. Exact patch chosen under `dependency-audit` when `frontend/` is scaffolded |
| **HTTP router** | Standard library `net/http` |
| **Reverse proxy** | Caddy official image pinned to exact version and digest. Handles automatic HTTPS (obtains and renews certificates, redirects HTTP to HTTPS), compression (`encode zstd gzip` with `file_server` `precompressed` sidecars), serving static Astro build assets, and proxying `/api` to the Go backend. Rate limiting is kept in the Go application to avoid custom `xcaddy` builds. Certificate storage directory persisted in a Docker volume and backed up; admin API bound locally and never exposed. Security advisories monitored under `dependency-audit` |
| **Database migrations** | `goose`, versioned SQL files that `sqlc` also reads as schema input |
| **Backend testing** | Test-driven development for `domain` and `app` layers; integration tests for adapters against a real PostgreSQL 18 instance started with Testcontainers (Docker required on development machines) |
| **Module boundary enforcement** | `golangci-lint` with `depguard` rules that forbid importing another module's internal packages |
| **Frontend package manager** | npm 12. Exact version enforced in `frontend/package.json` with `devEngines.packageManager` (`{ "name": "npm", "version": "<exact>", "onFail": "error" }`). Installed once per fnm Node version with `npm install -g npm@<exact>`. Verify `devEngines.runtime` check for Node against npm docs at scaffold time (`.node-version` remains the source of truth). Policy: default-deny `allowScripts` with empty allowlist target; package scripts approved only after `dependency-audit`, with version-pinned approvals (`npm approve-scripts <pkg>` written to `package.json`, committed). Never set `ignore-scripts=true`, never `--omit=optional`. Pinned in `frontend/.npmrc`: `save-exact=true` and `min-release-age=7` |
| **Task runner** | Taskfile (go-task) installed at repository root (`Taskfile.yml`). Pinned to exact version respecting the 7-day release-age quarantine (e.g., `winget install Task.Task --version <exact>` on Windows; go-task v3.54.0 released 2026-10-01). Loads `.env` via `dotenv` for local development so Go backend needs no dotenv library. Namespaced tasks (e.g., `dev:db`, `backend:test`, `frontend:test`, `verify`, `deploy`). `verify` runs all verification gates (local CI used by deploy preflight). Documented via `task --list`; every recurring command gets a task |
| **Go toolchain** | Latest stable minor release of the newest Go major version (1.27.1 as of 2026-09-01), updated promptly when security minor releases ship; never older than Go 1.25.1 (required by `http.CrossOriginProtection`). `govulncheck ./...` runs in every backend verification |
| **Go developer tools** | Pinned with `backend/go.mod` `tool` directive (`go get -tool <module>/cmd/<tool>@vX.Y.Z`) and executed via `go tool <name>` from `backend/`; never installed globally. Must pass `dependency-audit` |
| **Frontend testing** | Vitest (configured with Astro's `getViteConfig`); Astro Container API for `.astro` components; React Testing Library for islands; Playwright for end-to-end flows; axe-core in Playwright for accessibility |
| **Dependency policy** | Pre-proposal audit (maintenance, license, vulnerabilities via OSV, GitHub Advisories, NVD, `govulncheck`, `npm audit`). Exact version pinning (no `^` or `~`), committed lockfiles (`package-lock.json`, `go.sum`). npm 12 default-deny install-script policy (`allowScripts`) with an empty allowlist target; package scripts approved only after `dependency-audit`, with version-pinned approvals (`npm approve-scripts <pkg>` written to `package.json`, committed). Never set `ignore-scripts=true` (it defeats npm 12's allowlist). Never omit optional dependencies (`--omit=optional`) because esbuild and sharp rely on platform optional dependencies to run without scripts. Playwright browsers installed via `npx playwright install` (dev/test only, never on VPS). Never copy `node_modules` between OSes (Linux container builds for production). `save-exact=true` and `min-release-age=7` (7-day quarantine for new versions; per-package exclusion only for user-approved urgent security fixes) in frontend `.npmrc`. npm 12 pinned to exact version chosen under `dependency-audit` when `frontend/` is scaffolded (supports Node `^22.22.2 || ^24.15.0 || >=26.0.0`; the project uses Node 26 LTS, see the "Node.js runtime" row). `-mod=readonly` and `toolchain` pinning in Go. Verification via `npm audit signatures` and `go mod verify`. Deliberate single-dependency updates with repeated audit; see the `dependency-audit` skill |
| **Environment configuration** | Root `.env.example` committed with safe placeholder values; real `.env` and `.env.*` files are never committed. Go backend reads configuration strictly from environment variables, validates on startup, and fails fast on missing or invalid values. In production, env file lives on VPS outside repository with restrictive permissions and is loaded by Docker Compose. Astro static builds embed values at build time; only public non-secret values (`PUBLIC_`-prefixed) exposed to client code. Secret-management tooling is pending |
| **Repository conventions** | Root `.gitattributes` enforces `* text=auto eol=lf` and explicit `binary` attributes for media and archive assets. Root `.editorconfig` enforces UTF-8, LF, final newline, trim trailing whitespace (except `*.md`), tabs for `*.go` and `go.mod`/`go.work`, 2 spaces elsewhere. Git ignore protects `.env`, build outputs (`frontend/dist/`, `frontend/.astro/`, `backend/bin/`), and `node_modules/` |
| **Deployment** | Project script run from developer machine; no GitHub Actions or paid CI required (GitHub Actions free-tier PR checks pending). Flow: (1) preflight (clean git tree, deploy only an existing `vX.Y.Z` tag, local CI verification gates across backend, frontend, testing); (2) build artifacts in Linux containers: Go backend image and Caddy image with baked-in static assets, both tagged with version and commit SHA; (3) transfer both images via `docker save | ssh <host> docker load` (no registry); (4) pre-deploy `pg_dump -Fc` on the VPS; (5) run `goose` migrations (expand -> migrate -> contract); (6) start release with Docker Compose; (7) health check against backend endpoint (automatic rollback of both images to previous tag on failure); (8) record active release (version, SHA, timestamp). Never build on VPS; dedicated SSH key; secrets outside git (management details pending). Script written when code exists to deploy. See `deployment` skill |
| **Backups** | Independent of deploys: daily `pg_dump -Fc` on VPS scheduled via systemd timer plus restic to off-site S3-compatible object storage with client-side encryption and deduplication. Includes disk media if stored on disk (media location pending). Monthly restore drill into a separate database. Backup provider and retention pending (7 daily, 4 weekly, 6 monthly proposed). Point-in-time recovery (pgBackRest) deferred until sales scale |
| **Local development** | Docker used for PostgreSQL and Testcontainers; Go and Astro run natively on host. Docker Desktop license: free for personal use and small businesses |
| **Commits and releases** | Conventional Commits 1.0.0; Keep a Changelog 1.1.0; SemVer 2.0.0; single product version and unified `vX.Y.Z` repository tags; no commit or changelog tooling (maintained via agent discipline) |
| **Transactional email** | Resend via plain `net/http` behind an `EmailSender` port (no vendor SDK); owned by `internal/notifications` module; requires an owned domain with SPF, DKIM, and DMARC DNS records |

### Admin Authentication

| Concern | Decision |
|---|---|
| Sessions | Server-side sessions with `alexedwards/scs`. Session data stored in PostgreSQL through a small custom SCS store that uses schema-qualified tables, because `pgxstore` uses an unqualified `sessions` table. Owning module: `internal/identity` (tables in the `identity` schema) |
| Passwords | Argon2id via `golang.org/x/crypto/argon2`, at least OWASP minimums (19 MiB memory, 2 iterations, parallelism 1) |
| CSRF | `http.CrossOriginProtection` from the Go standard library; `GET`, `HEAD`, and `OPTIONS` never change state |
| Cookies | `HttpOnly`, `Secure`, and `SameSite`; session token regenerated at login |
| Rate limiting | Implemented in the Go application (per account and per IP for admin login and other sensitive endpoints), not in the reverse proxy, avoiding custom `xcaddy` builds. Library selection subject to `dependency-audit` (none chosen yet) |
| Excluded | JWTs stored in the browser; self-hosted identity providers (resource cost on the VPS) |

---

## 7. Architecture Status Summary

| Area | Decision | Status |
|---|---|---|
| **Frontend** | Astro + React Islands + Storefront UI + Tailwind CSS | Approved |
| **Backend** | Go Modular Monolith (Pragmatic Hexagonal Architecture) | Approved |
| **Database Engine** | PostgreSQL 18 (Isolated domain schemas; native `uuidv7()`) | Approved |
| **Primary Keys** | UUIDv7 (time-ordered, B-tree friendly). Not a security token: public links (e.g., guest order tracking, password reset) use separate random tokens, and authorization is always enforced | Approved |
| **Database Access** | `pgx/v5` + `sqlc` (Type-safe SQL, zero heavy ORM) | Approved |
| **Cache Strategy** | In-Memory Go Cache via `CachePort` (No Redis required on single VPS) | Approved |
| **Admin Panel** | Custom compact dashboard (`/admin`) using Astro + React | Approved |
| **Domain Events** | Transactional outbox per module schema + in-process relay; idempotent consumers | Approved |
| **Product Scope (v1)** | Physical products only, with merchant-defined product types and variants. Digital products and services are out of scope | Approved |
| **Invoicing** | Dedicated module with `TaxCalculator` and `InvoiceIssuer` ports and per-country adapters; see [invoicing-and-taxes.md](invoicing-and-taxes.md). Provider: Factus, sandbox only | Approved (production issuance pending) |
| **Currency** | Single currency: COP | Approved |
| **Fiscal Profile (demo default)** | Scenario A: natural person not responsible for VAT; no VAT charged | Approved |
| **Data Modeling Conventions** | Normalization, types, JSONB, indexing, inventory, and schema evolution rules in [data-modeling.md](data-modeling.md) | Approved |
| **Implementation Tooling** | Monorepo, `net/http`, `goose`, TDD + Testcontainers, `golangci-lint` + `depguard`, `npm`, Go toolchain policy with `govulncheck`, frontend testing stack (section 6) | Approved |
| **Admin Authentication** | SCS sessions in PostgreSQL, Argon2id, `CrossOriginProtection`, secure cookies (section 6) | Approved |
| **Identity Data Model** | 6-table schema in `identity`: `admin_users`, `admin_totp_credentials`, `admin_recovery_codes`, `password_reset_tokens`, `sessions`, `security_events` | Approved (30-minute reset tokens, bootstrap CLI over SSH, `security_events` kept 1 year; secret management pending) |
| **Orders Data Model** | 5-table schema in `orders`: `orders` ✎, `order_lines`, `order_line_lot_allocations`, `order_shipping_addresses`, `order_status_history`, plus `outbox`/`processed_events`. Guest checkout, 30-min stock reservation, Crockford base32 order numbers, SHA-256 tracking token, fiscal and lot snapshots | Approved (open items: post-expiry payment handling, discount detail, commercial/PII retention) |
| **Shipping** | Dedicated `internal/shipping` module with 4-table schema: `shipping_zones` ✎, `shipping_zone_areas`, `shipping_rates` ✎, `shipments` ✎, plus `outbox`/`processed_events`. DANE geographic resolution, weight-band rates, free shipping threshold, manual admin dispatch in v1 | Approved (open items: carrier API integration, split shipments) |
| **Notifications** | Dedicated `internal/notifications` module consuming domain events, Resend provider via `net/http` behind `EmailSender` port, no SDK, delivery webhooks, Go html/template | Approved (Spanish customer emails; `template_data` cleared after 90 days, recipient anonymized after 2 years; domain pending) |
| **Reverse Proxy** | Caddy official image pinned by version and digest, automatic HTTPS, static file server (`encode zstd gzip`, `precompressed`), proxy `/api` to Go backend; rate limiting in Go app | Approved (domain configuration pending) |
| **Astro Output Mode** | Static output (`output: 'static'`, no Node.js in production; static assets served by Caddy reverse proxy; Go `embed` rejected) | Approved |
| **Containers** | Single VPS running Docker Compose with per-service memory limits (Go backend, PostgreSQL 18, Caddy reverse proxy); local Docker for PostgreSQL and Testcontainers | Approved (memory limits pending) |
| **Deployment** | Script-based deployment from developer machine, no registry, pre-deploy dump, expand-migrate-contract migrations, Docker Compose restart, health check, auto-rollback | Approved (script creation and secrets pending) |
| **Backups** | Daily `pg_dump -Fc` on VPS + restic to off-site S3-compatible storage with encryption/deduplication, monthly restore drill; PITR deferred | Approved (provider and retention pending) |
| **Monorepo Rules** | Light monorepo (`backend/`, `frontend/`, `deploy/`), Node 26 LTS via `.node-version` + fnm, npm 12 via `devEngines.packageManager`, Taskfile root runner with 7-day quarantine, Go developer tools via `go tool`, strict env validation with `.env.example`, LF line endings (`.gitattributes`), and `.editorconfig` | Approved (secret management pending) |
| **Dependency Policy** | Pre-install audit, exact pinning, script lockdown, signature verification, no broad updates | Approved |
| **Commits and Releases** | Conventional Commits 1.0.0, Keep a Changelog 1.1.0, SemVer 2.0.0, unified `vX.Y.Z` tags, manual discipline | Approved |
| **Microservices Path** | Bounded contexts with zero cross-module SQL joins | Architectural Invariant |

---

## 8. Sources

- Go release history and support policy: https://go.dev/doc/devel/release
- Go vulnerability management and `govulncheck`: https://go.dev/doc/security/vuln/
- `http.CrossOriginProtection` (Go 1.25): https://go.dev/doc/go1.25
- SCS session manager: https://github.com/alexedwards/scs
- SCS `pgxstore` (unqualified `sessions` table): https://pkg.go.dev/github.com/alexedwards/scs/pgxstore
- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- Astro testing guide: https://docs.astro.build/en/guides/testing/
- Conventional Commits 1.0.0: https://www.conventionalcommits.org/en/v1.0.0/
- Keep a Changelog 1.1.0: https://keepachangelog.com/en/1.1.0/
- Semantic Versioning 2.0.0: https://semver.org/spec/v2.0.0/
- npm registry signatures: https://docs.npmjs.com/verifying-registry-signatures/
- npm configuration (`save-exact`, `ignore-scripts`): https://docs.npmjs.com/cli/v11/using-npm/config/
- Go modules reference: https://go.dev/ref/mod
- OSV vulnerability database: https://osv.dev
- GitHub Advisory Database: https://github.com/advisories
- National Vulnerability Database (NVD): https://nvd.nist.gov
- GitHub Security on lifecycle scripts (Shai-Hulud npm worm): https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/
- npm 12 upcoming breaking changes: https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/
- npm 12 release notes: https://github.com/npm/cli/releases/tag/v12.0.0
- npm `approve-scripts`: https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts
- esbuild installation (platform optional dependencies): https://esbuild.github.io/getting-started/
- sharp installation (platform optional dependencies): https://sharp.pixelplumbing.com/install/
- Playwright browsers: https://playwright.dev/docs/browsers
- GitHub Actions billing concepts: https://docs.github.com/en/billing/concepts/product-billing/github-actions
- Dokku registry-less deployment (`docker save | ssh docker load`): https://dokku.com/tutorials/other/deploying-an-image-without-a-registry/
- restic repository preparation: https://restic.readthedocs.io/en/latest/030_preparing_a_new_repo.html
- Backblaze B2 integration with restic: https://www.backblaze.com/docs/cloud-storage-integrate-restic-with-backblaze-b2
- Docker Desktop license: https://docs.docker.com/subscription-billing/desktop-license/
- Node.js release schedule: https://github.com/nodejs/release/blob/main/README.md
- fnm documentation and command reference: https://github.com/Schniz/fnm/blob/master/docs/commands.md
- npm package.json configuration (`devEngines`): https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md
- Taskfile (go-task) environment and dotenv: https://taskfile.dev/docs/guide/environment
- Go modules tool directive: https://go.dev/doc/modules/gomod-ref
- Go 1.24 release notes (tool directive): https://go.dev/doc/go1.24
- Caddy automatic HTTPS: https://caddyserver.com/docs/automatic-https
- Caddy encode directive: https://caddyserver.com/docs/caddyfile/directives/encode
- Caddy file_server directive: https://caddyserver.com/docs/caddyfile/directives/file_server
- Caddy security advisories: https://github.com/caddyserver/caddy/security/advisories
- Caddy rate-limit plugin (xcaddy requirement reference): https://github.com/mholt/caddy-ratelimit
- Resend pricing: https://resend.com/pricing
- Resend emails API: https://resend.com/docs/api-reference/emails
- Resend idempotency keys: https://resend.com/docs/dashboard/emails/idempotency-keys
- Resend webhook signature verification: https://resend.com/docs/webhooks/verify-webhooks-requests
- Google email sender guidelines: https://support.google.com/mail/answer/81126
- RFC 6238 (TOTP: Time-Based One-Time Password Algorithm): https://www.rfc-editor.org/rfc/rfc6238.html
