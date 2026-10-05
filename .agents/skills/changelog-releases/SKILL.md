---
name: changelog-releases
description: "Trigger: changelog, release, release tag, SemVer, Keep a Changelog, vX.Y.Z, version bump. Maintain CHANGELOG.md and execute tag releases on explicit user request."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when recording user-visible changes in `CHANGELOG.md`, planning version increments, or preparing releases and tags.

Do not use automated changelog tools (such as git-cliff). Changelog entries and release preparation are maintained by agent discipline only. Never create or push Git tags without an explicit user request.

## Hard Rules

- Standards:
  - Adhere to Keep a Changelog 1.1.0 and Semantic Versioning 2.0.0.
- Monorepo layout:
  - Single root `CHANGELOG.md` for the entire monorepo.
  - One product version with `vX.Y.Z` repository tags. No per-app or per-package tags.
- Sections:
  - `## [Unreleased]` at top, followed by dated `## [X.Y.Z] - YYYY-MM-DD` sections.
  - Subheadings: `### Added`, `### Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`.
- Writing entries:
  - Written for humans, describing user-visible effects.
  - Derived from Conventional Commits: `feat` -> `Added` (or `Changed`), `fix` -> `Fixed`, security remediations -> `Security`. Note breaking changes explicitly.
  - Omit chores, CI, style, tests, and refactors unless user-visible.
- Timing:
  - Every user-visible change adds an `[Unreleased]` entry in the same work unit.
- SemVer versioning:
  - Initial version is `0.1.0`.
  - Fixes bump patch (`0.1.0` -> `0.1.1`); new features bump minor (`0.1.0` -> `0.2.0`).
  - Breaking changes bump major (while `0.y.z`, breaking bumps minor per SemVer).
- Release execution:
  - Execute release steps only on explicit user request.
  - Move unreleased items into `## [X.Y.Z] - YYYY-MM-DD`. Update compare links.
  - Propose commit `chore(release): vX.Y.Z`.
  - Create annotated tag: `git tag -a vX.Y.Z -m "vX.Y.Z"`.
  - Pushing the tag is a separate user decision.
  - Never move, delete, or reuse a published tag.

## Decision Gates

| Situation | Action |
| --- | --- |
| User-visible feature added | Add bullet under `## [Unreleased]` -> `### Added` |
| User-visible bug fix | Add bullet under `## [Unreleased]` -> `### Fixed` |
| Security fix | Add bullet under `## [Unreleased]` -> `### Security` |
| Internal change (refactor, test, CI) | Skip changelog entry |
| User requests release preparation | Calculate SemVer bump; move Unreleased to dated version |
| Release not requested by user | Keep entries under `## [Unreleased]`; do not tag |

## Execution Steps

1. Draft user-facing entry text in English for the work unit.
2. Place entry under appropriate `## [Unreleased]` subheading.
3. On explicit user release request, calculate version bump.
4. Move `## [Unreleased]` entries to `## [X.Y.Z] - YYYY-MM-DD` and refresh compare links.
5. Propose commit `chore(release): vX.Y.Z`.
6. On user confirmation, run `git tag -a vX.Y.Z -m "vX.Y.Z"`.

## Output Contract

Report:
- `CHANGELOG.md` diff showing new or moved entries.
- Target version bump and justification.
- Status of local tag creation (only if explicitly requested).
- Confirmation that tag push awaits separate user instruction.

## References

- Keep a Changelog 1.1.0 — https://keepachangelog.com/en/1.1.0/
- Semantic Versioning 2.0.0 — https://semver.org/spec/v2.0.0.html
- `docs/architecture/system-architecture.md` — Section 6, Implementation Tooling.
