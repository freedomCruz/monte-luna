# Feature: Identity v1 (backend only)

Admin authentication and authorization foundation; the `/admin` frontend is explicitly deferred while its design system is being created.
Rules: `AGENTS.md` section 5 and the `parallel-agents-orca` skill. Read this whole document through `## Log` before working.
Canonical acceptance: `docs/domain/identity.md`, `docs/architecture/system-architecture.md`, `docs/architecture/data-modeling.md`, and `docs/architecture/api-conventions.md`.

## Specs

### S1: Parallel Identity scope
> "En este momento estoy desarrollando el sistema de diseño para el back office y el dashboard. Entonces, más bien lancemos solamente notificaciones, identidad, ¿vale? Con los agentes en paralelo, como te dije. Y primero muéstrame el plan y lo ejecutamos."

The exact backend behavior and data model are the approved requirements in `docs/domain/identity.md`; frontend files are outside this feature.

### S2: Authentication and authorization
> "Cuando me hablas de identidad, estamos hablando de todo lo que tiene que ver con autorización y con autenticación o solo autenticación?"
>
> "Desactivar + restablecer 2FA (Recomendado)"
>
> "Invitación por correo (Recomendado)"

Both authentication and the fixed `owner`/`staff` authorization model are in scope exactly as approved in `docs/domain/identity.md`. V1 preserves administrator records: an `owner` disables accounts instead of permanently deleting them and can reset another administrator's 2FA, which invalidates that administrator's sessions and forces fresh enrollment. An owner-created administrator establishes the first password through a one-time emailed invitation; the owner never chooses or sees it.

### S3: Environment readiness
> "listo empecemos. Las nuevas variable de entornos están seteadas."

No worker may read, print, copy, log, or place real environment values in Git, task specifications, fixtures, or reports.

## Tasks

| ID | Task | Specs | Route | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Create this feature document, Engram mirror, Orca Run, and isolated worktrees (done) | S1–S3 | coordinator | — | `22658c2` |
| C1 | Write `contracts/openapi/identity.yaml` for the approved backend-only identity surface; no implementation (draft complete; superseded by C2 onboarding decision) | S1, S2 | backend worker | T1 | `1ef92ba` |
| C2 | Contract change: replace owner-supplied initial password with one-time emailed administrator invitation → Gate G1 | S1, S2 | backend worker | C1 | `1791f6f` |
| G1 | Gate: user approves Identity OpenAPI contract (`1791f6f`) | S1, S2 | coordinator | C2 | `gate_9627c10949df` (approved) |
| A1 | Audit every new Go dependency and request explicit approval before installation → Gate G2 | S2 | coordinator | G1 | completed |
| G2 | Gate: user approves Identity Go dependencies (`gate_5dfbb967ea44`) | S2 | coordinator | A1 | `gate_5dfbb967ea44` (approved) |
| B1 | Implement identity schema, repositories, password/encryption primitives, and last-owner invariants using TDD | S2, S3 | backend worker | C1, A1 | `1408718`, `00e8cbc` |
| B2 | Implement PostgreSQL SCS sessions, login/logout, TOTP, recovery codes, lockout, rate limiting, and session invalidation using TDD | S2, S3 | backend worker | B1 | `350d676` |
| B3 | Implement owner/staff authorization, admin management, security events, retention, and bootstrap/emergency CLI using TDD | S2, S3 | backend worker | B2 | `6fab275`, `fb1ceda`, `92685ad`, `1aa9eb7` |
| B4 | Implement password reset tokens and atomic encrypted `identity.password_reset_requested` outbox publication using TDD | S2, S3 | backend worker | B2 | `c46567c` |
| I1 | Wire configuration, migrations, routes, middleware, relay integration, docs, and run all backend verification gates | S1–S3 | backend worker + coordinator-owned docs/root files | B3, B4 | in progress |
| V1 | Independently verify every spec and canonical identity invariant on the integrated feature branch | S1–S3 | verifier (read-only) | I1 | pending |

Gates: G1 user approval of the OpenAPI contract; G2 user approval of dependency audit and exact versions. Any later contract change creates a new task and gate.

## Allowed edit surfaces

- Backend worker: `contracts/openapi/identity.yaml`, `contracts/openapi/common.yaml` only when strictly necessary, `backend/internal/identity/**`, and explicitly assigned backend integration files.
- Coordinator: `odd/tasks/identity-v1.md`, canonical/project documentation, changelog, and root configuration files.
- Verifier: read-only.
- Forbidden in this feature: `frontend/**`, `backend/internal/notifications/**`, real `.env` files, deployment, push, PR creation, and merge to `main` without a later user decision.

## Log

