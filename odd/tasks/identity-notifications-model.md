# Identity and Notifications Domain Models

## Goal and scope

Record the approved notification decisions, document the proposed `identity` and `notifications` data models in domain documents, and draw the notifications ERD in Eraser.

Approved decisions:
- Identity scope (2026-10-06): several admin users with two fixed roles (`owner`, `staff`); guest checkout only in v1; admin password recovery by email link; TOTP 2FA required with recovery codes.
- Notifications (2026-10-06): Resend as the transactional email provider, called with plain `net/http` behind an `EmailSender` port (no SDK); dedicated module `internal/notifications` consuming domain events through the outbox.

Proposed (pending user approval): the `identity` data model (6 tables) and the `notifications` data model (4 tables), plus retention values.

Still pending: domain name (now blocks email authentication: SPF, DKIM, DMARC), secret management (encryption key for TOTP secrets and reset tokens in events), customer-facing language, privacy policy under Ley 1581.

## Tasks

- [x] T1 — Write `docs/domain/identity.md` and `docs/domain/notifications.md`; update `system-architecture.md`, `data-modeling.md`, `infrastructure.md`, and `AGENTS.md`. (Completed domain documents and updated architecture/infrastructure references)
- [x] T2 — Draw the notifications ERD in Eraser.
  - Diagram `J5LVL5WlSPksTTrxyUJe` in file `11T3dyhOIILEDaQwpdTJ` (identity diagram: `GBLqldTuZ6KPZ090juic`).
- [x] T3 — Read-only consistency check.
  - Result: only allowed files changed; schemas listed in data-modeling.md; AGENTS.md links resolve. Fixed one status row: the bootstrap CLI was marked approved but is still a proposal.
- [x] T4 — Report to user and request model approval.
  - Result (2026-10-06): both data models approved; statuses updated in both domain docs, `system-architecture.md` section 7, and `AGENTS.md`. Retention values, bootstrap CLI, and email language remain pending.

## Verification and delivery

- TDD: not applicable; documentation only.
- Commit: not created; requires explicit user request.
