---
name: identity-domain
description: "Trigger: identity, admin user, authentication, auth, login, password, 2FA, TOTP, recovery code, session, role, usuario, sesión, contraseña. Apply identity invariants, admin authentication, and security policies."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when touching `backend/internal/identity`, the `identity` schema or migrations, admin auth endpoints, `/admin` login or credential flows, or identity security events.

Do not use alone for customer accounts (deferred post-v1; guest checkout only). Load alongside: `backend-go-modules`, `database-postgres`, `domain-events-outbox` (password reset events), `testing`; `frontend-astro-islands` for `/admin` login screens; `dependency-audit` before adding auth dependencies.

## Hard Rules

- Read `docs/domain/identity.md`, `docs/architecture/system-architecture.md`, and `docs/architecture/data-modeling.md` before implementing.
- No cross-schema FKs or joins; actor references use plain `uuid`.
- Other modules access identity exclusively through root package `backend/internal/identity`.
- Primary keys are UUIDv7 (`id uuid PRIMARY KEY`), except `sessions.token` for SCS.
- Optimistic locking with `version integer NOT NULL DEFAULT 1` on admin-edited tables (`admin_users`).
- Two fixed admin roles: `'owner'` and `'staff'`.
- Last active owner invariant: domain forbids disabling, demoting, or deleting the last active owner.
- Passwords hashed with Argon2id PHC strings meeting OWASP minimums (19 MiB, 2 iterations, parallelism 1).
- Mandatory TOTP 2FA for all admins; encrypted at application level (`secret_encrypted`); replay prevented via `last_used_step`.
- Single-use recovery codes hashed with SHA-256; regenerating codes deletes prior unused codes.
- Password reset tokens are single-use, SHA-256 hashed, valid 30 minutes; new requests invalidate prior ones; uniform responses prevent account enumeration.
- Raw reset token encrypted with application key inside `identity.password_reset_requested` outbox payload; never stored in plaintext.
- Server-side sessions use `alexedwards/scs` in `identity.sessions`. Cookie name uses the strict OWASP prefix `__Host-session` (`Secure`, `Path=/`, `HttpOnly`, `SameSite=Lax`, no `Domain` attribute).
- Immediate session revocation via `session_version` in `admin_users` mirrored in session data; incrementing `session_version` invalidates active sessions on next request.
- `security_events` is append-only with 1-year retention; bootstrap and emergency recovery use CLI over SSH.

## Decision Gates

| Situation | Action |
| --- | --- |
| Application encryption key management | Use `APP_ENCRYPTION_KEY` from protected environment variable (`0600` on VPS; approved) |
| Storefront customer registration requested | Reject; deferred post-v1 (guest checkout only) |
| Last active owner demotion or deletion | Reject; invariant violation |
| Password reset requested | Emit encrypted outbox event; respond uniformly |
| Requirement not in domain doc or open item | Stop and ask user; do not invent rules |

## Execution Steps

1. Read `docs/domain/identity.md` and security architecture baseline.
2. Write failing tests first for critical security invariants:
   - Demoting or disabling last active owner is rejected.
   - Incrementing `session_version` invalidates active sessions.
   - TOTP reuse within same step rejected (`last_used_step`).
   - Expired or reused reset token rejected.
   - Reset endpoint returns uniform responses.
   - Raw reset token encrypted in outbox, absent from plaintext logs.
3. Implement `domain/`, `app/`, and `adapters/` packages.
4. Create migrations per `database-postgres` (`goose`).
5. Run verification gates per `testing` and `backend-go-modules`.

## Output Contract

Report:
- Entities, auth endpoints, middleware, and migrations touched.
- Security invariants covered by passing tests.
- Outbox events published (`identity.password_reset_requested`).
- Pending decisions or secret-management items escalated to user.

## References

- `docs/domain/identity.md` — Canonical identity requirements and data model.
- `docs/architecture/system-architecture.md` — Section 6 (Admin Authentication decisions).
- `docs/architecture/data-modeling.md` — Sections 3, 11 (UUIDs, tokens, outbox).
- `docs/domain/notifications.md` — Password reset notification consumer.
