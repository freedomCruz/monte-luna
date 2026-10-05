# Monorepo Rules

## Goal and scope

Record the light-monorepo rules in canonical docs, create the `monorepo` skill, and add the repository convention files that need no dependency (`.gitattributes`, `.editorconfig`, `.env` ignore rules).

Approved decisions (2026-10-05):
1. Node.js 26 LTS (Active LTS from 2026-10-28, end of life 2029-04-30), pinned exactly in a root `.node-version` read by fnm. Exact patch chosen under `dependency-audit` when `frontend/` is scaffolded.
2. npm 12 exact version enforced with `devEngines.packageManager` (`onFail: "error"`) in `frontend/package.json`; installed once per fnm Node version with `npm install -g npm@<exact>`.
3. Taskfile (go-task) as the root task runner; exact version respecting the 7-day release-age rule; loads `.env` locally so the Go backend needs no dotenv library.
4. Go developer tools (`goose`, `sqlc`) pinned with the `go.mod` `tool` directive and run with `go tool`; they still pass `dependency-audit`.
5. Light monorepo without Turborepo, Nx, Bazel, or Pants (approved 2026-10-05 together with npm 12).

Conventions proposed earlier and applied here (no new tools): `.gitattributes` with LF line endings, `.editorconfig`, environment-variable rules (`.env.example` committed, `.env` ignored, configuration from the environment only).

Still pending: secret-management tooling, reverse proxy, static file server, optional GitHub Actions PR checks.

## Tasks

- [x] T1 — Update canonical docs and skills; create the `monorepo` skill and convention files. Recorded light-monorepo rules, created `monorepo` skill, updated related skills/docs, and created repository convention files.
- [x] T2 — Independent read-only verification.
  - Result: pass with notes, no blockers. Fixed both notes: stale "Node.js version pending" text in the Dependency policy row, and the 7-day quarantine wording in the monorepo skill (applies to the Taskfile binary, not Node runtimes).
- [x] T3 — Report to user.

## Verification and delivery

- TDD: not applicable; documentation and configuration only.
- Commit: not created; requires explicit user request.
