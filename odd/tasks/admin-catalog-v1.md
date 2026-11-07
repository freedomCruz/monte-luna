# Feature: admin-catalog-v1

Stage 3a of the `/admin` panel: Productos, Producto and Inventario, plus the first image upload path. Branch `feat/admin-catalog-v1` from `main` (`5395836`, tag `v0.1.0-rc.11`). Read this whole document through `## Log` before working.

Canonical sources: `docs/domain/catalog.md`, `docs/design/monteluna/admin/admin.md` and its `canvas/A-*.dc.html` artboards, `docs/design/monteluna/design-system.md`, `docs/architecture/api-conventions.md`, `docs/architecture/data-modeling.md`, `docs/architecture/infrastructure.md`, `contracts/openapi/catalog.yaml`, and the skills `catalog-domain`, `backend-go-modules`, `database-postgres`, `frontend-astro-islands`, `testing`, `dependency-audit`.

## Specs

### S1: Stage 3a scope

The staged plan (`odd/tasks/admin-access-v1.md:11-19`) lists six catalog screens for stage 3. The user split them (L2): **this feature delivers Productos, Producto and Inventario**, and stage 3b (`admin-catalog-taxonomy-v1`) delivers Categorías, Orígenes and Marcas-Tipos. 3a stands alone because products reference categories, origins, brands and product types that already exist from the seed; it reads that taxonomy and never writes it.

The sidebar gains a `Catálogo` group with only the entries whose screens exist after this stage, continuing the rule from stages 1 and 2.

### S2: Productos list

`A-Productos.dc.html` at 1440, 1024 and 768. Search, filters, and the columns the canvas shows per width, following the patterns already built for Pedidos in `admin-orders-v1` (URL-mirrored filters, cursor pagination, sortable columns, loading, empty and error states).

### S3: Producto detail and edit

`A-Producto.dc.html` at 1440, 1024 and 768. Creating and editing a product with its variants, prices and images. Every write is guarded by a strong ETag and `If-Match`, returning `412 version_conflict` on a stale version, exactly as the orders admin writes do.

### S4: Inventario

`A-Inventario.dc.html` at 1440, 1024 and 768. Stock by variant and lot, lot receipts, and the movement ledger.

Thresholds decided by the user (L2), both fixed and global:
- **"Poco stock"**: fewer than 10 units.
- **"Tueste antiguo"**: more than 30 days since the lot's roast date.

Registering a lot receipt must respect the composite keys in `docs/domain/catalog.md` 3.10: lots belong to a product, not to a variant, and `variant_lot_stock` enforces that a variant only receives stock from a lot of its own parent product. The UI is variant-first, so the write resolves or creates the product's lot, upserts the stock row, and records an `inventory_movements` entry with reason `receipt`, all in one transaction.

### S5: Image upload to Cloudflare R2

No upload path exists today: `MediaStorePort` has only `Resolve` (`backend/internal/catalog/domain/model.go:153`) and the adapter just joins a base URL. `infrastructure.md` already approves Cloudflare R2 accessed through `aws-sdk-go-v2/service/s3` behind that port, so the architecture decision is settled, but **adding the SDK is a dependency and stops for `dependency-audit` and explicit user approval before any install**.

Image keys stay relative in the database, as they are today; only resolution prepends the base URL. Uploads validate type and size server-side and never trust a client-supplied key.

### S6: Backend rules

- Admin endpoints use the `adminSession` scheme with `401`/`403`, RFC 9457 problems, and `api-conventions.md`, matching stage 2.
- Optimistic locking on every mutable catalog table through its existing `version` column.
- Invariants the admin writes must enforce, from `docs/domain/catalog.md` and `00001_catalog.sql`: `compare_at_price_amount > price_amount` when present; `UNIQUE (product_id, options)` on variants with options conforming to `attribute_definitions` where `scope = 'variant' AND is_variant_option = true`; and the origin field formats (`country_code`, 5-digit DANE `municipality_code`, altitude ordering).
- No cross-schema reads. Admin identity reaches catalog through the identity public port, as stage 2 did.

### S7: Design fidelity and browser security

Same rules as `admin-access-v1` S3 and S4 and `admin-orders-v1` S8: read every original `.dc.html` and `A-Sistema` before building, replicate composition and responsive behaviour, and compare rendered views against the artboards at every width that has one.

