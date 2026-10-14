# Catalog v1

First feature built by parallel agents (Orca + Pi): a read-only storefront for the catalog module over demo data. Branch `feat/catalog-v1`; worker branches `feat/catalog-v1-backend` and `feat/catalog-v1-frontend`; one pull request to `main` that the user merges.
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document up to `## Log` before working on any task.

## Specs

- S1 — Scope (`docs/architecture/system-architecture.md` section 6, "Delivery sequence"): "Then Catalog v1 is the first feature built by parallel agents: read-only storefront (shop listing, product detail with variants, live price and stock, origin page) over demo data loaded by migration or seed. Catalog administration in `/admin` follows after the identity module provides admin login".
- S2 — Hybrid data (`system-architecture.md` section 2): "Stable catalog content (product and origin pages, descriptions, attributes, images, categories) is fetched from the public API at build time and pre-rendered. Volatile data (current price, compare-at price, stock availability, next lot roast date) is fetched by the purchase island in the browser when the page loads, so it is always current. Pre-rendered pages never show an authoritative price or stock without that refresh."
- S3 — Roast date (`docs/domain/catalog.md` section 2): "The storefront shows the roast date of the lot the next buyer will receive: the oldest lot with available stock for that variant."
- S4 — Out of stock (`catalog.md` section 2): "When a variant has no available stock, the storefront shows an out-of-stock badge and disables add-to-cart; the backend rejects the purchase regardless." The design system adds: "a sold-out option also says \"Agotado\"".
- S5 — Origin page (`docs/design/monteluna/design-system.md` section 8): "one template rendered per origin. Variety, process, tasting notes, cupping score, and roast are product attributes and never appear as origin facts. A product without an origin shows no origin link."
- S6 — Data model: the approved schema `catalog` in `docs/domain/catalog.md` section 3, with the conventions of `docs/architecture/data-modeling.md`. Stock lives in `variant_lot_stock`; "Allocation picks oldest lot first (`production_date`)" (`catalog-domain` skill).
- S7 — Contract (`AGENTS.md` section 5): "The backend worker writes the module contract (task C1) following `docs/architecture/api-conventions.md`." and "**Gate: the user approves the contract.** Nothing runs in parallel before this approval." Storefront reads address products and origins by `slug`; live price and stock endpoints send `Cache-Control: no-store` (`api-conventions.md` sections 1 and 9).
- S8 — Design: storefront screens follow the Monteluna design system and its canvas screens `M-Listado`, `M-Detalle`, `M-Origen`, and `M-Origen-Cacao` (desktop and `-390` mobile), using its tokens only.
- S9 — Dependencies (`AGENTS.md` section 5): "dependency installation needs `dependency-audit` and user approval".
- S10 — Isolation (`AGENTS.md` section 5): "Each worktree uses its own local PostgreSQL database and its own development ports, so migrations and servers never collide."
- S11 — Models per role (user, L2–L4): coordinator "siempre opus 5.5 y para las tomas de decisiones importantes"; backend `openai-codex/gpt-6.1-sol`; frontend `local-proxy/gemini-3.8-flash-high`; verifier `claude-bridge/claude-sonnet-5-5`. "la idea es que una vez lance no pieda modelo a mí, no quiero aquí human in the loop".

## Tasks

| ID | Task | Specs | Owner (model) | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Feature document; `parallel-agents-orca` skill records models and unattended launch (done) | S11 | coordinator (Opus 5.5) | — | this commit |
| T2 | Per-worktree values derived at run time so a shared `.env` works in every worktree; `.worktreeinclude` | S10 | coordinator | T1 | — |
| T3 | Audit pgx, sqlc, goose, Testcontainers, Playwright, axe-core → gate G1 (user) | S9 | coordinator | T1 | — |
| C1 | `contracts/openapi/catalog.yaml`: listing, product detail, origin, categories, live variant availability → gate G2 (user) | S1–S7 | backend worker (gpt-6.1-sol) | T1 | — |
| B1 | Migrations for schema `catalog` and demo seed (coffee and cacao, origins, lots with stock) | S1, S6 | backend worker | G1, G2, T2 | — |
| B2 | Catalog read API against the contract (contract tests, Testcontainers adapters, oldest-lot roast date) | S2–S4, S6, S7 | backend worker | B1 | — |
| F1 | Pre-rendered listing, product detail, and origin pages from generated types and mocks | S1, S2, S5, S8 | frontend worker (gemini-3.8-flash-high) | G2 | — |
| F2 | Purchase island: live price, compare-at, stock, roast date, "Agotado" badge, disabled add-to-cart | S2–S4, S8 | frontend worker | F1 | — |
| F3 | Playwright + axe-core flows for the three pages | S4, S8 | frontend worker | F2, G1 | — |
| I1 | Integrate worker branches into `feat/catalog-v1`; build against the real API; `task verify` | all | coordinator | B2, F3 | — |
| V1 | Read-only verification with a verdict per spec | all | verifier (Sonnet 5.5) | I1 | — |
| T4 | CHANGELOG and pull request to `main` | S1 | coordinator | V1 | — |

## Log

- L1 (2026-10-14, user): "empecemos el catalog".
- L2 (2026-10-14, user): "tenemos modelos como sonnet 5.5 y también gemini-flash-3.8 que es bueno para escribir código, en el verificador puedes usar alguno de codex gpt-sol-6.1 y en el backend también. El orquestador siempre opus 5.5 y para las tomas de decisiones importantes."
- L3 (2026-10-14, user): frontend model "gemini-flash-3.8 (recomendado)"; verifier independence "Otro modelo para el verificador" → Sonnet 5.5 (a provider different from both writers).
- L4 (2026-10-14, user): "pero en las pruebas que se trabajaron pi, si se le indica, en la instrucción, no recuerdo bien como, eso quedó en engram, puede elegir el modelo revisa eso; la idea es que una vez lance no pieda modelo a mí, no quiero aquí human in the loop". Engram #303 and #324 (multiagent pilots, P3 with 0 interventions): `orca terminal create --command "pi --model <provider/id>"`, then `orca orchestration worker-start --terminal <handle>`. Model ids confirmed with `pi --list-models`.
- L5 (2026-10-14, coordinator): Out of scope per S1: cart, checkout, home page, origins index, `/admin`. Demo data goes in a seed applied by a task, not in a migration, so production databases never receive demo rows; the user can object at gate G2. Open product question for G2: on the read-only product page, render the add-to-cart button disabled, or omit it until the cart exists.
- L6 (2026-10-14, user): "Sí, autoriza commits e integraciones en la feature (recomendado)" — standing authorization for conventional local commits on `feat/catalog-v1` and the worker branches, and for coordinator merges into `feat/catalog-v1`. Push, pull request, and merge to `main` remain the user's.
