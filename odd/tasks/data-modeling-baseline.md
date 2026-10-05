# Data Modeling Conventions Baseline

## Goal and scope

Record the approved database modeling conventions and the transactional outbox decision in canonical documentation.

Authorized changes:
- Create `docs/architecture/data-modeling.md` with approved conventions: normalization policy, identifiers, data types, JSONB policy, indexing, module boundaries in the database, lifecycle and history, inventory, statuses, domain events via transactional outbox, and schema evolution.
- Update `docs/architecture/system-architecture.md` to replace the in-memory-only event bus with the transactional outbox and link the new document.
- Update `AGENTS.md` to list the new canonical document.
- Do not design concrete tables, implement code, select a migration tool, create skills, or commit.

## Constraints

- English for artifacts; Spanish for conversation.
- Approved by user: PostgreSQL 18, UUIDv7 primary keys, transactional outbox, and the researched conventions and trade-off recommendations.
- Pending: concrete per-schema table design (Phase 3 continues), migration tool, outbox polling interval and retention.
- No unverified performance figures presented as facts.

## Tasks

- [x] T1 — Author `docs/architecture/data-modeling.md` and update `system-architecture.md` and `AGENTS.md`.
  - Acceptance: every convention traceable to the approved discussion; sources cited; pending items explicit.
  - Checks: complete readback; cross-links resolve; language compliance.
  - Progress: done. Also softened the unmeasured Go memory figure to "to be measured".
- [x] T2 — Independent read-only verification of source faithfulness and consistency.
  - Result: PASS on consistency, links, source faithfulness (8 claims checked against official sources), language, and absence of unsourced performance figures. Two non-blocking suggestions applied (removed "zero-friction" wording; converted plain-text references to links in `infrastructure.md`).
- [x] T3 — Report to user and continue Phase 3 with the `catalog` schema.

## Verification and delivery

- TDD: not applicable; documentation only.
- No executable tests exist or were run.
- Commit: not created; requires explicit user request.
