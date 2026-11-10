# Feature: admin-navigation-v1

Part 1 of two agreed with the user on 2026-11-09: make moving through the `/admin` panel feel immediate. Part 2 (storefront rebuilt on the VPS from a builder image, served from a Caddy volume, an "Actualizar tienda" admin action, slug redirects, canonical doc updates) is a separate feature and is out of scope here. Branch `feat/admin-navigation-v1` from `main` (`b8f97bd`, release `v0.1.0-rc.12`). Read this whole document through `## Log` before working.

Canonical sources: `docs/architecture/system-architecture.md` section 2, `docs/design/monteluna/design-system.md`, `docs/design/monteluna/admin/admin.md` and `canvas/A-Sistema.dc.html`, `deploy/caddy/Caddyfile`, and the skills `frontend-astro-islands`, `testing`, `identity-domain`, `deployment`.

## Specs

### S1: No lone session-check screen

User (L1): "los skeleton mostrarse para que no se vea una pantalla sola que dice 'comprobando tu sesión' eso hace que se ve una salto feo y la experiencia de usuario es terrible."

While the session check runs, the admin shows a skeleton shaped like the admin (sidebar, top bar, content rows) following the A-Sistema skeleton style, instead of the full-screen "Comprobando tu sesión…" text. Decision (L4): the skeleton has the sidebar, the top bar and content rows in the admin proportions, with no section names or data, because the menu depends on the role. The session gate stays: no private data is shown before the backend confirms the session, and no private data is prerendered.

### S2: The menu does not reload on navigation

User (L1): "se supone que el menu varia poco, cuando se hace la carga de otro elmento del menú no tendría que resfrescarse esa página". User choice (L2): "Además, navegación persistente".

Moving between admin sections keeps the sidebar, top bar, session and badge counts mounted; only the section content changes and loads its own data with its skeleton. The backend stays authoritative: every admin API call is still checked, and an expired or revoked session still ends at sign-in. Decisions (L4): the session is revalidated with the server on every section change, in the background and in parallel with the section data, without blocking the screen; leaving a section with unsaved changes asks with the approved A-Sistema dialog "¿Salir sin guardar?" ("Seguir editando" / "Salir sin guardar").

### S3: Cache policy for static assets

Activate the Caddy cache policy already written as pending comments in `deploy/caddy/Caddyfile`: hashed `/_astro/*` assets and fonts long-lived and immutable, HTML revalidated. Admin and private API responses keep `Cache-Control: no-store`.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| D1 | **Decisions**: session revalidation policy during persistent navigation; behaviour when leaving a screen with unsaved changes; skeleton layout before the session is known | S1, S2 | user | done (L4) |
| T1 | Admin-shaped skeleton during the session check (test first; compare with A-Sistema) | S1 | coordinator | pending |
| T2 | Caddy cache headers for hashed assets and HTML, with `deploy/test-caddy.sh` coverage | S3 | coordinator | pending |
| T3 | Persistent admin navigation (one mounted shell; sections swap without a full page load) | S2 | coordinator | pending |
| T4 | Browser verification: e2e for navigation, session expiry and unsaved changes, axe, rendered comparison at 1440, 1024, 768 and the 390 gate | S1–S3 | coordinator | pending |
| V1 | Independent verification (security: session gate; delivery: cache headers) | S1–S3 | verifier | pending |
| R1 | Pull request to `main` | — | user gate | pending |

## Log

- L1 (user, 2026-11-09): "hay un tema de rendimiento que estoy viendo ahora es que antes la página carga un poco más lento cuando navego entre el menu lateral, es por la imagens del R2? Segundo, hay algo que puede mejorar es el cache de esas página como se están manejando en astro, se supone que el menu varia poco, cuando se hace la carga de otro elmento del menú no tendría que resfrescarse esa página, y los skeleton mostrarse para que no se vea una pantalla sola que dice 'comprobando tu sesión' eso hace que se ve una salto feo y la experiencia de usuario es terrible. ¿Como estamos manejando la hidratación de esos componentes? Como se cachean esos datos que server side rendering y que es static rendering, etc. Como funciona react island aquí"
- L2 (user, 2026-11-09): "listo entonces vamos a dividir el trabajo en dos partes. La primera la mejora de UI/UX del panel admin y la segunda está última de la imagen del build en el VPS pasada con volumen en el caddy según entendí y se modifican los documentos canónicos." Scope choice for part 1: "Además, navegación persistente".
- L3 (coordinator evidence, 2026-11-09): measured on staging, each request costs about 0.33–0.52 s from the user's location; admin HTML is about 5.8 KB; `/_astro/*` JavaScript (about 76 KB compressed) has no `Cache-Control`, only an `ETag`. Read-only map (explorer): every admin page mounts one whole React page with `client:load`; sidebar links are plain `<a href>`, so each click is a full document load and a new React root; the prerendered HTML is the `AdminShell` "Comprobando tu sesión…" state (`AdminShell.tsx:214-263`); after hydration the shell calls `GET /api/v1/admin/sessions/current`, then the pending-dispatch and low-stock badge counts, then the section data, all with `cache: 'no-store'` and no cross-page cache; no `ClientRouter`, View Transitions or `transition:persist` is used; the Caddy cache policy is commented as pending (`deploy/caddy/Caddyfile:24-35`). R2 images are not the cause: admin thumbnails are 44–150 px and the session screen appears before any data or image.
- L4 (user decisions, 2026-11-09): session revalidation: "En cada cambio de sección (Recomendado)"; unsaved changes: "Preguntar «¿Salir sin guardar?» (Recomendado)"; pre-session skeleton: "Menú, barra superior y contenido (Recomendado)".
