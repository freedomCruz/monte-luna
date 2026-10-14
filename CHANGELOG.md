# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Live price, compare-at price, availability, and roast date of the oldest lot in stock, loaded in the browser on every visit; sold-out options are marked "Agotado". There is no add-to-cart button until the cart exists.
- Public catalog read API: products, categories, origins, and batch product availability, described in `contracts/openapi/catalog.yaml`.
- Catalog database schema with migrations, and a Spanish demo catalog loaded with `task backend:seed` (never by migrations).
- End-to-end storefront tests with Playwright and axe-core accessibility scans on desktop and mobile, run by `task verify`.

### Changed

- `task verify` now checks every generated API type file for drift, not only the platform types.
- Frontend UI component library changed from Storefront UI to shadcn/ui (Radix primitives) for the storefront and admin panel, styled with Tailwind CSS using the Monteluna design system.

### Security

- Updated the backend's indirect `golang.org/x/text` dependency to resolve GO-2026-6629 and GO-2026-5970.
