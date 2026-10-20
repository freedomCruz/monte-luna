# Feature: Notifications v1 (password reset email)

Transactional email backend for the initial `identity.password_reset_requested` event; real production delivery remains blocked by domain/DNS and legal prerequisites.
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document through `## Log` before working.
Canonical acceptance: `docs/domain/notifications.md`, `docs/domain/identity.md`, `docs/architecture/system-architecture.md`, `docs/architecture/data-modeling.md`, and `docs/architecture/api-conventions.md`.

## Specs

### S1: Parallel Notifications scope
> "En este momento estoy desarrollando el sistema de diseño para el back office y el dashboard. Entonces, más bien lancemos solamente notificaciones, identidad, ¿vale? Con los agentes en paralelo, como te dije. Y primero muéstrame el plan y lo ejecutamos."

The exact backend behavior and data model are the approved requirements in `docs/domain/notifications.md`; frontend files are outside this feature.

### S2: Environment readiness
> "listo empecemos. Las nuevas variable de entornos están seteadas."

No worker may read, print, copy, log, or place real environment values in Git, task specifications, fixtures, or reports. Automated tests use fake local HTTP services and never call Resend.

### S3: Initial integration boundary and webhook resilience
> "Entonces, más bien lancemos solamente notificaciones, identidad, ¿vale?"
>
> "Aprobar las tres reglas (Recomendado)"
>
> "Invitación por correo (Recomendado)"

The initial handled events are the canonically approved `identity.password_reset_requested` and `identity.admin_invited`; order, payment, shipment, and marketing emails are outside this feature. A signed unknown Resend event returns 200 without effects; a supported event for an unknown provider email ID returns 503 without deduplication so it can retry; signature timestamps have a ±5-minute tolerance.

## Tasks

| ID | Task | Specs | Route | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Create this feature document, Engram mirror, Orca Run, and isolated worktrees (done) | S1–S3 | coordinator | — | `fabdea1` |
| C1 | Write `contracts/openapi/notifications.yaml` for the Resend webhook and canonical consumed-event boundary (draft complete; superseded by C2 onboarding decision) | S1, S3 | backend worker | T1 | `ed9f322` |
| C2 | Contract change: add `identity.admin_invited` and its secret-safe invitation-template boundary (draft complete; local-capture wording corrected by C3) | S1, S3 | backend worker | C1 | `63c879d` |
| C3 | Contract correction: permit process-memory-only local capture while prohibiting durable secret persistence → Gate G1 | S1, S3 | backend worker | C2 | `80a402f` |
| G1 | Gate: user approves Notifications OpenAPI contract (`80a402f`) | S1, S3 | coordinator | C3 | `gate_beae6e32aa44` (approved) |
| A1 | Confirm standard-library implementation and audit any proposed dependency before installation → Gate G2 only if a dependency is needed | S2, S3 | coordinator | G1 | completed |
| B1 | Implement notifications schema, repositories, idempotent event intake, suppression checks, and retention using TDD | S1–S3 | backend worker | C1, A1 | `490b444`, `79a7713` |
| B2 | Implement embedded Spanish password-reset HTML/text templates, local capture sender, and secret-safe consumer using TDD → Gate G3 for exact copy | S1–S3 | backend worker | B1 | pending |
| B3 | Implement Resend `net/http` sender, stable idempotency key, retries, and failure isolation using TDD | S1–S3 | backend worker | B2 | pending |
| B4 | Implement signed Resend webhook processing, deduplication, delivery states, bounce/complaint suppressions, and cleanup using TDD | S1–S3 | backend worker | B1, B3 | pending |
| I1 | Wire migrations, consumer registration, configuration, routes, docs, and run all backend verification gates | S1–S3 | backend worker + coordinator-owned docs/root files | B4 | pending |
| V1 | Independently verify every spec and canonical notification invariant on the integrated feature branch | S1–S3 | verifier (read-only) | I1 | pending |

Gates: G1 user approval of the OpenAPI contract; G2 applies only if a new dependency is proposed; G3 user approval of the exact Spanish subject, HTML copy, and text copy. Any later contract change creates a new task and gate.

## Allowed edit surfaces

