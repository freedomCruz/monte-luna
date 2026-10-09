# Monteluna Design Export

## Goal and scope

Keep the approved storefront visual direction ("Monteluna") inside the repository so it survives outside the Claude Design canvas and agents can build the frontend from it.

Problem: the design system sheet and every Monteluna screen live only in a private Claude Design canvas (page "Monteluna: dirección fresca") and in a session scratchpad.

Authorized scope (user request, 2026-10-09: "El sistema de diseño y toda la página 3 de Monteluna, ¿la podemos guardar dentro del proyecto en alguna parte?"):
- Add `docs/design/monteluna/` with the canvas sources, the image assets they reference, and an English design system reference.
- Do not change canonical architecture or domain documents, `AGENTS.md`, or any pending technical decision.
- Do not export the other canvas pages ("Exploración", "Editorial").

## Constraints

- English for artifacts; the exported screens keep their Spanish UI copy because that copy is the design.
- Canvas sources are stored byte-identical to the published version so they can be republished to the canvas.
- The approved frontend stack stays as recorded in `docs/architecture/system-architecture.md` (Astro + React islands + Storefront UI + Tailwind CSS). The export is a design reference, not an architecture decision.
- Push, pull request, and merge remain the user's decisions.

## Tasks

- [x] T1 — Export canvas sources and image assets. Route: direct inline (mechanical copy, no trigger fired).
  - Source: canvas version `1791578671-1837`, read on 2026-10-09 after the user's latest manual save.
  - Acceptance: `canvas/` holds `canvas.json` plus the 23 `M-*.dc.html` artboards; `assets/` holds the 9 images those artboards reference; every `/_blob/<id>` used in `canvas/` maps to a file in `assets/`.
  - Checks: file counts; SHA-256 of copied files equals the published files; blob id coverage.
- [x] T2 — Write `design-system.md` and `README.md`. Route: direct inline (one non-trivial file).
  - Acceptance: tokens, typography, shape, motion, component inventory, screen inventory, rules taken from domain documents, and open items are documented; proposals not backed by a domain document are labeled as proposals.
  - Checks: relative links resolve; token values match `canvas/M-Sistema.dc.html`.

## Verification and delivery

- TDD: not applicable; documentation and design assets only. No executable tests exist or were run.
- Receipt-driven development: off (`gentle-ai review mode status` reports `off`, decided by global), so no review was started.
- Forecast: no authored code lines; one documentation file of about 250 lines plus copied design files. Delivery strategy: `ask-on-risk`; budget not reached.
- Evidence: see "Progress" below.

## Progress

- T1 done (2026-10-09). `docs/design/monteluna/canvas/` holds 24 files (`canvas.json` plus 23 artboards); `assets/` holds 9 images; folder size 3.3 MB. `cmp` against the published files reported no difference; SHA-256 of `canvas.json` (`64050e12…`) and `M-Sistema.dc.html` (`6312793c…`) equal the published hashes. No CR characters in the sources.
- T2 done (2026-10-09). `design-system.md` and `README.md` written. Checks run: every relative link resolves; all 9 `/_blob/<id>` URLs used in `canvas/` are mapped in `README.md` and every mapped file exists; every hex value in the token table appears in `canvas/M-Sistema.dc.html`.
- Found while writing: the sheet and the mobile shop screen disagree on the product card overflow and title size; recorded in `design-system.md` section 10, not fixed.
- Commit: created on branch `docs/monteluna-design-system` after the user's explicit request on 2026-10-09; commit id recorded in `odd/tasks/shadcn-ui-adoption.md`.

## Next step

- User decides whether to commit, whether to index `docs/design/monteluna/design-system.md` in `AGENTS.md`, and whether to push or open a pull request.
