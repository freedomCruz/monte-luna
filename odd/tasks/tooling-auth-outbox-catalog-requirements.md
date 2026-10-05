# Tooling, Admin Auth, Outbox Values, and Catalog Requirements

## Goal and scope

Record the user's approvals: Go toolchain policy with `govulncheck`, admin authentication stack, frontend testing stack, outbox operating values, and catalog requirements (roast fixed per product, grind variants with stock, out-of-stock badge, lots with roast date).

Changed: `docs/architecture/system-architecture.md` (tooling rows, Admin Authentication subsection, status rows, Sources), `docs/architecture/data-modeling.md` (section 11 operating values, status, sources), `docs/domain/catalog.md` (new), `AGENTS.md` (catalog domain link), skills `backend-go-modules`, `frontend-astro-islands`, `domain-events-outbox`.

No code, schemas, dependencies, or commits.

## Tasks

- [x] T1 — Record approvals in canonical docs and skills.
- [x] T2 — Independent read-only verification: PASS (consistency, 8 source checks, skill style, links, English). Suggestion applied: clarified `infrastructure.md` section 5 heading. `backend-go-modules` is near the recommended 700-token budget.
- [x] T3 — Report to user.

## Verification and delivery

- No executable tests exist or were run; documentation and skills only.
- Commit: not created; requires explicit user request.

## Pending after this change

- Owning module for admin users and sessions.
- Origin as a reusable entity (proposed).
- Lot inventory design.
- Food health and labeling requirements (not researched).