- L1 (user): "En este momento estoy desarrollando el sistema de diseño para el back office y el dashboard. Entonces, más bien lancemos solamente notificaciones, identidad, ¿vale? Con los agentes en paralelo, como te dije. Y primero muéstrame el plan y lo ejecutamos."
- L2 (user): "Continua"
- L3 (coordinator plan accepted by next user message): Identity v1 is backend-only in this wave; contracts precede implementation; dependency additions require a separate approval gate; independent verification is required for the security risk.
- L4 (user): "listo empecemos. Las nuevas variable de entornos están seteadas."
- L5 (coordinator): Orca Run `run_ee0898b006f5`; T1 `task_92e5c47b4085` completed; C1 `task_36c3db7673c6`. Coordinator worktree `identity-v1`; worker worktree `identity-v1-backend` on `feat/identity-v1-backend`. An earlier empty Run `run_015e47d215b3` was superseded before any Task was created because a coordinator terminal can be bound to only one Run.
- L6 (user, C1 decision): "Desactivar + restablecer 2FA (Recomendado)" — no permanent deletion endpoint in v1; an `owner` can reset another administrator's 2FA, invalidating the target's sessions and requiring fresh TOTP enrollment. Emergency CLI remains available.
- L7 (backend C1): worker commit `1ef92ba` adds only `contracts/openapi/identity.yaml` (997 lines, 15 operations across 12 paths). Worker and coordinator checks: `go test -mod=readonly ./internal/contracttest -count=1` passed; `git diff --check` passed; worktree clean; worker's read-only contract verification reported no blockers. TypeScript generation is explicitly deferred because frontend is out of scope and the current generator has no Identity target.
- L8 (user, onboarding decision): "Invitación por correo (Recomendado)" — the owner creates name/email/role and never chooses the person's password; Identity atomically creates a one-time 30-minute token and `identity.admin_invited`; Notifications delivers a distinct invitation email; completion sets the password but creates no session and mandatory TOTP still follows. C2 reopens the contract before Gate G1.
- L9 (coordinator): C2 Orca task `task_b5833f097806`, dispatch `ctx_cf7a1b5616e5`, reusing the proven Identity backend terminal. Worker commit `1791f6f` changes only `contracts/openapi/identity.yaml` (+35/-15); worker and coordinator contract tests and diff checks passed; independent worker review approved S1/S2 with no blockers.
- L10 (coordinator): Gate G1 created in Orca as `gate_9627c10949df` blocking `task_b93c762ba41b` (A1 dependency audit).
- L11 (coordinator): User explicitly approved OpenAPI contracts (Gate G1). `gate_9627c10949df` resolved as approved. A1 dependency audit completed for `alexedwards/scs/v2@v2.9.0`, `pquerna/otp@v1.5.0`, `golang.org/x/time@v0.16.0`, and upgrade of `golang.org/x/crypto@v0.58.0` (fixing SSH CVEs). Gate G2 created in Orca as `gate_5dfbb967ea44` blocking `task_6baf52f669aa` (B1).
- L12 (coordinator): User explicitly approved Identity Go dependencies (Gate G2). `gate_5dfbb967ea44` resolved as approved. Dependencies authorized for installation in `backend/go.mod`.
- L13 (backend B1): Worker implemented identity schema, domain invariants, Argon2id/AES-GCM, sqlc queries, and safe administrator persistence in commits `1408718` and `00e8cbc`. Independent verification passed. Task `task_6baf52f669aa` completed.
- L14 (backend B2): Approved dependencies pinned in `backend/go.mod` (commit `736c754`). Worker implemented SCS PostgreSQL sessions, authentication services, TOTP with replay prevention, single-use hashed recovery codes, lockout, rate limiting, and session invalidation in commit `350d676`. Independent verification passed. Task `task_cec1c6f5c111` completed.
- L15 (backend B4): Worker implemented canonical 32-byte single-use 30-minute password reset tokens, shared `identity.password-token` AAD, atomic encrypted `identity.password_reset_requested` outbox events, and session-invalidation primitives in commit `c46567c`. Independent verification passed. Task `task_b58e0d8dde52` completed.
- L16 (backend B3): Worker implemented live owner/staff authorization, atomic encrypted invitations reusing B4 token primitives, optimistic administrator management, fresh-MFA TOTP reset, audit logging with 1-year retention, and stdin-only emergency CLI in commits `6fab275`, `fb1ceda`, `92685ad`, and `1aa9eb7`. Independent verification passed. Task `task_b6d8a24c0f8d` completed.
- L17 (coordinator): Integrated worker branch `feat/identity-v1-backend` into `feat/identity-v1` via merge commit `a6157e9`. Commencing I1 wiring and verification.

