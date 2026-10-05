# System Architecture Baseline

## Goal and scope

Document the approved system architecture for the e-commerce project in `docs/architecture/system-architecture.md` and update `docs/architecture/infrastructure.md` to reflect approved technical selections.

Authorized changes:
- Create `docs/architecture/system-architecture.md` defining Frontend (Astro + React islands + Storefront UI + Tailwind CSS), Backend (Go Modular Monolith with Pragmatic Hexagonal Architecture per domain), Database (PostgreSQL 16 with isolated schemas, no cross-module foreign keys, immutable snapshots), and In-Memory Cache (interface-driven port).
- Update `docs/architecture/infrastructure.md` to check off approved frontend, backend, and database engine selections.
- Update root `AGENTS.md` if necessary to reference the new architecture document.
- Do not implement application code, purchase services, create skills, or execute git commits/pushes without explicit authorization.

## Constraints

- English for all project documentation and artifacts.
- User conversation remains in Spanish.
- Strict discussion order: Infrastructure (Done) -> Architecture (Frontend/Backend) (Current) -> Database Model & Rules (Next) -> Hierarchical Skills by area.
- VPS target constraints: Contabo 4 vCPU / 8 GB RAM / 100 GB SSD (unconfirmed acquisition).

## Tasks

- [x] T1 — Author `docs/architecture/system-architecture.md` and update `docs/architecture/infrastructure.md`.
  - Route: inline direct documentation writing.
  - Acceptance: Clear English documentation of Modular Monolith in Go, Hexagonal domains, in-memory cache, isolated schemas, and Astro frontend islands.
  - Checks: complete readback of both files, markdown validation, language compliance.
- [x] T2 — Verify architectural documentation consistency.
  - Acceptance: Verify consistency between infrastructure constraints and system architecture.
  - Checks: complete readback and validation of references across AGENTS.md, docs/architecture/infrastructure.md, and docs/architecture/system-architecture.md.
- [x] T3 — Present approved architecture to user and transition to Phase 3 (Database Model & Rules).
  - Acceptance: Clear Spanish summary to the user outlining the architecture and introducing database modeling.
  - Checks: presentation delivered to user; ready to initiate database schema and rules definition.
