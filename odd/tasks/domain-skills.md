# Domain Skills

## Goal and scope

Create one project skill per approved business module so agents apply each module's invariants, boundaries, events, and verification rules when implementing it. Skills reference the domain documents instead of copying table definitions.

Skills (one per module, `<module>-domain`): `catalog-domain`, `identity-domain`, `notifications-domain`, `orders-domain`, `payments-domain`, `promotions-domain`, `shipping-domain`. Invoicing is already covered by `invoicing-taxes`.

Rules:
- Format and section order of existing project skills (Activation Contract, Hard Rules, Decision Gates, Execution Steps, Output Contract, References); about 400–550 words each; English.
- Hard rules state invariants and boundaries, not column lists; the domain document stays the source of truth.
- Each skill names the technical skills to load alongside (`backend-go-modules`, `database-postgres`, `domain-events-outbox`, `testing`, and others as relevant) and the invariant tests that must exist.
- Open items in a domain document become "stop and ask" gates, never invented rules.

## Tasks

- [x] T1 — Write `catalog-domain`, `identity-domain`, `notifications-domain`, `shipping-domain`.
  - Done: wrote catalog-domain (532 words), identity-domain (549 words), notifications-domain (547 words), and shipping-domain (548 words).
- [x] T2 — Write `orders-domain`, `payments-domain`, `promotions-domain`; update the `AGENTS.md` skills index.
  - Done: wrote orders-domain (550 words), payments-domain (548 words), promotions-domain (511 words); indexed all 7 domain skills in AGENTS.md.
- [x] T3 — Independent read-only verification against the domain documents.
  - Result (2026-10-08): pass, no blocking or non-blocking notes. Values, transitions, and cross-module contracts match the domain docs; open items mapped to stop-and-ask gates.
- [x] T4 — Report to user; commit only on explicit request.

## Verification and delivery

- TDD: not applicable; documentation and skills only.
