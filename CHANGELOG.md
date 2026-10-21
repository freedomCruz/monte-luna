# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.3...HEAD
[0.1.0-rc.3]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.2...v0.1.0-rc.3
[0.1.0-rc.2]: https://github.com/freedomCruz/monte-luna/compare/v0.1.0-rc.1...v0.1.0-rc.2
[0.1.0-rc.1]: https://github.com/freedomCruz/monte-luna/releases/tag/v0.1.0-rc.1
