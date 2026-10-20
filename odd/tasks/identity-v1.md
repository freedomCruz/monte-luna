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

Both authentication and the fixed `owner`/`staff` authorization model are in scope exactly as approved in `docs/domain/identity.md`. V1 preserves administrator records: an `owner` disables accounts instead of permanently deleting them and can reset another administrator's 2FA, which invalidates that administrator's sessions and forces fresh enrollment.

### S3: Environment readiness
> "listo empecemos. Las nuevas variable de entornos están seteadas."

No worker may read, print, copy, log, or place real environment values in Git, task specifications, fixtures, or reports.

## Tasks

| ID | Task | Specs | Route | Depends on | Commit |
| --- | --- | --- | --- | --- | --- |
| T1 | Create this feature document, Engram mirror, Orca Run, and isolated worktrees (done) | S1–S3 | coordinator | — | `22658c2` |
| C1 | Write `contracts/openapi/identity.yaml` for the approved backend-only identity surface; no implementation → Gate G1 (draft complete; onboarding decision and approval pending) | S1, S2 | backend worker | T1 | `1ef92ba` |
| A1 | Audit every new Go dependency and request explicit approval before installation → Gate G2 | S2 | coordinator | C1 | pending |
| B1 | Implement identity schema, repositories, password/encryption primitives, and last-owner invariants using TDD | S2, S3 | backend worker | C1, A1 | pending |
| B2 | Implement PostgreSQL SCS sessions, login/logout, TOTP, recovery codes, lockout, rate limiting, and session invalidation using TDD | S2, S3 | backend worker | B1 | pending |
| B3 | Implement owner/staff authorization, admin management, security events, retention, and bootstrap/emergency CLI using TDD | S2, S3 | backend worker | B2 | pending |
| B4 | Implement password reset tokens and atomic encrypted `identity.password_reset_requested` outbox publication using TDD | S2, S3 | backend worker | B2 | pending |
| I1 | Wire configuration, migrations, routes, middleware, relay integration, docs, and run all backend verification gates | S1–S3 | backend worker + coordinator-owned docs/root files | B3, B4 | pending |
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
- L7 (backend C1): worker commit `1ef92ba` adds only `contracts/openapi/identity.yaml` (997 lines, 15 operations across 12 paths). Worker and coordinator checks: `go test -mod=readonly ./internal/contracttest -count=1` passed; `git diff --check` passed; worktree clean; worker's read-only contract verification reported no blockers. TypeScript generation is explicitly deferred because frontend is out of scope and the current generator has no Identity target. Open decision before Gate G1: how a newly created administrator receives or establishes the initial password.
