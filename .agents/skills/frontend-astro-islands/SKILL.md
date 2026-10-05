---
name: frontend-astro-islands
description: "Trigger: frontend/, Astro page, React island, client:load, Storefront UI, Tailwind, storefront, admin UI. Build static-first Astro pages with minimal React islands."
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
- One Astro app in `frontend/` serves the storefront and `/admin`. Pinned to Node 26 LTS via root `.node-version` (read by fnm). Use npm 12 only, enforced via `devEngines.packageManager` in `frontend/package.json` (`{ "name": "npm", "version": "<exact>", "onFail": "error" }`).
- Build configuration: static output (`output: 'static'`). No Node.js process in production; static build assets are served directly by Caddy from a versioned container image tagged with the release version and commit SHA (Go `embed` is rejected).
- Environment variables: Astro static builds embed environment values at build time; expose only `PUBLIC_`-prefixed non-secret variables to client code. Never expose private secrets.
- Dependency installation: never install dependencies autonomously; follow `dependency-audit`. npm 12 blocks install scripts by default (`allowScripts`); never set `ignore-scripts=true`. Never omit optional dependencies (`--omit=optional`) so `esbuild` and `sharp` run with platform binaries without scripts.
- Never copy `node_modules` between operating systems; production builds occur in Linux containers. Playwright browsers are installed with `npx playwright install` (dev/test only; never on the VPS).
- Default to `.astro` components rendered as static HTML. Use a React island only where interaction is required.
- Hydration directives: `client:load` for above-the-fold purchase controls; `client:idle` for non-urgent widgets; `client:visible` for below-the-fold content. Never hydrate static content.
- React is the only client framework. UI primitives come from Storefront UI (`@storefront-ui/react`) with Tailwind CSS. No other UI library without user approval.
- Independent islands do not share React Context. Group tightly coupled controls into one island, or share state through a lightweight store.
- Props passed to hydrated islands must be serializable; never pass functions.
- Never compute authoritative prices, discounts, stock, or taxes in the frontend. Show backend values; the backend validates every action.
- Check package versions before installing: `@storefront-ui/react` 4.x declares a React 19 peer dependency. Do not copy Next.js-specific setup steps from its guides.
- Use semantic HTML, keyboard-accessible controls, visible focus, and `alt` text for product images.
- Load `dependency-audit` before proposing, adding, or updating any dependency; installation still requires explicit user approval.

## Decision Gates

| Situation | Action |
| --- | --- |
| Content without interaction | `.astro` component, no JavaScript |
| Production runtime | Static output (`output: 'static'`); no Node.js process on the VPS |
| Browser testing install | Install browsers via `npx playwright install` for local development and test only; never on the VPS |
| Shared state across separate islands | Group into one island; if not possible, propose a store (Nano Stores is named in the architecture) and get approval before adding it |
| `/admin` page | Authenticate through the backend session cookie; never prerender private data; hydrate admin data client-side after the session check |
| Out-of-stock variant | Show an out-of-stock badge and disable add-to-cart; the backend still rejects the purchase |
| Storefront UI lacks a needed component | Build it with Tailwind in the same visual language; do not add another UI library |

## Execution Steps

1. Load `testing` and write tests first where behavior exists (Vitest, Astro Container API, React Testing Library).
2. Choose static `.astro` or island per the gates above; implement with Storefront UI and Tailwind.
3. Connect to backend endpoints; handle loading and error states.
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
- `.agents/skills/monorepo/SKILL.md` — light monorepo layout, Taskfile tasks, and repository conventions.
- `.agents/skills/testing/SKILL.md` — testing strategy, Vitest, Astro Container API, Playwright, axe-core.
- `.agents/skills/dependency-audit/SKILL.md` — dependency evaluation, exact pinning, npm security audit.
