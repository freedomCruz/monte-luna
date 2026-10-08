# Identity Domain

Canonical requirements and data model for the `identity` module. Conventions in [data-modeling.md](../architecture/data-modeling.md) apply to every table below.

## 1. Status

| Item | Status |
|---|---|
| Admin authentication requirements (section 2) | Approved |
| Admin roles (`owner`, `staff`) with last-owner invariant | Approved |
| Guest-only checkout in v1 (no customer accounts) | Approved |
| Password reset via outbox event and notifications module | Approved |
| Mandatory TOTP 2FA with recovery codes | Approved |
| Authentication stack (SCS sessions in PostgreSQL, Argon2id, CSRF, secure cookies, rate limiting) | Approved |
| Bootstrap and emergency recovery CLI via SSH | Approved |
| Password reset token validity: 30 minutes | Approved |
| Data model (section 3) | Approved |
| Secret management for application encryption key | Pending |
| Retention policy for `security_events`: 1 year | Approved |
| Customer accounts | Deferred (post-v1) |

## 2. Approved Requirements

**Admin users and roles**
- The system supports multiple admin users with two fixed roles:
  - `owner`: Full system access, including administrator management and fiscal configuration.
  - `staff`: Operational access restricted to catalog, inventory, and order management.
- **Invariant:** At least one active `owner` must always exist in the system. The Go domain layer strictly enforces that the last active owner cannot be disabled, demoted, or deleted.

**Storefront buyer authentication (v1)**
- Guest checkout only in v1: no customer accounts or buyer credentials exist.
- Order lookup and tracking use a dedicated, cryptographically random tracking token generated per order (owned by the `orders` module).
- The `identity` module is designed so customer accounts can be introduced later without mixing customer credentials and admin authentication.

**Password recovery**
- Password recovery is conducted exclusively via emailed reset links.
- The `identity` module does not send emails directly; it publishes an `identity.password_reset_requested` event to its transactional outbox. The `notifications` module consumes this event and delivers the message.

**Two-factor authentication (TOTP 2FA)**
- Mandatory for every administrator.
- Enrollment requires scanning a TOTP secret and submitting the first valid 6-digit verification code (`confirmed_at` timestamp records successful confirmation).
- Administrators receive a set of single-use recovery codes upon enrollment. Regenerating recovery codes immediately deletes all prior unused codes for that user.

**Security stack and controls**
- **Session management:** Server-side sessions using `alexedwards/scs` backed by a custom PostgreSQL store writing to `identity.sessions` using schema-qualified queries.
- **Passwords:** Argon2id via `golang.org/x/crypto/argon2` meeting OWASP minimums (19 MiB memory, 2 iterations, parallelism 1), formatted as PHC strings (`$argon2id$v=19$m=19456,t=2,p=1$...`) to enable transparent parameter upgrades upon successful authentication.
- **CSRF protection:** Go standard library `http.CrossOriginProtection`; state-changing actions are strictly forbidden on `GET`, `HEAD`, and `OPTIONS`.
- **Cookies:** `HttpOnly`, `Secure`, and `SameSite` flags. Session tokens are regenerated on login to prevent session fixation.
- **Rate limiting:** Implemented in the Go application layer to prevent brute-force attacks per account and per IP. Account-level lockout is persisted in `admin_users` (`locked_until`) to survive process restarts and deployments.
- **Session invalidation:** Because SCS session data is serialized and opaque in PostgreSQL, individual sessions cannot be queried by user ID. Invalidation uses a `session_version` counter in `admin_users`, mirrored inside the session payload. Incrementing `session_version` on password changes, user disabling, role modification, or 2FA reset immediately invalidates all active sessions for that user on their next request.

**Bootstrap and emergency recovery**
- Administrative CLI commands executed over SSH on the VPS (e.g., `admin create-owner`, `admin reset-password`) bootstrap the initial owner account and provide out-of-band recovery if email delivery is unavailable.
- Every CLI command writes an audit record to `security_events`.

## 3. Approved Data Model (schema `identity`)

Common columns, omitted from the tables below unless noted:
- `id uuid PRIMARY KEY` (UUIDv7) on every table, except `sessions` which uses `token text PRIMARY KEY` as defined by SCS.
- `created_at timestamptz NOT NULL DEFAULT now()` and `updated_at timestamptz NOT NULL DEFAULT now()` on mutable tables.
- `version integer NOT NULL DEFAULT 1` on admin-edited tables (marked ✎) for optimistic concurrency control.
- Documented deviations from standard conventions:
  - `sessions`: `token text PRIMARY KEY` conforms to the `alexedwards/scs` persistence interface.
  - `security_events`: Append-only audit log; records `created_at` only, no `updated_at`.
  - `admin_recovery_codes`: Single-use records; has `created_at` and `used_at` only, no `updated_at`.
  - `password_reset_tokens`: Single-use tokens; has `created_at`, `expires_at`, and `used_at` only, no `updated_at`.

```text
admin_users ✎ ──< admin_totp_credentials (1:1)
     │
     ├──< admin_recovery_codes
     │
     ├──< password_reset_tokens
     │
     └──< security_events (append-only)

sessions (SCS key-value store)
```

### 3.1 `admin_users` ✎

