---
name: conventional-commits
description: "Trigger: commit, commit message, Conventional Commits, git commit, work unit. Format commit messages following Conventional Commits 1.0.0 and project scope rules."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when drafting, structuring, or proposing Git commit messages for repository work.

Do not execute Git write commands (`git commit`, `git commit --amend`, `git rebase`, `git push`) autonomously. Git commits and pushes require an explicit, unambiguous user request.

## Hard Rules

- Format follows Conventional Commits 1.0.0:
  `<type>(<scope>)!: <subject>`
- Types:
  `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.
- Scopes:
  `catalog`, `orders`, `payments`, `identity`, `invoicing`, `promotions`, `platform`, `db`, `frontend`, `admin`, `deps`, `skills`, `docs`, `infra`.
  Omit scope when changes are cross-cutting.
- Subject line conventions:
  - Imperative English ("add product filter", not "added product filter").
  - Start with a lowercase letter; no trailing period; maximum 72 characters.
- Body rules:
  - Separate body from subject with a blank line.
  - Explain the motivation: why the change was made, not code mechanics.
- Breaking changes:
  - Append `!` after type or scope (`feat(catalog)!: ...`).
  - Include a `BREAKING CHANGE: <explanation>` footer explaining breaking changes and migration.
- Dependency changes:
  - Use `build(deps): <subject>`.
  - Body must cite the dependency audit result performed per `dependency-audit`.
- Work units:
  - One reviewable work unit per commit, bundling implementation, tests, and documentation together.
- Enforcement and safety:
  - Enforced solely by agent discipline; no commitlint, husky, or Git hooks.
  - Never run `git commit`, amend, rebase, or push without an explicit user instruction.
  - Never use `--no-verify` or rewrite published history.

## Decision Gates

| Situation | Action |
| --- | --- |
| New user-facing or domain capability | Use `feat(<scope>): ...` |
| Defect or regression fix | Use `fix(<scope>): ...` |
| Dependency update or addition | Use `build(deps): ...` and cite audit in body |
| Breaking API or contract change | Add `!` and `BREAKING CHANGE:` footer |
| Repository-wide cross-cutting change | Omit scope: `<type>: <subject>` |
| Release preparation commit | Use `chore(release): vX.Y.Z` |
| No user request to commit | Present proposed message; do not execute `git commit` |

## Execution Steps

1. Verify tests, docs, and code for the work unit are complete.
2. Select type and matching scope from allowed lists.
3. Check for breaking changes and add `!` and footer if applicable.
4. Compose imperative subject under 72 characters without trailing period.
5. Compose body detailing motivation and audit notes.
6. Present the proposed commit message to the user; wait for explicit instruction before committing.

## Output Contract

Report:
- Proposed commit subject line.
- Proposed commit body and footers (`BREAKING CHANGE:`, dependency audit citations).
- Scope and type classification rationale.
- Explicit confirmation that no Git write commands were executed without user instruction.

## References

- Conventional Commits 1.0.0 — https://www.conventionalcommits.org/en/v1.0.0/
- `docs/architecture/system-architecture.md` — Section 6, Implementation Tooling.
