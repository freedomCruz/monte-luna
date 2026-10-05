# Invoicing and Taxes Baseline

## Goal and scope

Record the approved fiscal approach in canonical documentation.

Authorized changes:
- Create `docs/architecture/invoicing-and-taxes.md`: responsibilities, merchant fiscal profile, tax categories, dated rates and thresholds, order tax snapshot, withholdings in payment settlements, provider options, Colombian reference facts with sources.
- Update `docs/architecture/data-modeling.md` (tax and settlement data rules), `docs/architecture/system-architecture.md` (invoicing and payments module descriptions, status table), and `AGENTS.md` (new canonical source).
- Do not implement code, pick an invoicing provider, create skills, or commit.

## Constraints

- English artifacts; Spanish conversation.
- Approved: fiscal profile as configuration, tax category per variant, dated rates/UVT/thresholds, withholdings in settlement reconciliation, demo default Scenario A (natural person not responsible for VAT).
- Pending: invoicing provider, whether v1 issues fiscal documents, tax-inclusive pricing policy, single currency COP.
- Documentation is not tax advice; each merchant's regime is decided with an accountant.

## Tasks

- [x] T1 — Author the new document and update related canonical documents.
  - Acceptance: approved vs pending items explicit; every legal fact cites an official or primary source; no invented rates or thresholds.
  - Checks: complete readback; links resolve; English.
  - Progress: created `docs/architecture/invoicing-and-taxes.md`; updated `data-modeling.md` (new section 13, sources now 14), `system-architecture.md` (payments settlements, invoicing link, status rows), and `AGENTS.md`.
- [x] T2 — Independent read-only verification of consistency and source faithfulness.
  - Result: PASS on consistency, links, source faithfulness (8 groups of legal and Factus claims), framing as software requirements, and English. Two non-blocking suggestions applied (deep Factus source links; wording of the "None" provider option).
- [x] T3 — Report to user and continue Phase 3.

## Verification and delivery

- TDD: not applicable; documentation only.
- No executable tests exist or were run.
- Commit: not created; requires explicit user request.
