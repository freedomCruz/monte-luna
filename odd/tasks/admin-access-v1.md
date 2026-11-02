# Feature: admin-access-v1

Stage 1 of the `/admin` panel: the shell (sidebar and top bar at 1440, 1024, 768 and 390 px) and the access and security screens, built **frontend only** over the Identity API already live in `v0.1.0-rc.8`. Built inline by the coordinator (no workers), test first, with visual comparison against the admin canvas. Branch `feat/admin-access-v1`, stacked on `docs/admin-design` (PR #35). Read this whole document through `## Log` before working.

Canonical sources: `docs/design/monteluna/admin/admin.md` and its `canvas/A-*.dc.html` artboards, `docs/design/monteluna/design-system.md`, `contracts/openapi/identity.yaml`, `docs/domain/identity.md`, `.agents/skills/frontend-astro-islands/SKILL.md`, `.agents/skills/identity-domain/SKILL.md`, `.agents/skills/testing/SKILL.md`.

## Staged plan for the whole admin (context, not this feature's scope)

| Stage | Feature | Screens | Backend work |
|---|---|---|---|
| 1 | `admin-access-v1` (this document) | Shell, Login, 2FA, 2FA-Activar, Recuperar (request and set password, also for invitations), Cuenta, Sin-Acceso, Admins | None: Identity API exists |
| 2 | `admin-orders-v1` | Pedidos, Pedido, Registrar despacho, Inicio (order data only) | New admin contracts for orders and shipping |
| 3 | `admin-catalog-v1` | Productos, Producto, Inventario, Categorías, Orígenes, Marcas-Tipos | New catalog admin contract, media upload to R2 |
| 4 | `admin-payments-shipping-v1` | Pagos (refunds), Envíos (zones and rates), Informes | New admin contracts |
| 5 | `promotions-v1` and owner settings | Cupones, Fiscal, Facturación, Correos, Seguridad | Promotions module does not exist yet; invoicing and notifications admin surfaces |

Decisions deferred to their stage: low-stock threshold (canvas proposes fewer than 10 units) and old-roast threshold (more than 30 days), stage 3; the "Ventas por producto" report and CSV export, stage 4.

## Specs

### S1: Stage 1 first
> "ya tienes el design system de admin por favor revisa y hagamos el plan para comenzar a trabjar esto"

User selected: "Sí, etapa 1 primero (Recomendado)". Scope: the admin shell and the screens `A-Login` (and `-390`), `A-2FA`, `A-2FA-Activar`, `A-Recuperar` (reset request, and the set-password form reached from `/admin/restablecer-contrasena#token=...` and `/admin/invitacion#token=...`, routes fixed by `docs/domain/identity.md`), `A-Cuenta`, `A-Sin-Acceso`, and `A-Admins` (owner only). Every screen uses only the endpoints in `contracts/openapi/identity.yaml`.

### S2: Password rule from Identity
User selected: "Seguir identity: 12 a 128, sin más reglas (Recomendado)". The UI states and checks only 12 to 128 characters (Unicode code points). It does not show or enforce "not containing the email or name" or "not in leaked-password lists" from the canvas proposals.

### S3: Design fidelity
Per `AGENTS.md` (Frontend Component Design and Review) and `admin.md`: read each screen's original `.dc.html` (desktop, tablet, mobile where they exist) and `A-Sistema.dc.html` before building it; replicate composition, typography, spacing, radii, 44 px controls, badge tones, and the width rules (1440 sidebar 248 px; 1024 and 768 icon sidebar 72 px; 390 read-only behaviour). No new colours. Reuse shared components; one implementation per component. Visual acceptance compares rendered views against the artboards at every width that has one; any missing element is a failure. The canvas was never rendered by its author: a layout that cannot be reproduced as drawn is reported to the user before deviating.

### S4: Security and privacy in the browser
Per `frontend-astro-islands` ("Authenticate through the backend session cookie; never prerender private data; hydrate admin data client-side after the session check") and `identity.yaml`: no admin data in static HTML; the session is the `__Host-session` HttpOnly cookie only (nothing in localStorage or sessionStorage); reset and invitation tokens are read from the URL fragment and removed from the address bar after reading; passwords, TOTP secrets, codes and tokens are never logged; options a role cannot use are not rendered, and a direct link to them shows "No tienes acceso a esta sección"; responses carry RFC 9457 problems that the UI maps to the canvas copy (for example "Correo o contraseña incorrectos.", "Acceso bloqueado por unos minutos") without revealing whether an email exists.

### S5: Build mode
User selected: "Inline, sin workers (Recomendado)" and "Sí, PR de docs primero (Recomendado)". The coordinator builds every task inline; no worker agents. The design export lands first in its own documentation PR (#35).

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| D1 | Design export documentation PR | S5 | coordinator | `ad3ee00` (PR #35) |
| A1 | TOTP enrollment QR: audit a QR library with `dependency-audit` and ask for approval, or show the manual key only | S1, S3 | coordinator + user gate | `uqr` 0.1.3 approved and installed (L5–L7) |
| T1 | Generate Identity types (`types:generate`) and a typed admin API client: same-origin `fetch` with credentials, RFC 9457 mapping, 401 to sign-in, 403 to "Sin acceso", `no-store` | S1, S4 | inline | pending |
| T2 | Admin shell: layout, sidebar with role-filtered navigation, top bar with user menu and sign-out, session guard, 1440/1024/768/390 behaviour | S1, S3, S4 | inline | pending |
| T3 | Sign-in (`A-Login`, `-390`) and second step (`A-2FA`: TOTP or recovery code), lockout and error states | S1, S3, S4 | inline | pending |
| T4 | 2FA enrollment (`A-2FA-Activar`): secret per A1, confirmation, one-time display of recovery codes | S1, S3, S4 | inline | pending |
| T5 | Password reset request and set-password pages for reset and invitation links (`A-Recuperar`) | S1, S2, S3, S4 | inline | pending |
| T6 | My account (`A-Cuenta`): profile, change password with second factor, regenerate recovery codes | S1, S2, S3, S4 | inline | pending |
| T7 | Administrators (`A-Admins`, owner only): list, create (invitation), edit role and status, reset another admin's 2FA, last-owner and version-conflict errors | S1, S3, S4 | inline | pending |
| T8 | No access (`A-Sin-Acceso`) and role gating for every admin route | S1, S3, S4 | inline | pending |
| V1 | Visual comparison at every width, axe scans, `task frontend:verify`; local check against the real API; independent read-only security verification (risk item 2) | S1–S4 | coordinator + verifier | pending |
| R1 | Release candidate and staging check with the real owner account | S1 | user gate | pending |

Open questions to resolve inside their task, not assumed: in T2, how to show sidebar sections whose screens are not built yet (stage 2+), and the top-bar global search and pending alerts, which have no API in stage 1.

Risks recorded before work: (1) the session cookie is `__Host-session` with `Secure` hard-coded (`backend/internal/identity/adapters/session/session.go:43-46`); browsers keep `Secure` cookies only over HTTPS or on localhost, so a local sign-in through `http://monteluna.test` may not keep the session; verify in V1 before any change. (2) Security item 2 (auth guards and session handling in the UI) requires the independent verification in V1. (3) The canvas is unverified by its author (`admin.md`, Known gaps).

## Log

- L1 (user, 2026-11-02): "ya tienes el design system de admin por favor revisa y hagamos el plan para comenzar a trabjar esto"
- L2 (coordinator review): The export (`docs/design/monteluna/admin/`, 45 artboards plus `canvas.json`, and `admin.md`) was untracked in the working tree. Only `identity.yaml` has `/api/v1/admin/...` paths (15 operations); `catalog`, `orders`, `payments`, `notifications` and `platform` have none, and there is no promotions module. `admin.md` proposals already match Identity for lockout (5 failures, 15 minutes), 10 recovery codes, and the invitation flow; the extra password composition rules conflict with `identity.md` ("no composition rules"). `radix-ui` is already a dependency; rendering the TOTP QR needs a new library or a manual-key fallback. The admin `AdminUser` schema includes `last_login_at`, used by `A-Cuenta`.
- L3 (user decisions): "Sí, etapa 1 primero (Recomendado)"; "Seguir identity: 12 a 128, sin más reglas (Recomendado)"; "Inline, sin workers (Recomendado)"; "Sí, PR de docs primero (Recomendado)".
- L4 (coordinator, D1): The 46 canvas files were staged byte-identical (SHA-256 of each working file equals its staged blob; no CRLF). Commit `ad3ee00` on `docs/admin-design`, PR #35.
- L5 (user, A1): "Auditar una librería de QR (Recomendado)".
- L6 (coordinator, A1 audit, read-only registry/OSV/GitHub queries, nothing installed): rejected `qrcode` 1.5.4 (3 runtime dependencies including `yargs`) and `qrcode-generator` 2.0.4 (555 KB unpacked). Finalists, all MIT/ISC, zero runtime dependencies, no install scripts, 0 OSV advisories for the current and all historical versions, repositories not archived: `uqr` 0.1.3 (published 2026-04-03, 79 KB, maintainers pi0 and antfu of unjs, 781 stars, 0 open issues, `encode(text)` returns a boolean matrix), `lean-qr` 2.7.4 (2026-09-07, 69 KB, single maintainer, 61 stars, 1 open issue, active), `qrcode.react` 4.2.0 (2024-12-11, ISC, React component with SVG output, 44 open issues). Recommendation: `uqr` 0.1.3, because the canvas draws the QR as a grid of cells in brand colours, so a boolean matrix rendered by our own component matches the design without `innerHTML`. Installation awaits user approval.
- L7 (user + coordinator, A1): User selected "Aprobar uqr 0.1.3 (Recomendado)". `npm install --save-exact uqr@0.1.3`: `package.json` pins `"uqr": "0.1.3"`; the lockfile adds only `node_modules/uqr` (integrity recorded, no dependencies); `npm audit signatures`: 206 packages with verified attestations. The pre-existing npm 12 notice that `esbuild`'s postinstall is blocked by `allowScripts` is unchanged. Finding unrelated to `uqr`: `npm audit --audit-level=high` fails on `main`'s lockfile too (6 vulnerabilities: 2 high in `undici` 8.11.2 via `astro` → `unifont` and `zod` 4.6.5 via `astro`; moderate in `fast-uri` via `@astrojs/check` and `minimatch` via `openapi-typescript`), all build or development tooling. In-range fixes exist (`undici` 8.12.3, `zod` 4.6.7, `fast-uri` 3.1.9; each older than 7 days, no dependencies, 0 OSV advisories); `minimatch` only through a major downgrade of `openapi-typescript`. `task frontend:verify` cannot pass until this is fixed, so the fix needs its own audited, user-approved change.
