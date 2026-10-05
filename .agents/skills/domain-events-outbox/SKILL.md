---
name: domain-events-outbox
description: "Trigger: domain event, outbox, publish event, consumer, subscriber, idempotent, webhook dedup, cross-module side effect. Implement transactional outbox events and idempotent consumers."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when a change in one module must trigger an effect in another module, or when handling external webhooks.

Do not use for cache invalidation (direct in-memory call) or rules inside one module (same SQL transaction).

## Hard Rules

- Read `docs/architecture/data-modeling.md` section 11 before implementing.
- Insert the event into the producing module's own outbox table (for example `payments.outbox`) in the same transaction as the state change.
- Event rows carry a UUIDv7 `id`, a type name, the occurrence time, and a payload with the data consumers need.
- The relay lives in `backend/internal/platform`, claims rows with `SELECT ... FOR UPDATE SKIP LOCKED`, dispatches them, and marks them delivered.
- Delivery is at least once. Every consumer is idempotent: in the same transaction as its effect, insert the event `id` into its own schema's `processed_events` with `ON CONFLICT DO NOTHING`; if no row was inserted, skip the effect.
- Do not assume global ordering; guard state transitions so a late or repeated event cannot move an entity backwards.
- Deduplicate incoming payment and provider webhooks by the provider's event identifier before acting.
- Never publish from memory after commit as a substitute for the outbox.
- Operating values come from configuration, with the approved defaults in `data-modeling.md` section 11: polling every 1 second in batches of 100, delivered events and `processed_events` kept 7 days, hourly cleanup, webhook deduplication kept 30 days, failed events retried with backoff and never deleted automatically.

## Decision Gates

| Situation | Action |
| --- | --- |
| Effect with business consequences in another module | Outbox |
| Cache invalidation | Direct in-memory call |
| Same-module rule | Same SQL transaction, no event |
| Changing an existing event's payload | Keep backward compatibility or add a new event type; ask if unsure |
| Need immediate relay wake-up | `LISTEN/NOTIFY` is allowed as an optimization, never as the only delivery path |

## Execution Steps

1. Write tests first: rollback leaves no event; a duplicate delivery produces one effect; a failed consumer is retried.
2. Write the event in the producer's transaction.
3. Implement the consumer with the `processed_events` guard.
4. Register the consumer with the relay in `backend/cmd/server/main.go`.
5. Run every verification gate.

## Output Contract

Report:
- Event types added or changed, producers, and consumers.
- Test results for atomicity, duplicate delivery, and retry.
- Configuration values still pending and residual risks.

## References

Paths are relative to the repository root.

- `docs/architecture/data-modeling.md` — section 11, transactional outbox.
- `docs/architecture/system-architecture.md` — section 5, inter-module isolation.