| Column | Type | Rules |
|---|---|---|
| `email` | `text` | Not null; lowercase only: `CHECK (email = lower(email))`; `UNIQUE` |
| `display_name` | `text` | Not null |
| `role` | `text` | Not null; `CHECK (role IN ('owner','staff'))` |
| `status` | `text` | Not null, default `'active'`; `CHECK (status IN ('active','disabled'))` |
| `password_hash` | `text` | Not null; Argon2id PHC string |
| `password_changed_at` | `timestamptz` | Not null, default `now()` |
| `session_version` | `integer` | Not null, default `1`; incremented on security changes to invalidate active sessions |
| `failed_login_attempts` | `integer` | Not null, default `0`; `CHECK (failed_login_attempts >= 0)` |
| `locked_until` | `timestamptz` | Nullable; temporary account lockout timestamp |
| `last_login_at` | `timestamptz` | Nullable |

### 3.2 `admin_totp_credentials`

| Column | Type | Rules |
|---|---|---|
| `admin_user_id` | `uuid` | FK → `admin_users(id)` ON DELETE CASCADE; `UNIQUE` (one credential per admin) |
| `secret_encrypted` | `bytea` | Not null; encrypted at the application layer using an encryption key from environment; decryptable by backend to verify TOTP codes |
| `confirmed_at` | `timestamptz` | Nullable; null until the first valid TOTP code confirms setup |
| `last_used_step` | `bigint` | Nullable; stores the 30-second time step counter to prevent code replay attacks |

### 3.3 `admin_recovery_codes`

| Column | Type | Rules |
|---|---|---|
| `admin_user_id` | `uuid` | FK → `admin_users(id)` ON DELETE CASCADE; indexed |
| `code_hash` | `text` | Not null; SHA-256 hash of the recovery code |
| `used_at` | `timestamptz` | Nullable; set when the recovery code is consumed |
| `created_at` | `timestamptz` | Not null, default `now()` |

Regenerating recovery codes deletes all existing recovery codes for that admin user.

### 3.4 `password_reset_tokens`

| Column | Type | Rules |
|---|---|---|
| `admin_user_id` | `uuid` | FK → `admin_users(id)` ON DELETE CASCADE; indexed |
| `token_hash` | `text` | Not null, `UNIQUE`; SHA-256 hash of a cryptographically secure random token (≥ 32 bytes). The raw token is never stored |
| `expires_at` | `timestamptz` | Not null; validity 30 minutes |
| `used_at` | `timestamptz` | Nullable; set when token is consumed |
| `created_at` | `timestamptz` | Not null, default `now()` |

Requesting a new password reset token invalidates any previously unused tokens for that user. Password reset endpoints never reveal whether an email address exists in the system.

### 3.5 `sessions`

Stores serialized session payloads for `alexedwards/scs`. Schema-qualified in `identity.sessions`.

| Column | Type | Rules |
|---|---|---|
| `token` | `text` | `PRIMARY KEY` (session identifier generated by SCS) |
| `data` | `bytea` | Not null; encrypted/encoded session state |
| `expiry` | `timestamptz` | Not null; index on `(expiry)` for expired session cleanup |

### 3.6 `security_events` (append-only)

Append-only audit ledger recording authentication and authorization lifecycle events.

| Column | Type | Rules |
|---|---|---|
| `admin_user_id` | `uuid` | Nullable; FK → `admin_users(id)` ON DELETE SET NULL (null for failed logins with non-existent accounts) |
| `event_type` | `text` | Not null; `CHECK (event_type IN ('login_succeeded','login_failed','logout','password_changed','password_reset_requested','password_reset_completed','totp_enabled','totp_reset','recovery_code_used','role_changed','user_disabled','user_created'))` |
| `ip_address` | `inet` | Nullable |
| `user_agent` | `text` | Nullable |
| `metadata` | `jsonb` | Not null, default `'{}'` |
| `created_at` | `timestamptz` | Not null, default `now()` |

Index: `(admin_user_id, created_at)` to support admin activity audits. Rows older than 1 year are deleted by a periodic cleanup job.

### 3.7 Domain Events (schema `identity.outbox`)

Outbox table follows [data-modeling.md](../architecture/data-modeling.md) section 11.

- **`identity.password_reset_requested`**: Published upon valid password reset requests.
  - Payload attributes: `admin_user_id` (uuid), `email` (text), `display_name` (text), `raw_token_encrypted` (text).
  - Security invariant: The raw reset token is encrypted with the application secret key before being written to the outbox payload. It is never stored in plaintext in the database or outbox. The `notifications` consumer decrypts the token in memory solely to construct the reset link and never persists the secret.

## 4. Open Items

- **Secret management:** Strategy for provisioning, storing, and rotating the application symmetric encryption key used for TOTP secrets and outbox reset tokens.
- **Customer accounts:** Deferred to future iterations; architecture ensures storefront buyer accounts can be added without coupling to administrator schemas.

## 5. Sources

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
- RFC 6238 (TOTP: Time-Based One-Time Password Algorithm): https://www.rfc-editor.org/rfc/rfc6238.html
- RFC 9562 (UUIDs): https://www.rfc-editor.org/rfc/rfc9562.html
- Alex Edwards SCS: https://github.com/alexedwards/scs
- SCS pgxstore custom store reference: https://pkg.go.dev/github.com/alexedwards/scs/pgxstore
- Go standard library `http.CrossOriginProtection`: https://go.dev/doc/go1.25
