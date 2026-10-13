---
name: dependency-audit
description: "Trigger: dependency, package, add dependency, audit dependency, npm install, go get, govulncheck, npm audit. Audit and pin dependencies before proposing them for user approval."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use before proposing, adding, or updating any external dependency: Go modules, npm packages, Go toolchains, Go developer tools, Node.js runtimes, root task runners, GitHub Actions, or container images (pin by digest).

Do not install or update dependencies autonomously. Installing or updating dependencies requires explicit user authorization.

## Hard Rules

- Audit criteria before proposing any dependency:
  - Prefer the standard library or approved dependencies.
  - Read official documentation; confirm it solves the concrete need.
  - Check maintenance: release date, cadence, maintainers, open issues, compatible license.
  - Reject deprecated, archived, or retracted versions (`npm view <pkg> deprecated`, `pkg.go.dev`).
  - Check vulnerabilities in OSV.dev, GitHub Advisory Database, NVD, `govulncheck`, and `npm audit`.
  - Check footprint: transitive dependency count, install scripts, bloat; prefer smallest package covering the need.
  - When no option is clearly best, compare at least two maintained alternatives in a table.
  - Produce an audit report; installation strictly requires explicit user approval.
- Pinning, npm:
  - Exact versions only (no `^` or `~`).
  - Node.js runtime: Node 24 LTS pinned to an exact version in root `.node-version` and read by fnm (`fnm env --use-on-cd --version-file-strategy=recursive`). The production build container consumes the same `.node-version`. Exact patch chosen under `dependency-audit` when `frontend/` is scaffolded.
  - npm 12: exact version enforced in `frontend/package.json` with `devEngines.packageManager` (`{ "name": "npm", "version": "<exact>", "onFail": "error" }`). Installed once per fnm Node version with `npm install -g npm@<exact>`. Verify `devEngines.runtime` check for Node against npm docs at scaffold time; `.node-version` remains the single source of truth.
  - `frontend/.npmrc` sets `save-exact=true` and `min-release-age=7` (npm resolves versions published >7 days ago so compromised releases are caught before install). Scaffolded with `frontend/`.
  - npm 12 install-script policy: dependency install scripts are blocked by npm 12's default `allowScripts` policy; project target is an empty allowlist. Approve a package's scripts only after `dependency-audit`, using version-pinned approvals (`npm approve-scripts <pkg>` writes pinned approvals to `package.json`, committed).
  - Do NOT set `ignore-scripts=true`: it takes precedence over and silently defeats the npm 12 allowlist.
  - Never omit optional dependencies (`--omit=optional`): `esbuild` and `sharp` rely on platform optional dependencies to run without build scripts.
  - Playwright browsers are installed explicitly via `npx playwright install` (development and test environments only; never on the VPS).
  - Never copy `node_modules` between operating systems; production builds install dependencies inside a Linux container.
  - Commit `package-lock.json`; install via `npm ci`.
  - Run `npm audit signatures` post-install to verify provenance.
- Pinning, Go:
  - `go get module@vX.Y.Z` with explicit version (never `@latest`).
  - Go developer tools (`goose`, `sqlc`): pin in `backend/go.mod` using the `tool` directive (`go get -tool <module>/cmd/<tool>@vX.Y.Z`). Run via `go tool <name>` from `backend/`; never install globally; audit per standard criteria. Tools with a large dependency graph (`golangci-lint`) are pinned in a separate `backend/tools.mod` (`go get -modfile=tools.mod -tool ...`) and run with `go tool -modfile=tools.mod <name>`.
  - Commit `go.mod` and `go.sum`; verify with `go mod verify`.
  - Build with `-mod=readonly`.
  - Pin the Go version with the `toolchain` line per Go toolchain policy in `docs/architecture/system-architecture.md`.
- Task runner:
  - Taskfile (go-task): install an exact version (e.g., `winget install Task.Task --version <exact>` on Windows) respecting the 7-day release-age quarantine before adoption.
- Deliberate updates:
  - Repeat the full audit for each version update. Never run broad `npm update` or `go get -u ./...`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Standard library satisfies need | Use standard library |
| Deprecated or retracted package | Reject package; choose maintained alternative |
| Known vulnerabilities found | Reject or find patched version; cite advisory data |
| Multiple viable alternatives | Compare options in a table (size, deps, health) |
| Package requires install scripts | Blocked by npm 12 `allowScripts`; audit scripts, stop and ask user; if approved, record pinned approval with `npm approve-scripts <pkg>` in `package.json` |
| Go developer tool needed (goose, sqlc) | Audit package; pin via `tool` directive in `backend/go.mod`; run with `go tool` |
| Go tool with a large dependency graph (golangci-lint) | Audit package; pin via `tool` directive in `backend/tools.mod`; run with `go tool -modfile=tools.mod` |
| Node runtime or npm version change | Audit release age and status; pin in `.node-version` or `devEngines.packageManager` |
| Task runner update | Audit release age (>7 days); install exact pinned version |
| Native platform binaries needed (esbuild, sharp) | Include optional dependencies; do not use `--omit=optional` |
| Urgent security fix younger than 7 days | Ask the user; if approved, add `min-release-age-exclude[]=<pkg>` for that package only, record the reason in the commit body, and remove the exclusion once the version is 7 days old |
| User approval pending | Present audit report; do not run install command |

## Execution Steps

1. Check standard library and existing dependencies first.
2. Review documentation, maintenance metrics, and license.
3. Check deprecation, OSV.dev, GitHub Advisories, and NVD.
4. Inspect transitive dependencies and lifecycle scripts.
5. Build comparison table if choices exist.
6. Present audit report for user approval.
7. Upon explicit user approval:
   - Go: run `go get module@vX.Y.Z`, `go mod verify`, and `govulncheck ./...`.
   - npm: run `npm ci` / `npm install --save-exact`, verify `package-lock.json`, and run `npm audit signatures`.

## Output Contract

Report:
- Package name, exact version, license, repository URL.
- Maintenance metrics (last release date, cadence, maintainers).
- Security audit findings (OSV, GitHub Advisories, NVD, `govulncheck`, `npm audit`).
- Transitive dependencies and lifecycle script findings.
- Comparison table if multiple alternatives evaluated.
- Confirmation that installation awaits user approval.

## References

- npm signatures: https://docs.npmjs.com/verifying-registry-signatures/
- npm config: https://docs.npmjs.com/cli/v11/using-npm/config/
- npm 12 breaking changes: https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/
- npm approve-scripts: https://docs.npmjs.com/cli/v11/commands/npm-approve-scripts
- esbuild installation: https://esbuild.github.io/getting-started/
- sharp installation: https://sharp.pixelplumbing.com/install/
- Playwright browsers: https://playwright.dev/docs/browsers
- Go modules: https://go.dev/ref/mod
- OSV: https://osv.dev
- GitHub Advisories: https://github.com/advisories
- NVD: https://nvd.nist.gov
- GitHub Security (Shai-Hulud malware): https://github.blog/security/supply-chain-security/strengthening-supply-chain-security-preparing-for-the-next-malware-campaign/
- `docs/architecture/system-architecture.md` — Section 6, Implementation Tooling.
- `.agents/skills/monorepo/SKILL.md` — Light monorepo rules and root tooling.
- Go modules tool directive: https://go.dev/doc/modules/gomod-ref
- Node.js releases: https://github.com/nodejs/release/blob/main/README.md
- npm devEngines: https://github.com/npm/cli/blob/latest/docs/lib/content/configuring-npm/package-json.md
