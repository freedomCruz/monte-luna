# Project Skills — Level 1 (Technical Areas)

## Goal and scope

Create five project skills that encode construction and verification rules for each technical area, and index them from `AGENTS.md`.

Authorized changes:
- Record approved tooling in `docs/architecture/system-architecture.md`, `docs/architecture/data-modeling.md`, and `docs/architecture/infrastructure.md`.
- Create `.agents/skills/{backend-go-modules,database-postgres,domain-events-outbox,frontend-astro-islands,invoicing-taxes}/SKILL.md`.
- Add a project skills index to `AGENTS.md`.
- Do not design concrete schemas, write application code, add dependencies, or commit.

## Constraints

- Follow the gentle-pi skill style guide: frontmatter, section order, concise imperative rules, local references.
- Skills link canonical docs instead of duplicating decisions.
- Do not invent policies: anything not approved is marked as pending or requires asking the user.
- English only.

## Tasks

- [x] T0 — Record approved tooling (monorepo, `net/http`, `goose`, TDD + Testcontainers, `golangci-lint` + `depguard`, `npm`) in canonical docs.
- [x] T1 — Write the five skills and the `AGENTS.md` index.
  - Acceptance: valid frontmatter; required section order; each skill has verification gates; pending items explicit; references resolve.
  - Progress: five skills of about 440–500 words each; `AGENTS.md` section 4 indexes them.
- [x] T2 — Independent read-only verification against the style guide and canonical docs.
  - Result: one blocking issue (missing non-activation clause in `invoicing-taxes`), fixed. No contradictions or invented policies. Two operationalized conventions documented in `system-architecture.md`: module public contract in the root package, and serializable island props.
  - Remaining pending items surfaced by the skills: migration directory layout, `/admin` authentication design, frontend test tooling.
- [x] T3 — Report to user; next: concrete schema design using the skills.

## Verification and delivery

- TDD: not applicable; documentation and skills only.
- No executable tests exist or were run.
- Skill registry: the gentle-pi registry scans user-level directories only; project skills are discovered through the `AGENTS.md` index.
- Commit: not created; requires explicit user request.
