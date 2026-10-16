---
name: frontend-astro-islands
description: "Trigger: frontend/, Astro page, React island, client:load, shadcn/ui, Tailwind, storefront, admin UI. Build static-first Astro pages with minimal React islands."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when creating or changing anything under `frontend/`: storefront pages, `/admin` pages, components, or styles.

Do not use for backend logic; the frontend displays and collects data, and the backend decides. Load `monorepo` for repository-level changes or root configuration files. Load `testing` when writing or updating tests, and load `dependency-audit` before proposing or adding dependencies.

## Hard Rules

- Read `docs/architecture/system-architecture.md` section 2 before structural changes.
- Read `docs/design/monteluna/design-system.md` before any UI work. Use tokens and CSS variables defined in the design system; never use ad-hoc hex values.
- One Astro app in `frontend/` serves the storefront and `/admin`. Pinned to Node 24 LTS via root `.node-version` (read by fnm). Use npm 12 only, enforced via `devEngines.packageManager` in `frontend/package.json` (`{ "name": "npm", "version": "<exact>", "onFail": "error" }`).
- Build configuration: static output (`output: 'static'`). No Node.js process in production; static build assets are served directly by Caddy from a versioned container image tagged with the release version and commit SHA (Go `embed` is rejected).
- Environment variables: Astro static builds embed environment values at build time; expose only `PUBLIC_`-prefixed non-secret variables to client code. Never expose private secrets.
- Dependency installation: never install dependencies autonomously; follow `dependency-audit`. npm 12 blocks install scripts by default (`allowScripts`); never set `ignore-scripts=true`. Never omit optional dependencies (`--omit=optional`) so `esbuild` and `sharp` run with platform binaries without scripts.
- Never copy `node_modules` between operating systems; production builds occur in Linux containers. Playwright browsers are installed with `npx playwright install` (dev/test only; never on the VPS).
- Follow the component reuse and visual review rules in `AGENTS.md`: compose cohesive units, share product-card markup across pages, and compare rendered desktop/mobile views with the original references. Functional and axe checks alone do not prove design fidelity.
- Folder architecture (approved 2026-10-15, `docs/architecture/system-architecture.md` section 2): `components/ui/` for design-system primitives, `components/<domain>/` for each domain's `.astro` components and islands together, `components/layout/` for site chrome, `lib/<domain>/` and `lib/shared/` for stores, clients, and helpers. Never create a generic `islands/` folder; never import another domain's internals.
- Design-system fidelity is absolute: never skip the Monteluna design system and never invent elements, copy, colours, spacing, data, or behaviour that are not in the canvas HTML/CSS, the approved tokens, the contract, or the ODD specs. When something is missing or conflicting, ask the coordinator instead of improvising.
- Reuse before writing: search `components/ui/`, the domain folder, and `lib/` for an existing component or helper first. Never copy markup between components; extract a shared component when a second place needs it, with explicit props. Report reused and created shared components in every task report.
- Default to `.astro` components rendered as static HTML. React (including shadcn/ui) components without a `client:` directive render as static HTML; hydrate only interactive islands where client interaction is required.
- Hydration directives: `client:load` for above-the-fold purchase controls; `client:idle` for non-urgent widgets; `client:visible` for below-the-fold content. Never hydrate static content.
- React is the only client framework. UI primitives follow the official shadcn/ui registry source with Radix primitives (`--base radix`) and Tailwind CSS. Components are incorporated as project-owned code after reviewing the official registry source; record the source URL and adapt them to Monteluna tokens and conventions. No other UI library without user approval.
- Do not execute or add the shadcn CLI while its transitive `braces` dependency has the unpatched high-severity GHSA-vfj7-8cjw-p6xm. The merchant approved manual incorporation of reviewed official shadcn/ui registry components on 2026-10-13. Re-audit before changing this restriction. Pin runtime primitives (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`) exactly under `dependency-audit`.
- Independent islands do not share React Context. Group tightly coupled controls into one island, or share state through a lightweight store.
- Props passed to hydrated islands must be serializable; never pass functions.
- Never compute authoritative prices, discounts, stock, or taxes in the frontend. Show backend values; the backend validates every action. Approved presentation-only exception: the savings badge may subtract live `price_amount` from live `compare_at_price_amount` for the same displayed variant when the reference is greater. Hide the badge when no valid reference exists or live data is unavailable. This does not change the selling price or authorize coupon, tax, or checkout calculations. See `docs/domain/catalog.md` for the future backoffice requirements.
- API types come only from `contracts/openapi/` through types generated by `openapi-typescript`; never hand-write or edit API types. If the contract lacks something, request a contract change instead of working around it. Follow `docs/architecture/api-conventions.md`: money arrives in minor units (divide by 100, format without decimals), errors are handled by their `code`.
- Hybrid data strategy: pre-render stable catalog content at build time; the purchase island fetches current price, compare-at price, stock, and roast date in the browser on load and shows a loading state until it arrives.
- Use semantic HTML, keyboard-accessible controls, visible focus, and `alt` text for product images.
- Load `dependency-audit` before proposing, adding, or updating any dependency; installation still requires explicit user approval.

## Decision Gates

| Situation | Action |
| --- | --- |
| Same markup needed in two places | Extract one component with explicit props (domain folder, or `components/ui/` when a second domain needs it); never duplicate |
| Element, copy, or data not in canvas, tokens, contract, or specs | Ask the coordinator; do not invent |
| Content without interaction | `.astro` component or React component without `client:` directive, no JavaScript |
| Production runtime | Static output (`output: 'static'`); no Node.js process on the VPS |
| Browser testing install | Install browsers via `npx playwright install` for local development and test only; never on the VPS |
| Shared state across separate islands | Group into one island; if not possible, propose a store (Nano Stores is named in the architecture) and get approval before adding it |
| `/admin` page | Authenticate through the backend session cookie; never prerender private data; hydrate admin data client-side after the session check |
| Out-of-stock variant | Show an out-of-stock badge and disable add-to-cart; the backend still rejects the purchase |
| shadcn/ui lacks a needed component | Build it with Tailwind and Monteluna tokens, adding it to `docs/design/monteluna/design-system.md` first; do not add another UI library without approval |

## Execution Steps

1. Load `testing` and write tests first where behavior exists (Vitest, Astro Container API, React Testing Library).
2. Choose static `.astro` or island per the gates above; implement with shadcn/ui and Tailwind using Monteluna design tokens.
3. Connect to backend endpoints defined in `contracts/openapi/` using the generated types; handle loading and error states.
4. Cover user flows with Playwright and axe-core accessibility checks per `testing`.
5. Run every verification gate.

## Output Contract

Report:
- Pages, islands, and hydration directive chosen for each island with the reason.
- Results of `npx astro check`, `npx vitest run`, `npm run build`, and `npx playwright test` (including axe-core checks).
- Confirmation that pages without interaction ship no island JavaScript.
- Dependencies proposed, open questions, and residual risks.

## References

Paths are relative to the repository root.

- `docs/architecture/system-architecture.md` — section 2, frontend architecture.
- `docs/design/monteluna/design-system.md` — Monteluna design system, CSS variable tokens, and typography.
- `.agents/skills/monorepo/SKILL.md` — light monorepo layout, Taskfile tasks, and repository conventions.
- `.agents/skills/testing/SKILL.md` — testing strategy, Vitest, Astro Container API, Playwright, axe-core.
- `.agents/skills/dependency-audit/SKILL.md` — dependency evaluation, exact pinning, npm security audit.
