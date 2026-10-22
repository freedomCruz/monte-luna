# Feature: storefront-mobile-fixes

Fix two small-screen storefront layout defects the user observed on the live staging release (`v0.1.0-rc.4`). Branch `fix/storefront-mobile-v1` (based on `feat/deploy-v1`); nothing is pushed without explicit authorization. Shipping the fix to staging needs a new release candidate, which is a separate user decision.

## Specs

### S1: Quantity selector overflow
> "Probé la parte mobile y encontré en algunas pantallas más pequeñas un desbordamiento del componente de cantidad"

The quantity component must stay inside its container at every supported mobile width, from the smallest common width (320 px) up to the 390 px mobile reference, on every screen where it appears.

### S2: Product image covering card title and text
> "y el producto en la tarjeta tapa el título y letras poniéndolas detrás como un z-index= -1 por debajo del paquete de café."

On small screens, the product image (package) in the shared product card must never cover the card's title or text. The approved image overflow from the Monteluna canvas stays, but text remains readable and on top.

### S3: Design fidelity (AGENTS.md)
Fixes follow the original desktop and mobile HTML references under `docs/design/monteluna/canvas/` and their CSS (`M-*.dc.html`, `M-*-390.dc.html`, and desktop counterparts), plus the precedence in `docs/design/monteluna/design-system.md`. Product cards share one implementation. Visual acceptance requires rendered desktop and mobile comparison against the references; desktop rendering must not regress.

## Tasks

| ID | Task | Specs | Route | Commit |
|---|---|---|---|---|
| T1 | Reproduce both defects at exact failing widths with RED evidence (Playwright), fix the shared components, compare desktop/mobile renders against the canvas references | S1–S3 | worker | pending |
| T2 | Coordinator review, full frontend gate, commit | S1–S3 | coordinator | pending |

## Log

- L1 (user, 2026-10-21, from `odd/tasks/deploy-v1.md` L31): "listo empecemos, lo que te puedo decir es que abrí la url de staging y funciona muy bien con el seed correcto, probe el flujo de pago con sanbox de wompi y está perfecto. staging.montelunaco.com. Probé la parte mobile y encontré en algunas pantallas más pequeñas un desbordamiento del componente de cantidad y el producto en la tarjeta tapa el título y letras poniéndolas detrás como un z-index= -1 por debajo del paquete de café. Tu termina la lectura técnica de rc4 y después seguimos con demostrar el rollback automático."
- L2 (user, 2026-10-22): "continuemos con la tarea 31 de los defectos en móvil". The exact failing device/width was not specified; reproduce across 320–390 px.
