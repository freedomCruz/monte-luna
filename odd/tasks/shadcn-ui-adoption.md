# shadcn/ui Adoption

## Goal and scope

Commit the Monteluna design export and record the approved change of the frontend UI component library from Storefront UI to shadcn/ui in the canonical documents and affected skills.

Approved decisions (user, 2026-10-09):
1. The frontend UI component library changes from Storefront UI (`@storefront-ui/react`) to shadcn/ui with Radix primitives (`--base radix`), copied into the repository through the shadcn CLI and styled with Tailwind CSS.
2. shadcn/ui applies to the storefront and to the `/admin` panel.
3. The full `dependency-audit` (exact versions, licenses, vulnerabilities, install scripts) runs when `frontend/` is scaffolded. Until then only the candidate package set is recorded.
4. `docs/design/monteluna/design-system.md` becomes a canonical document indexed in `AGENTS.md`.
5. Work happens on branch `docs/monteluna-design-system` (renamed from `claude/coffee-store-design-directions-f4b4dc`) with two commits. Push, pull request, and merge remain the user's decisions.

Brand: "Monteluna" is the working brand name for now.

Out of scope: scaffolding `frontend/`, installing any package, font hosting decision, resolving the canvas inconsistencies listed in `design-system.md` section 10.

## Tasks

- [x] T1 — Rename the branch and commit the Monteluna design export with a CHANGELOG entry (commit 1).
- [x] T2 — Record the shadcn/ui decision in `system-architecture.md`, `infrastructure.md`, the `frontend-astro-islands` skill, `design-system.md` status, `AGENTS.md` index, and `CHANGELOG.md`.
- [x] T3 — Read-only consistency check: no stale Storefront UI references outside historical ODD task files; links resolve.
- [x] T4 — Commit the decision (commit 2) and report.

## Verification and delivery

- TDD: not applicable; documentation only.
- Evidence: see "Progress".

## Progress

- T1 done (2026-10-09). Branch renamed to `docs/monteluna-design-system`. Commit `a026118` `docs: add monteluna storefront design export` (37 files, design export plus CHANGELOG entry and export task file). Route: inline (mechanical).
- T2 done (2026-10-09). Route: delegated to `gentle-ai-worker` (multi-file write). Changed `system-architecture.md` (diagram, component system, admin, decision table, new Visual Design System row, shadcn sources), `infrastructure.md` (frontend decision), `frontend-astro-islands` skill (trigger, rules, gate, step, references, candidate package set, npm-only CLI), `design-system.md` status, `AGENTS.md` canonical index, `CHANGELOG.md` `### Changed`.
- T3 done (2026-10-09). Parent review of the diff: ASCII diagram alignment preserved; `grep -i "storefront ui|storefront-ui"` only matches the CHANGELOG transition entry and historical ODD task files; added relative links resolve.
- T4 done (2026-10-09). Committed as `docs: adopt shadcn/ui as frontend component library`; commit id reported to the user and mirrored in Engram (`odd/shadcn-ui-adoption/tasks`). No push.