**No catalog screen has a 390 px artboard, and that is deliberate**: `docs/design/monteluna/admin/admin.md:32` blocks catalog management on phones and shows a message to use a computer or tablet. Implement that message; do not invent a mobile layout.

No private data in static HTML; everything hydrates client-side after the session check.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| C1 | Admin catalog contract in `contracts/openapi/catalog.yaml` (products list and detail, product and variant writes, inventory reads, lot receipt, image upload) plus contract tests; resolve the open items in L4 inside the contract and report each resolution | S1–S6 | backend worker | `c9d4ba5`, `5ee0bea`, `1dc60e0`, `ecf8c88` (L7) |
| G1 | **Gate**: user approves the contract | — | user | approved (L7) |
| G2 | **Gate**: user approves the `aws-sdk-go-v2/service/s3` dependency after `dependency-audit` | S5 | user | pending |
| B1 | Media: R2 adapter behind `MediaStorePort`, upload use case with server-side validation, configuration and secrets | S5, S6 | backend worker | pending |
| B2 | Catalog admin reads: products list and detail, inventory by variant and lot, movement ledger, threshold flags | S2–S4, S6 | backend worker | pending |
| B3 | Catalog admin writes: product and variant create and edit, lot receipt with stock upsert and movement, optimistic locking | S3, S4, S6 | backend worker | pending |
| F1 | Frontend foundation: generated types, admin client, `Catálogo` sidebar group, the tablet-and-up gate for phones | S1, S7 | frontend worker | pending |
| F2 | Productos screen | S2, S7 | frontend worker | pending |
| F3 | Producto screen with variants, prices and image upload | S3, S5, S7 | frontend worker | pending |
| F4 | Inventario screen with lot receipt and the two threshold flags | S4, S7 | frontend worker | pending |
| V1 | Integrated verification: verdict per `S#`, visual comparison at 1440, 1024 and 768, independent check of the risk items | S1–S7 | verifier (read-only) | pending |
| R1 | Pull request to `main`; release and staging | S1 | user gate | pending |

Order: C1 → G1 → G2 → (B1 → B2 → B3) in parallel with (F1 → F2 → F3 → F4) against the approved contract and mocks → coordinator merges each worker branch → V1 → R1.

Risks recorded before work: (1) **data**: the first production write path for the catalog; a wrong product, variant or stock write corrupts real inventory, and lot receipts move real numbers. (2) **security**: a file upload endpoint is new attack surface (type and size validation, no client-controlled keys, no path traversal), and R2 credentials are new secrets. (3) **contracts**: `catalog.yaml` currently has only storefront reads; adding admin operations must not change any of the seven existing ones. (5) **dependencies**: the AWS SDK for R2, gated at G2. Items 1, 2 and 3 require the independent verification in V1.

## Log

