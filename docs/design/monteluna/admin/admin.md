# Monteluna Admin Panel Design

Export of the `/admin` panel design from the Claude Design canvas, page "Admin: panel de Monteluna", taken on 2026-11-02.

- Canvas: https://claude.ai/artifact/WU32jFHtXEDBQdwfrVqDoK (private to the merchant's account).
- Exported canvas version: `1793634018-16ff`.
- Storefront tokens, fonts and images: see [../design-system.md](../design-system.md) and [../README.md](../README.md). The admin reuses them; it adds no new colour.

Status: design reference, not an architecture decision. UI copy is Spanish on purpose. All names, orders, amounts and dates in the screens are example data.

## Contents

| Path | What it is |
| --- | --- |
| `canvas/A-Sistema.dc.html` | Component sheet for the panel. Start here |
| `canvas/A-*.dc.html` | One file per screen; `-1024`, `-768` and `-390` files are tablet and mobile views |
| `canvas/canvas.json` | Index of the whole canvas (storefront and admin pages) |

The `.dc.html` files load `./support.js` and `/_blob/<id>` image URLs that exist only inside the canvas, so they do not render when opened directly. Every image they use is already in [../assets/](../assets/); the map is in [../README.md](../README.md). Files are byte-identical to the published version; do not reformat them.

## How the screens are built

- Each screen is one component with an `ancho` prop (`1440`, `1024`, `768`, `390`). The tablet and mobile files only import it with a different `ancho`, so the layout rules live in the main file.
- Tweaks on each artboard switch states (loading, empty, error, open Sheet, dialogs, role).
- The shell (sidebar and top bar) is repeated in every screen file.

## Layout rules

| Width | Behaviour |
| --- | --- |
| 1440 | Sidebar open (248 px), all table columns, Sheet 520 px over the list |
| 1024 | Sidebar collapsed to icons (72 px), secondary columns hidden and shown in the Sheet |
| 768 | Same as 1024 with fewer columns; Sheet and detail views go full screen |
| 390 | Read-only mode: dashboard, alerts, orders, order detail and "Registrar despacho". Catalog and settings show a message to use a computer or tablet |

Only the screens whose layout changes the most have tablet artboards: Inicio, Productos, Producto, Inventario, Pedidos, Pedido, Pagos and Cupones. Mobile artboards exist for Login, Inicio, Pedidos and Pedido.

## Visual rules

- Sidebar in `foreground` (`#1B1510`); active item in `brand-yellow`. White 64 px top bar with global search, pending alerts and the user menu.
- Radii: 8 px buttons, fields, chips and badges; 12 px cards, tables, menus and toasts; 20 px Sheet, Dialog and the sign-in card.
- Controls are 44 px high. Field border is 1 px `muted-foreground` (`#5F554A`) to pass 3:1.
- One red (`accent`) button per view. Destructive confirmation also uses red, only inside a Dialog that names the object and explains the consequence.
- Shadows only on floating layers (menus, toasts); Sheet and Dialog sit on a `foreground` scrim at 50 %.
- The yellow brand seal appears only on the sign-in screen and empty states.

### Status badges

Colour says what to do; the text always names the state.

| Tone | Colours | Used for |
| --- | --- | --- |
| Requires action | `#F2B632` on `#1B1510` | Paid (to dispatch), pending refund, low stock, old roast |
| In progress | `#0F3B2C` on `#FAF3E3` | Preparing, shipped, pending payment attempt |
| Done | `#1E6B45` on `#FFFFFF` | Delivered, approved, published, issued, active |
| Neutral | `#F3E6C4` on `#1B1510` | Draft, pending payment (order), expired, archived, paused |
| Problem | `#9B1C1C` on `#FFFFFF` | Cancelled, declined, error, out of stock |

## Screens

| Group | Files |
| --- | --- |
| Access and security | `A-Login`, `A-2FA`, `A-2FA-Activar`, `A-Recuperar`, `A-Cuenta`, `A-Sin-Acceso` |
| Dashboard | `A-Inicio` |
| Catalog | `A-Productos`, `A-Producto`, `A-Inventario`, `A-Categorias`, `A-Origenes`, `A-Marcas-Tipos` |
| Orders | `A-Pedidos`, `A-Pedido` |
| Payments, shipping, coupons, reports | `A-Pagos`, `A-Envios`, `A-Cupones`, `A-Informes` |
| Settings (owner only) | `A-Admins`, `A-Fiscal`, `A-Facturacion`, `A-Correos`, `A-Seguridad` |

## Rules taken from the domain documents

- Roles: owner sees everything; staff sees catalog, inventory and orders. Hidden options are not rendered; a direct link shows "Sin acceso" ([identity.md](../../../domain/identity.md)).
- At least one active owner; the last one cannot be disabled or demoted.
- TOTP two-step verification is mandatory; recovery codes are single use; password reset links last 30 minutes and never reveal whether an email exists.
- Stock lives in lots and sales take the oldest lot first ([catalog.md](../../../domain/catalog.md)). The reference price must be higher than the price and drives the "Ahorras" badge.
- Order statuses and transitions follow [orders.md](../../../domain/orders.md); dispatch needs a carrier, with tracking number and URL optional ([shipping.md](../../../domain/shipping.md)).
- Payment attempt and refund statuses and refund reasons follow [payments.md](../../../domain/payments.md); settlements must satisfy net = gross − fee − fee VAT − withholdings.
- Shipping rates may not overlap within a zone; an uncovered municipality blocks checkout.
- Coupons: one per order, uppercase code, `active`, `paused` or `archived` ([promotions.md](../../../domain/promotions.md)).
- VAT warning at 3,500 UVT for non-VAT-responsible merchants; the panel only informs ([invoicing-and-taxes.md](../../../architecture/invoicing-and-taxes.md)).
- Suppressed email addresses are read-only in the panel ([notifications.md](../../../domain/notifications.md)).
- Pagination is cursor based, so lists show "Anterior / Siguiente" with a counter and rows per page, without page numbers ([api-conventions.md](../../../architecture/api-conventions.md)).
- Edit conflicts show "Alguien más cambió este producto. Recarga para ver la versión actual."

## Proposals not backed by a domain document

Confirm these before building them.

- Password rules (12 characters, not containing the email or name, not in leaked-password lists).
- Lockout duration after failed sign-ins (the screen shows about 15 minutes).
- Ten recovery codes per set.
- Admin invitation flow (email to set a password, two-step verification on first sign-in).
- Low-stock threshold (fewer than 10 units) and "old roast" threshold (more than 30 days).
- Showing reservations and releases as rows in the inventory movement history.
- "Ventas por producto" report and CSV export.
- Customer-facing labels for order statuses and the bulk action "Pasar a «En preparación»".

## Known gaps

- The canvas was never rendered and checked by its author. Heights, wrapping, imports between artboards and animations are unverified.
- Settings screens have no tablet artboards; `A-Seguridad` uses a simplified sidebar without collapse.
- Inputs show sample values; they may be read-only in the canvas Play mode.
