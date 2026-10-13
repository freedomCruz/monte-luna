---
name: monorepo
description: "Trigger: monorepo, repository layout, root layout, Taskfile, task runner, fnm, node-version, devEngines, gitattributes, editorconfig, env configuration. Manage light-monorepo layout, root tooling, version pinning, and repository conventions."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when changing repository layout, root files, Taskfile tasks, Node.js or npm versions, environment variables, line endings (`.gitattributes`), or editor settings (`.editorconfig`).

Do not use for Go application logic inside `backend/` (load `backend-go-modules`) or Astro UI code inside `frontend/` (load `frontend-astro-islands`). Load `dependency-audit` before adding root tools or changing version pins.

## Hard Rules

- Light monorepo: single repository, no Turborepo, Nx, Bazel, or Pants.
- Layout:
  - `backend/`: Go module (`go.mod` resides here, not at root).
  - `frontend/`: Astro application (`package.json` resides here).
  - `deploy/`: production Compose file, deploy, and backup scripts.
  - `contracts/openapi/`: hand-written OpenAPI 3.1 documents, one per module plus `common.yaml`; source of truth for the HTTP API.
  - `docs/`, `.agents/skills/`, `odd/`.
  - Root files: `AGENTS.md`, `CHANGELOG.md`, `Taskfile.yml`, `.node-version`, `compose.yaml` (local dev PostgreSQL), `.env.example`, `.gitattributes`, `.editorconfig`.
  - Deferred files: create area-specific files only when scaffolding that area.
- Node.js runtime:
  - Node 24 LTS (v24.21.0, Krypton; approved on 2026-10-13).
  - Pinned in root `.node-version`, consumed by fnm (`fnm env --use-on-cd --version-file-strategy=recursive`).
  - Production build containers use the same version. Exact patch chosen under `dependency-audit` when `frontend/` is scaffolded.
- npm package manager:
  - npm 12 enforced in `frontend/package.json` via `devEngines.packageManager` (`{ "name": "npm", "version": "<exact>", "onFail": "error" }`).
  - Installed once per fnm Node version with `npm install -g npm@<exact>`.
  - `devEngines.runtime` check for Node is unverified; verify at scaffold time while treating `.node-version` as single source of truth.
- Task runner:
  - Taskfile (go-task) at root (`Taskfile.yml`), pinned to exact version respecting 7-day quarantine (e.g. `winget install Task.Task --version <exact>`).
  - Loads `.env` via `dotenv` locally; Go backend uses no dotenv library.
  - Namespaced tasks (`dev:db`, `backend:test`, `frontend:test`, `verify`, `deploy`). `verify` runs local CI. Add recurring commands as tasks.
- Go developer tools:
  - Pinned in `backend/go.mod` via `tool` directive (`go get -tool <module>/cmd/<tool>@vX.Y.Z`).
  - Run via `go tool <name>` from `backend/`; never installed globally. Must pass `dependency-audit`.
  - Tools with a large dependency graph (`golangci-lint`) live in a separate `backend/tools.mod`: pin with `go get -modfile=tools.mod -tool <module>@vX.Y.Z`, run with `go tool -modfile=tools.mod <name>`.
- Environment configuration:
  - Root `.env.example` committed with safe placeholders; real `.env` files are never committed.
  - Go backend reads strictly from environment, validates on startup, and fails fast.
  - Production VPS env file lives outside git with restrictive permissions and is loaded by Docker Compose.
  - Astro static builds expose only `PUBLIC_`-prefixed variables to client code. Secret management tooling is pending.
- Repository conventions:
  - `.gitattributes`: `* text=auto eol=lf` and explicit binary flags.
  - `.editorconfig`: UTF-8, LF, final newline, trim whitespace (except `*.md`), tabs for `*.go` and `go.mod`/`go.work`, 2 spaces elsewhere.
  - `.gitignore`: ignores `.env`, `.env.*` (except `!.env.example`), `node_modules/`, `frontend/dist/`, `frontend/.astro/`, and `backend/bin/`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Need monorepo orchestration tool | Reject Nx/Turborepo; use Taskfile |
| Add recurring developer command | Define namespaced task in root `Taskfile.yml` |
| Scaffolding Go backend | Place `go.mod` in `backend/`, not root |
| Scaffolding Astro frontend | Place `package.json` in `frontend/`; enforce npm via `devEngines.packageManager` |
| Adding Go developer tool | Pin with `tool` directive in `backend/go.mod`; run with `go tool` |
| Introducing new configuration | Add placeholder to `.env.example`; validate in Go backend startup |
| Committing secret or real env file | Abort; verify `.gitignore` ignores `.env` and `.env.*` |
| Windows CRLF line endings generated | Enforce LF via `.gitattributes` |

## Execution Steps

1. Verify paths match repository layout (`backend/`, `frontend/`, `deploy/`, `contracts/`) before creating files.
2. Confirm exact version pinning for root tools and runtimes, and the 7-day quarantine for the Taskfile binary.
3. Update `.env.example` whenever new environment variables are introduced.
4. Add recurring commands as namespaced tasks in `Taskfile.yml`.
5. Verify touched files follow `.editorconfig` formatting and `.gitattributes` LF line endings.

## Output Contract

Report:
- Created or updated root configuration files.
- Pinned runtime versions (Node.js, npm, Taskfile, Go tools).
- Taskfile tasks added or altered.
- Compliance with line endings, editor config, and `.gitignore`.
- Pending decisions or unverified runtime checks.

## References

- `docs/architecture/system-architecture.md` — Section 6, Implementation Tooling.
- `docs/architecture/infrastructure.md` — Baseline and pending decisions.
- `.agents/skills/dependency-audit/SKILL.md` — Audit and quarantine rules.
- Node.js Releases: https://github.com/nodejs/release/blob/main/README.md
- fnm Commands: https://github.com/Schniz/fnm/blob/master/docs/commands.md
- npm devEngines: https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md
- Taskfile Environment: https://taskfile.dev/docs/guide/environment
- Go Tool Directive: https://go.dev/doc/modules/gomod-ref