- L1 (user, 2026-11-05): "prepara la etapa 3 y vemos como se comporta lo que hicimos".
- L2 (user decisions, 2026-11-05): scope: "Partir en 3a y 3b (Recomendado)". Low stock: "Menos de 10 unidades (Recomendado)". Old roast: "Más de 30 días (Recomendado)". Supervisor during this feature: "Simulación primero (Recomendado)" — it watches without acting, and its log is reviewed at the end of the feature against what the coordinator would have done, before granting `--live` in a later one.
- L3 (coordinator exploration, 2026-11-05): `contracts/openapi/catalog.yaml` has **seven operations, all storefront reads**, and states at line 12 that no administration operations exist. In Go, **no catalog entity has a production write path**: products, variants, lots, categories, origins, brands and product types are written only by the seed fixture, and stock changes only through in-process order allocation and release (`catalog.Allocate`, `catalog.Reallocate`, `catalog.Release`). There is no manual stock receipt or adjustment entry point anywhere. `MediaStorePort` exposes only `Resolve`; `backend/go.mod` has no AWS SDK; the only media variable is `MEDIA_BASE_URL`, and no R2 variable exists. Artboards: Productos, Producto and Inventario exist at 1440, 1024 and 768; Categorías, Orígenes and Marcas-Tipos only at 1440; none at 390, which `admin.md:32` makes deliberate.
- L4 (coordinator, open items for C1, to be shown to the user at G1): (a) `A-Marcas-Tipos` renders an "Activo" badge for product types, but `product_types` has no status column; it belongs to stage 3b, but flag it now so the contract does not assume one. (b) `A-Inventario` shows a "Reserva" movement row, yet `inventory_movements.reason` only allows `receipt`, `sale`, `return`, `adjustment`, `damage`, `release`, and order holds are recorded as `sale`; propose how the ledger presents a reservation without inventing an invalid reason. (c) `A-Inventario` displays actor names, but `inventory_movements.actor_id` is a bare UUID with no cross-schema foreign key; propose resolving names through the identity public port or snapshotting them. (d) Propose whether the two thresholds live in the contract as computed flags or as raw values the frontend compares, given both are fixed and global (L2).
- L5 (user + coordinator, 2026-11-06): models, because `local-proxy` (Gemini) is disabled until the user re-enables it: coordinator `claude-bridge/claude-opus-5-5`, backend worker `openai-codex/gpt-6.1-sol`, frontend worker `claude-bridge/claude-sonnet-5-5`, verifier `openai-codex/gpt-6.1-terra` (different from both writers). The Orca supervisor no longer lives in this repository: it is private tooling at `C:/Users/willy/Documents/william/2026/proyectos/orca-supervisor` (no remote, never published), run from this checkout in dry run only; its log is reviewed at the end of this feature as the supervisor live-run gate (its T5) before any `--live`.
- L6 (worker question `msg_c3347168fe0f` during C1, user decisions 2026-11-06, reply `msg_02c27e290090`): (1) after the coordinator explained that the earlier If-Match failures came from Caddy compression rewriting ETags, fixed in `v0.1.0-rc.11` by excluding `/api/v1/admin/*` (`admin-etag-proxy-fix`): "Sí, así". Product creation is `POST` without `If-Match`, returning `201`, `Location` and a strong `ETag`; a duplicate `slug` returns `409`, which prevents double creation on retry. Every update and every child creation (variants, images, lot receipts) requires `If-Match` with the product ETag, `428` when missing, `412 version_conflict` when stale. Every new admin catalog path lives under `/api/v1/admin/` so the proxy exclusion applies. (2) "Fuera de 3a, como excepción explícita": manual stock adjustment (Inventario) and bulk publish/archive (Productos) are not in this stage; they are explicit scope exceptions to show at G1, hidden in the UI. (3) "Puerto público de orders": reserved counts and reservation-vs-sale presentation are composed through an orders public read port, actor names through the identity public port, and the low-stock and old-roast flags are computed by the server. Upload proposal for G1: JPEG, PNG or WebP up to 5 MiB, content type verified by the server, server-generated relative key, multipart upload bound to a product and guarded by its ETag.
- L7 (backend worker C1, Orca task `task_a2c44fcd8372`, dispatch `ctx_a5e1ff00dcdf`, `openai-codex/gpt-6.1-sol`; coordinator review; user G1, 2026-11-06): 18 admin operations, all under `/api/v1/admin/`: products list, detail, create, update; variants create, read, update; product image upload and read; read-only taxonomy lists (categories, origins, brands, product types); inventory by variant, variant detail, lots, movement ledger, and lot receipt. L4 resolutions: (a) no product-type status; (b) stored reason stays `sale`, a `display_kind` of `reservation`, `sale` or `allocation` comes from the orders public read port; (c) `actor_name` is a batch lookup through the identity public port, `null` for the system or a missing identity; (d) server flags `low_stock` below 10 including zero and `old_roast` over 30 America/Bogota calendar days since the production date (exactly 30 is false). Every write except product creation requires the parent **product** ETag and bumps its version, so concurrent edits of different variants of one product conflict with `412`; the user approved that. Uploads: JPEG, PNG or WebP, 5 MiB per file and a 6 MiB request bound, server-generated relative keys. Product edited-by names are not shown, because nothing records them. B2 must add an orders public read projection for held counts per variant and lot, plus the identity batch name lookup. Coordinator checks: `go test ./internal/contracttest/... -count=1` and `go vet` pass; an independent comparison shows the seven storefront path blocks and `common.yaml` byte-identical, only the `info` title and description changed, as pinned by `TestCatalogStorefrontUnchanged`. **G1: user "Aprobado".** The user also declined, for now, a global `orca-supervisor` skill for other projects.