- Backend worker: `contracts/openapi/notifications.yaml`, `contracts/openapi/common.yaml` only when strictly necessary, `backend/internal/notifications/**`, and explicitly assigned backend integration files.
- Coordinator: `odd/tasks/notifications-v1.md`, canonical/project documentation, changelog, and root configuration files.
- Verifier: read-only.
- Forbidden in this feature: `frontend/**`, `backend/internal/identity/**`, real `.env` files, real network calls in tests, production DNS/deployment, push, PR creation, and merge to `main` without a later user decision.

## Log

- L1 (user): "En este momento estoy desarrollando el sistema de diseño para el back office y el dashboard. Entonces, más bien lancemos solamente notificaciones, identidad, ¿vale? Con los agentes en paralelo, como te dije. Y primero muéstrame el plan y lo ejecutamos."
- L2 (user): "Continua"
- L3 (coordinator plan accepted by next user message): Notifications v1 is backend-only and initially handles password reset; real production delivery is deferred; contracts and copy have explicit gates; independent verification is required for data, webhook, and failure-isolation risk.
- L4 (user): "listo empecemos. Las nuevas variable de entornos están seteadas."
- L5 (coordinator): Orca Run `run_fc90ff0e7fad`; T1 `task_197acecd8888` completed; C1 `task_a34bba5de2c0`. Coordinator worktree `notifications-v1`; worker worktree `notifications-v1-backend` on `feat/notifications-v1-backend`.
- L6 (user, C1 decision): "Aprobar las tres reglas (Recomendado)" — signed unknown event types return 200 without effects; supported events for an unmatched provider email ID return 503 without a deduplication commit; signature timestamps accept a ±5-minute tolerance.
- L7 (backend C1): worker commit `ed9f322` adds only `contracts/openapi/notifications.yaml` (316 lines). Worker and coordinator checks: contract test `go test -mod=readonly ./internal/contracttest -count=1` passed, `git diff --check` passed, worktree clean. Coordinator compared the signature algorithm and delivered/bounced/complained payload fields with the official Resend and Svix documentation; no discrepancy found. Original Orca Gate G1 `gate_f053a7426453` is superseded by C2.
- L8 (user, onboarding decision): "Invitación por correo (Recomendado)" — Notifications also consumes `identity.admin_invited` and renders a distinct Spanish invitation email; decrypted token/link remains memory-only. C2 reopens the contract before Gate G1.
- L9 (coordinator): Original Gate G1 `gate_f053a7426453` resolved as contract changes requested. C2 Orca task `task_a851b23f9bf0`, dispatch `ctx_dfef93d9bc09`. The settled C1 terminal returned `agent_unconfigured` on reuse, so C2 uses fresh Pi terminal `term_a4ce6c83-caeb-4481-83a7-ac8548486393` in the same worker worktree.
- L10 (coordinator review): C2 commit `63c879d` passed the worker and coordinator contract tests and diff checks, but its prohibition on retaining links in local captures contradicted L8's approved local email-capture behavior. C3 must clarify that local capture is process-memory-only and restart-cleared while PostgreSQL, file, and log persistence remain prohibited.
- L11 (backend C3): worker commit `80a402f` clarifies process-memory capture only, with restart clearing and durable persistence prohibited (+5/-3 lines in `contracts/openapi/notifications.yaml`). Worker and coordinator contract tests passed; diff check passed; worktree clean. Gate G1 created in Orca as `gate_beae6e32aa44` blocking `task_5e211e8fb776` (A1 dependency review).
- L12 (coordinator): User explicitly approved OpenAPI contracts (Gate G1). `gate_beae6e32aa44` resolved as approved. A1 completed confirming Notifications v1 uses exclusively Go standard library (`net/http`, `crypto/hmac`, `crypto/sha256`, `html/template`, `text/template`, `sync`) with zero new external dependencies; no Gate G2 required for Notifications.
- L13 (backend B1): Worker implemented canonical 4-table persistence in commits `490b444` and `79a7713`. Integration and schema tests passed against PostgreSQL 18 Testcontainers with adapter coverage 72% and domain coverage 90%. Independent verification passed. Task `task_83f3e41e82cd` completed.

