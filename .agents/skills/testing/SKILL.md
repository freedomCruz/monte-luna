---
name: testing
description: "Trigger: test, TDD, testing, unit test, integration test, Vitest, Playwright, Testcontainers. Apply project testing strategies and determinism rules across backend and frontend."
license: Apache-2.0
metadata:
  author: ecommerce-project
  version: "1.0"
---

## Activation Contract

Use when writing or modifying tests, test fixtures, or test suites for backend Go code or frontend Astro/React code.

Do not use alone for non-code artifacts (documentation, configuration) where TDD does not apply. State why TDD does not apply and run proportionate verification instead.

## Hard Rules

- Read `docs/architecture/system-architecture.md` section 6 before modifying test configurations.
- Backend testing:
  - Strict TDD for `domain` and `app` layers: observe RED, implement minimal code for GREEN, then REFACTOR.
  - Table-driven Go tests (`tt := []struct{...}`).
  - Adapter integration tests run against real PostgreSQL 18 via Testcontainers (Docker required). Never mock the database in adapter tests.
- Frontend testing:
  - Vitest configured with Astro `getViteConfig` for unit and store logic.
  - Astro Container API for `.astro` components.
  - React Testing Library for interactive islands.
  - Playwright for end-to-end flows with `axe-core` accessibility scans.
- Determinism and isolation:
  - No `time.Sleep` for synchronization; wait on channels, states, or assertions.
  - Time and randomness live behind domain ports or injected clocks.
  - Independent tests; zero shared mutable package state.
  - No real external network calls. External providers (such as Factus or payment gateways) are faked at the port.
- Coverage:
  - Report coverage during verification; no coverage threshold has been approved. Do not enforce numerical thresholds.

## Decision Gates

| Situation | Action |
| --- | --- |
| Domain entity or use case logic | Follow TDD: RED test first, GREEN implementation, then refactor |
| Adapter database queries or migrations | Run integration tests against real PostgreSQL 18 via Testcontainers |
| External service calls (Factus, payments) | Fake the outbound domain port; never call external networks |
| Time, UUIDs, or random generation | Inject clocks or generators behind ports |
| Static `.astro` component markup | Test rendered HTML via Astro Container API |
| Interactive React island | Test user interactions via React Testing Library |
| End-to-end user flow | Write Playwright tests with embedded `axe-core` scans |
| Non-code task (docs, config) | Skip TDD; state why; run formatters or doc checks |

## Execution Steps

1. Select layer (domain, app, adapter, Astro component, island, e2e).
2. For domain/app logic, write the smallest behavior test and observe RED.
3. Write minimal code to reach GREEN.
4. Refactor while keeping focused tests green.
5. For adapters, verify with Testcontainers PostgreSQL 18.
6. For frontend, run Vitest, Astro Container tests, or Playwright with `axe-core`.
7. Run validation commands and report test passes and coverage figures.

## Output Contract

Report:
- Test files touched, by layer and framework.
- TDD cycle evidence (RED, GREEN, REFACTOR) for domain/app changes.
- Results of `go test ./...`, Vitest, and Playwright runs.
- Testcontainers status for adapter tests.
- Observed test coverage without enforcing thresholds.
- Justification when TDD is not applicable.

## References

- `docs/architecture/system-architecture.md` — Section 6, Implementation Tooling.
- `docs/architecture/data-modeling.md` — Schema conventions and constraints.
