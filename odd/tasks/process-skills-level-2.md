# Project Skills — Level 2 (Process)

## Goal and scope

Create process skills for testing, Conventional Commits, changelog and release tags, and dependency auditing; record the dependency and release policies in canonical docs; index the skills from `AGENTS.md`.

Approved decisions (2026-10-02):
1. New `testing` skill consolidates test strategy; `backend-go-modules` and `frontend-astro-islands` stay and reference it instead of duplicating rules.
2. Conventional Commits and a Keep a Changelog `CHANGELOG.md`, maintained by agent discipline only. No commitlint, husky, or git-cliff.
3. One product SemVer version and one `vX.Y.Z` tag for the whole monorepo; single root `CHANGELOG.md`.
4. Dependency audit before every install with native tools (`govulncheck`, `npm audit`, `npm audit signatures`) plus manual lookups (OSV.dev, GitHub Advisories, NVD), documentation and maintenance review, alternatives compared when no clear winner, no deprecated packages, minimal footprint, exact pinned versions.

Authorized changes:
- Create `.agents/skills/{testing,conventional-commits,changelog-releases,dependency-audit}/SKILL.md`.
- Update `.agents/skills/backend-go-modules/SKILL.md` and `.agents/skills/frontend-astro-islands/SKILL.md` to reference the new skills.
- Update `docs/architecture/system-architecture.md` sections 6 and 7 and `AGENTS.md` section 4.
- Create root `CHANGELOG.md` skeleton.
- Do not write application code, add dependencies, create tags, or commit.

## Tasks

- [x] T1 — Record dependency, commit, and release policies in `system-architecture.md`; write the four skills; update backend/frontend skills, `AGENTS.md`, and `CHANGELOG.md`.
  - Acceptance: valid frontmatter; style-guide section order; rules link canonical docs; no invented policy; English only.
  - Done (2026-10-02): wrote testing, conventional-commits, changelog-releases, and dependency-audit skills; updated architecture docs, AGENTS.md, backend/frontend skills, and CHANGELOG.md.
- [x] T2 — Independent read-only verification against the style guide and canonical docs.
  - Result: pass with notes. No blocking issues or invented policies. Note: `CHANGELOG.md` compare-link definitions are added at the first release, once a remote exists.
- [x] T3 — Report to user.

## Verification and delivery

- TDD: not applicable; documentation and skills only.
- Commit: not created; requires explicit user request.
