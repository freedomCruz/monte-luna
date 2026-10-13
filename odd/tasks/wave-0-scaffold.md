# Wave 0 Scaffold

Serial monorepo scaffold by the coordinator before Catalog v1 parallel work (D6, `docs/architecture/system-architecture.md` section 6 "Delivery sequence"). Branch `chore/wave-0-scaffold`, merged to `main` through one pull request.

## Specs

- S1 — "D6: ¿Quién hace el scaffold inicial (Taskfile, Node/npm, compose con Postgres, backend Go, Astro + shadcn con tokens Monteluna)?" → "Coordinador en serie (Recomendado)": "Archivos raíz compartidos no se pueden hacer en paralelo; un solo responsable, con auditoría de dependencias que apruebas antes de instalar."
- S2 — Every dependency, runtime, tool, and image is audited per `dependency-audit` and approved by the user before installation, presented in two blocks: base tooling first, then frontend and backend dependencies.
- S3 — Root files per the `monorepo` skill: `.node-version`, `.gitattributes`, `.editorconfig`, `.env.example`, `compose.yaml` (local PostgreSQL 18), `Taskfile.yml`.
- S4 — Each worktree gets its own PostgreSQL database and its own development ports through `task setup` (AGENTS.md section 5, "Isolation").
- S5 — Go backend skeleton in `backend/` that builds, passes its tests, and serves a health endpoint following `docs/architecture/api-conventions.md`.
- S6 — Astro frontend in `frontend/` with React, Tailwind, and shadcn/ui (Radix) themed with the Monteluna tokens; static output.
- S7 — `contracts/openapi/common.yaml` with the shared schemas named in `api-conventions.md` (Problem, pagination envelope, admin session security scheme).
- S8 — `task verify` runs the local checks for both apps; all changes reach `main` through one pull request the user merges. No secrets committed.

## Tasks

| ID | Task | Specs | Route | Commit |
| --- | --- | --- | --- | --- |
| T1 | Audit and approve block 1: Node, npm, Go toolchain, Taskfile, PostgreSQL image (done; Node 26.11.1 and npm 12.2.0 installed in T5 on or after 2026-10-14) | S2 | inline | — |
| T2 | Root files and local PostgreSQL compose (done) | S3, S8 | inline | see Log L6 |
| T3 | Audit and approve block 2: backend and frontend dependencies | S2 | inline | — |
| T4 | Go backend skeleton with health endpoint (TDD) | S5 | inline | — |
| T5 | Astro + shadcn frontend with Monteluna tokens | S6 | inline | — |
| T6 | `contracts/openapi/common.yaml` and health contract | S7 | inline | — |
| T7 | `task setup` per-worktree database and ports | S4 | inline | — |
| T8 | `task verify`, CHANGELOG, pull request | S8 | inline | — |

## Log

- L1 (2026-10-13, user): "Vamos iniciar con D5 y D6" — answers recorded in S1; "listo merge" (PR #3) starts Wave 0.
- L2 (2026-10-13, audit findings): Node 26 is "Current" until LTS on 2026-10-28; v26.11.1 (2026-10-07) clears the 7-day quarantine on 2026-10-14. Go 1.27.2 (2026-10-08) contains security fixes and is younger than 7 days. npm 12.2.0, Task v3.54.0, and `postgres:18.6-bookworm` clear the quarantine; OSV reports no vulnerabilities for npm 12.2.0, Go stdlib 1.27.2, or Task 3.54.0.
- L3 (2026-10-13, user): Node — "miremos la versión recomendad y si no la tenemos instalada usa fnm install"; Go 1.27.2 exception — "explicame más a fondo en que consiste esto de la cuarentena" (pending answer); npm 12.2.0, Task v3.54.0 (winget), `postgres:18.6-bookworm` by digest — "Apruebo todo (Recomendado)". Task install started.
- L4 (2026-10-13, evidence): Task 3.54.0 installed by winget and verified (`task --version`). T2 files written: `.node-version` (26.11.1, installation waits for the quarantine on 2026-10-14), `compose.yaml`, `Taskfile.yml`; `.editorconfig` and `.gitattributes` already existed and match the `monorepo` skill. Checks: `task --list` shows the three `dev:db:*` tasks; `docker compose config` valid; a throwaway project started PostgreSQL 18.6 healthy and was removed. Blocker: the agent safety policy refuses to write `.env.example`; the user creates it.
- L5 (2026-10-13, user): "si la autorizó y ya creé el .env.example" — Go 1.27.2 quarantine exception authorized (security release); record the reason in the commit that pins the toolchain. `.env.example` created by the user (lines indented by 3 spaces; `docker compose --env-file` and Task dotenv both parse it correctly).
