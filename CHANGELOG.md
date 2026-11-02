# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0-rc.9] - 2026-11-02

### Added

- Monteluna administrative panel (`/admin`):
  - Shared responsive shell with role-aware navigation (desktop sidebar, tablet rail, mobile bottom bar).
  - Client-hydrated session and role guards ensuring zero private administrator data is prerendered in static HTML.
  - Sign-in with password policy (12–128 Unicode code points) and rate limiting.
  - Two-factor authentication (TOTP) with RFC 6238 QR enrollment via `uqr`, single-use recovery codes, and emergency recovery toggle.
  - Password recovery requests with anti-enumeration responses and one-time token handling via URL fragments (`#token=...`) stripped from browser history on mount.
  - Administrator invitations onboarding flow.
  - Account security settings (`/admin/cuenta/`): profile summary, password change with reauthentication, and recovery code regeneration.
  - Mobile read-only policy at 390px directing users to tablet or desktop for security-sensitive actions.
  - Administrator management view (`/admin/administradores/`) for owners: administrator listing, invitations, and owner-reauthenticated 2FA reset with optimistic concurrency (`If-Match` ETags).
  - Role-gated access denial screen (`/admin/sin-acceso/`).
- End-to-end Playwright test suite for administrator flows (14 browser tests across desktop, tablet, and mobile).
- Exported Monteluna admin design system specification, canvas artboards, and tokens.

### Fixed

- Preserved one-time password reset and invitation tokens under React Strict Mode double-render by extracting URL fragments in a guarded mount effect.

### Security

- Audited and installed `uqr@0.1.3` with zero transitive dependencies for project-owned QR matrix rendering without `innerHTML`.
- Fixed high npm security advisories in build tooling (`undici`, `zod`, `fast-uri`).

## [0.1.0-rc.8] - 2026-10-22

### Added

- Administrator authentication backend: invitations by email, password login with lockout and rate limiting, TOTP two-factor authentication with recovery codes, owner and staff roles, audited security events, password resets, and an SSH-only command to create the first owner.
- Transactional email backend for administrator invitations and password resets, with Resend delivery, signed delivery webhooks, and bounce and complaint suppressions; staging keeps emails in local capture mode.

## [0.1.0-rc.7] - 2026-10-22

### Fixed

- Kept cart line package images from covering product text and kept cart prices and quantity controls inside their cards on phone screens from 320 px to 390 px.

## [0.1.0-rc.6] - 2026-10-22

### Verification

- Prepared an immutable staging-only candidate for the final controlled failed-health rollback drill, with a failure watchdog bound to Compose labels and the exact candidate image; it is expected never to become the active release.

## [0.1.0-rc.5] - 2026-10-22

### Verification

- Prepared an immutable staging-only candidate for a controlled failed-health rollback drill; it is expected never to become the active release.

## [0.1.0-rc.4] - 2026-10-21

### Changed

- Built the staging storefront from the seeded catalog API instead of local fixture identities.
- Kept deterministic Playwright fixture builds isolated from the release catalog URL while validating API-backed prerender order.

## [0.1.0-rc.3] - 2026-10-21

### Fixed

- Preserved the release identifier after loading runtime environment values and made temporary image-archive cleanup safe after deployment failures.

## [0.1.0-rc.2] - 2026-10-21

### Fixed

- Made the local deployment preflight run fresh package-serial Go tests to prevent intermittent Testcontainers provider detection failures on Windows.

## [0.1.0-rc.1] - 2026-10-21

### Added

