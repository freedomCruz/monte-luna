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
| T1 | Reproduce both defects at exact failing widths with RED evidence (Playwright), fix the shared components, compare desktop/mobile renders against the canvas references | S1–S3 | worker | `16f5275` (L3–L5) |
| T2 | Coordinator review, full frontend gate, commit | S1–S3 | coordinator | `16f5275` (L6) |

## Log

- L1 (user, 2026-10-21, from `odd/tasks/deploy-v1.md` L31): "listo empecemos, lo que te puedo decir es que abrí la url de staging y funciona muy bien con el seed correcto, probe el flujo de pago con sanbox de wompi y está perfecto. staging.montelunaco.com. Probé la parte mobile y encontré en algunas pantallas más pequeñas un desbordamiento del componente de cantidad y el producto en la tarjeta tapa el título y letras poniéndolas detrás como un z-index= -1 por debajo del paquete de café. Tu termina la lectura técnica de rc4 y después seguimos con demostrar el rollback automático."
- L2 (user, 2026-10-22): "continuemos con la tarea 31 de los defectos en móvil". The exact failing device/width was not specified; reproduce across 320–390 px.
- L3 (worker + coordinator review, T1): The worker reproduced S1 (cart quantity row 344 px wide at 320/360 px) and changed `order-line-item.tsx`, `quantity-stepper.tsx`, `CartPage.tsx` (mobile-only padding, image, price and stepper sizes). Its S2 check used `elementFromPoint`/trial clicks, which cannot see the line image because it is `pointer-events-none`; S2 was never reproduced. Coordinator added a geometric S2 test (image box must not intersect any line text) for the cart page and cart panel. RED on the original code: image overlaps "CAFÉ · ORIGEN" and "Finca El Mirador" at 320–390 px. With the worker's changes it still fails at every width, and 320 px screenshots show the package covering the start of "250" on the cart page and the panel price `$32.000` clipped at the card's right edge (an S1-class overflow its stepper-only test missed). Design conflict: the canvas line image is `position:absolute; left:0`, 172 px tall with 122 px text padding (`M-Carrito-390`) and 150 px with 112 px (`M-Carrito-Panel-390`); the packaging assets are 1122×1402 (ratio 0.8), so at canvas size the image box is 138 px / 120 px wide and the approved composition itself places the package over the text column. User decision required before deviating from the canvas.
- L4 (user decision, S2/S3): "Achicar el paquete solo en móvil (Recomendado)": below 640 px the cart line package shrinks just enough not to cover any text, keeping its rotation and top overflow; from 640 px everything stays as the canvas. Also fix the cart panel price clipped at the card's right edge. This is an approved deviation from `M-Carrito-390` and `M-Carrito-Panel-390` image size only.
- L5 (worker follow-up + coordinator review, T1): New RED: cart panel price overflowed at 320 px (`Expected <= 304, Received 311.546875`); the coordinator's S2 geometric test kept failing until the fix. Final diff touches only `order-line-item.tsx` panel and page variants (the checkout `compact` variant is unchanged); the worker reverted its earlier `CartPage.tsx` and `quantity-stepper.tsx` changes. Below `sm` only: panel text padding 76 px and package `h-20`, page text padding 80 px and package `h-22`, package `-top-2`, price/stepper row wraps, page price `text-xl`. Every `sm:`/`md:` value equals the previous code, so 640 px and up are unchanged. With 80 px of text padding, about 88 px is the largest package height whose rotated box clears the text; keeping the canvas 112–122 px padding instead would truncate "Finca El Mirador" at 320 px. Worker GREEN: `mobile-fixes.spec.ts` 48/48 on both projects, full Playwright 124, Vitest 198, Astro check 0 errors. Coordinator 320/390 px screenshots: no text covered, title complete, price and stepper inside the card. The package is about half the canvas size on phones, as approved in L4.
- L6 (coordinator, T2): `task frontend:verify` passed: Astro check 0 errors / 0 warnings, Vitest 32 files / 198 tests, Playwright 124 passed across desktop and mobile. Risk: item 6 in part; geometric tests pin overlap and overflow, but the visual proportion of the smaller mobile package needs human review on a real phone once deployed. Shipping to staging needs a new release candidate, which is a separate user decision.