- Project architecture, infrastructure, data modeling, invoicing and tax policy, and catalog domain baseline documentation.
- Project skills for backend Go modules, PostgreSQL database, domain events transactional outbox, frontend Astro islands, invoicing and taxes, testing, conventional commits, changelog releases, and dependency audit.
- Monteluna storefront design system reference with tokens, typography, components, and exported desktop and mobile screens.
- Contract-first HTTP API approach: hand-written OpenAPI 3.1 documents per module in `contracts/openapi/`.
- Contract verification in Go handler tests, generated TypeScript API types, and a hybrid storefront data strategy (catalog pre-rendered, price and stock fetched live).
- Parallel agent work rules (roles, path ownership, contract approval gates, feature branch integration) and an Orca + Pi coordination skill.
- HTTP API conventions shared by every module contract: paths, JSON naming, money, dates, errors, pagination, authentication, and idempotency.
- Delivery plan: serial monorepo scaffold first, then a read-only Catalog v1 storefront as the first feature, with all changes merged through pull requests.
- Local PostgreSQL development with an isolated database and development ports for each Git worktree.
- Go API health endpoint and shared OpenAPI 3.1 contract with generated frontend types.
- Static Astro storefront scaffold themed with Monteluna design tokens and a reviewed shadcn/ui button.
- `task verify` to run backend and frontend checks before review.
- Read-only Catalog v1 storefront in Spanish: shop listing grouped by category (`/tienda`), product pages with presentation and grind options (`/productos/<slug>`), and origin pages (`/origenes/<slug>`), pre-rendered from the catalog API.
- Live price, compare-at price, availability, and roast date of the oldest lot in stock, loaded in the browser on every visit; sold-out options are marked "Agotado".
- Public catalog read API: products, categories, origins, and batch product availability, described in `contracts/openapi/catalog.yaml`.
- Catalog database schema with migrations, and a Spanish demo catalog loaded with `task backend:seed` (never by migrations).
- End-to-end storefront tests with Playwright and axe-core accessibility scans on desktop and mobile, run by `task verify`.
- Shopping cart kept in the browser: "Agregar al carrito" on product pages, a slide-over cart panel, a cart page (`/carrito`), and an item counter in the header on every page. Cart prices are always read live from the catalog.
- Guest checkout (`/checkout`): buyer and delivery data, Colombian department and municipality selectors from the official DANE DIVIPOLA dataset (CC BY-SA 4.0), optional invoice data, and a live quote with shipping cost, taxes, and total calculated by the server.
- Shipping zones and rates by department or municipality and weight, with free shipping above a threshold and estimated delivery in business days; demo zones and rates are loaded by the seed.
- Order placement: "Continuar al pago" creates the order and reserves its stock for 30 minutes; unpaid orders expire and release their stock automatically.
- Wompi Web Checkout payments with signed redirect data, authenticated and idempotent webhooks, and buyer-facing pending, paid, rejected, and cancelled order states.
- Guest order page (`/pedido?token=…`) with order number, reservation countdown, status steps, delivery details, lines, and totals.
- Orders API: checkout quote and order placement with idempotency keys, plus the guest order view, described in `contracts/openapi/orders.yaml`.
- Storefront home page (`/`) from the Monteluna design: hero, marquee, the first four catalog products with live prices and savings badges, benefits, chocolate panel, and a band for the first published origin. The header marks "Inicio" as the current page.

### Changed

- `task verify` now checks every generated API type file for drift, not only the platform types.
- Origin pages now follow the Monteluna design: hero with the featured product, story, process, figures, gallery, and the origin's products.
- Frontend UI component library changed from Storefront UI to shadcn/ui (Radix primitives) for the storefront and admin panel, styled with Tailwind CSS using the Monteluna design system.

### Security

- Updated the backend's indirect `golang.org/x/text` dependency to resolve GO-2026-6629 and GO-2026-5970.
- Updated the backend toolchain to Go 1.27.3 to resolve reachable standard-library vulnerabilities.
- Rebuilt Caddy 2.11.7 with Go 1.27.3 and `golang.org/x/net` 0.60.0 instead of deploying the vulnerable upstream binary.

[Unreleased]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.9...HEAD
[0.1.0-rc.9]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.8...v0.1.0-rc.9
[0.1.0-rc.8]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.7...v0.1.0-rc.8
[0.1.0-rc.7]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.6...v0.1.0-rc.7
[0.1.0-rc.6]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.5...v0.1.0-rc.6
[0.1.0-rc.5]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.4...v0.1.0-rc.5
[0.1.0-rc.4]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.3...v0.1.0-rc.4
[0.1.0-rc.3]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.2...v0.1.0-rc.3
[0.1.0-rc.2]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.1...v0.1.0-rc.2
[0.1.0-rc.1]: https://github.com/freedomCruz/monte-luna/releases/tag/v0.1.0-rc.1
