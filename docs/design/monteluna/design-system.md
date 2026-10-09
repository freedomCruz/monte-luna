# Monteluna Design System

Status: canonical design reference approved by the merchant on 2026-10-09; implemented with shadcn/ui (Radix) + Tailwind per [system-architecture.md](../../architecture/system-architecture.md).

The source of truth for every value below is the design sheet [`canvas/M-Sistema.dc.html`](canvas/M-Sistema.dc.html). When this document and the sheet disagree, the sheet wins and this document must be corrected.

UI copy in the screens is Spanish on purpose: it is the storefront language. Prices are Colombian pesos without decimals, written as `$38.000`.

## 1. Principles

- Bold and fresh, not a classic ecommerce template. One background colour per section.
- Products are cut-out packaging images, large, rotated a few degrees, and overflowing their container.
- No shadows on UI surfaces, no gradients, no photos inside frames.
- One red button per screen. Red means the main action or an offer, nothing else.
- Green means coffee, purple means cacao, yellow means navigation and accents on dark surfaces.
- WCAG AA contrast. Never rely on colour or line decoration alone: a sold-out option also says "Agotado", an error also has an icon and text.

## 2. Colour tokens

Token names follow the shadcn/ui variable convention so they map to Tailwind theme variables. Names marked "own" are additions.

| Token | Hex | CSS variable | Use |
| --- | --- | --- | --- |
| background | `#FAF3E3` | `--background` | Page background |
| card | `#FFFFFF` | `--card`, `--popover` | Cards, chips, white sections, form fields |
| secondary | `#F3E6C4` | `--secondary`, `--muted` | Info panels, pills, thumbnails |
| hero | `#F8E4AE` | `--hero` (own) | Hero and page header bands, applied coupon |
| foreground | `#1B1510` | `--foreground`, `--primary`, `--ring` | Text, dark button, marquee, footer, field border |
| primary-foreground | `#FAF3E3` | `--primary-foreground` | Text on dark, green, and purple |
| muted-foreground | `#5F554A` | `--muted-foreground` | Secondary text, crossed-out price, placeholders |
| accent | `#C1272D` | `--accent` | Main action and offers (hover `#A51F26`, proposed) |
| brand-green | `#0F3B2C` | `--brand-green` (own) | Coffee, top bar, selected chip, checked box |
| brand-yellow | `#F2B632` | `--brand-yellow` (own) | Header, accents on dark surfaces |
| brand-purple | `#4B1C52` | `--brand-purple` (own) | Everything cacao |
| border | `#E6D9BC` | `--border` | Hairlines, disabled button |
| input | `#D9CBA8` | `--input` | Chip border at rest |
| dashed | `#A8997C` | `--dashed` (own) | Dashed outlines, pending steps, ticket cut. Used across the sheet but not listed there as a named token |
| success | `#1E6B45` | `--success` (own) | "Disponible", completed step |
| destructive | `#9B1C1C` | `--destructive` | Errors, "Agotado", rejected payment |

Soft text on dark surfaces uses `#E9DDC3`.

```css
:root {
  --background: #FAF3E3;
  --card: #FFFFFF;
  --popover: #FFFFFF;
  --secondary: #F3E6C4;
  --muted: #F3E6C4;
  --hero: #F8E4AE;
  --foreground: #1B1510;
  --primary: #1B1510;
  --ring: #1B1510;
  --primary-foreground: #FAF3E3;
  --muted-foreground: #5F554A;
  --accent: #C1272D;
  --brand-green: #0F3B2C;
  --brand-yellow: #F2B632;
  --brand-purple: #4B1C52;
  --border: #E6D9BC;
  --input: #D9CBA8;
  --dashed: #A8997C;
  --success: #1E6B45;
  --destructive: #9B1C1C;
}
```

## 3. Typography

Fonts: Barlow (400 to 800) for everything, Barlow Condensed (700, 800) for uppercase labels, the wordmark, and seals. Both are on Google Fonts.

| Style | Font | Size (mobile) | Weight | Line height | Notes |
| --- | --- | --- | --- | --- | --- |
| display | Barlow | 46–90 px by width | 800 | 0.95 | Tracking −0.015em. Hero headline |
| h1 | Barlow | 64 px (40) | 800 | 1 | Tracking −0.015em. Product name, page title |
| h2 | Barlow | 56 px (36) | 800 | 1 | Tracking −0.015em. Section title |
| h3 | Barlow | 30 px | 800 | 1.1 | 26 px in product cards (18 on mobile) |
| price | Barlow | 44 px (36) | 800 | 1 | Tracking −0.02em |
| body | Barlow | 18 px (17) | 400 | 1.5 | |
| small | Barlow | 15 px | 500 | 1.45 | `muted-foreground` |
| nav | Barlow | 18 px | 700 | 1 | Uppercase |
| button | Barlow | 16 px | 700 | 1 | Uppercase, tracking 0.02em |
| label | Barlow Condensed | 16 px | 700 | 1.2 | Uppercase, tracking 0.08em |

## 4. Shape, spacing, and focus

- Radius: 8 px pills, 12 px buttons, chips, and fields, 16 px info panels, 20 px cards, full circle for seals.
- Container: max width 1320 px, side padding 48 px (20 px on mobile).
- Section padding: 104 px vertical (64 to 72 px on mobile).
- Shadows: none on UI. Only cut-out products get `drop-shadow(0 18px 14px rgba(27,21,16,.24))`.
- Focus: 3 px outline in `foreground` with 3 px offset. On dark surfaces the outline is `brand-yellow`.
- Touch targets: 44 px minimum.
- Breakpoints designed: 1440 px desktop and 390 px mobile. Layouts use wrapping flex and grid, not fixed widths.

## 5. Motion

- Easing `cubic-bezier(.22, 1, .36, 1)` for surfaces, `cubic-bezier(.34, 1.4, .64, 1)` for products that drop in with a small bounce.
- Cart panel: opens in 480 ms, closes in 320 ms. Scrim is `foreground` at 58 % with a 3 px blur, in 380 ms. Lines rise in a stagger of about 80 ms.
- Marquee band: continuous horizontal loop.
- `prefers-reduced-motion: reduce` removes every animation and transition.

## 6. Components

Each component is drawn with all its states in the sheet. This list says where to look and what must not change.

| Component | Key rules |
| --- | --- |
| Buttons | Red (`accent`) for the main action, dark (`primary`) for secondary, cream on dark surfaces. Radius 12, uppercase 700 |
| Top bar, header, marquee | Green slogan bar, yellow header with the "Monteluna" wordmark, dark marquee with rotated cream pills |
| Option chip | Rest, hover, selected (green), focus, sold out, sold out and selected. Sold out shows the "Agotado" label, a dashed border, and a strikethrough |
| Price, stepper, pills, seal | Stepper has a 2 px `foreground` border. The seal is a rotated circle with a dashed inner outline |
| Product card | White, radius 20. The product overflows the top by 130 px (mobile value: see section 10). The button opens the product page and never adds to the cart. Roast meter for coffee, percentage meter for cacao |
| Colour panel | Green for coffee, purple for cacao. Yellow label, title, one paragraph, optional cream button |
| Numbered step, big figure | Used in the origin page |
| Cart line | Product pops out of the top-left corner. Compact 44 px stepper, remove icon button |
| Order summary | Says "Subtotal estimado" in the cart. In checkout it has a dashed ticket cut before the total |
| Purchase steps | Carrito, Datos y envío, Pago. Done steps use a `success` circle with a check and link back. The same component is the order tracker |
| Cart panel | 500 px right drawer on desktop, bottom sheet with 24 px top radius on mobile |
| Form field | Label above (16 px, 700). Box 56 px high, radius 12, 2 px `foreground` border so the boundary passes 3:1. Help and error below at 15 px. Optional fields say "(opcional)"; required fields carry no asterisk |
| Checkbox | 28 px, radius 8. Checked uses `brand-green` |
| Coupon field | Field plus dark "Aplicar" button. Applied coupon is a dashed ticket on `hero` with a remove button |
| Alerts | Error: white with a 2 px `destructive` border, icon, text, and a way out. Information: `secondary`, no border |
| Checkout header | Wordmark, "Compra segura", and a link back to the cart. No navigation |
| Form block seal | Letters A, B, C in a `brand-yellow` circle, so they are not confused with the numbered steps |
| Summary line | 64 to 72 px thumbnail on `secondary` with the product peeking out and a quantity counter |
| Shipping quote | Green panel with destination, delivery estimate, and price. Empty state is a dashed box |
| Reservation timer | Dark block with a countdown and a draining yellow bar. Appears only after the order exists |
| Payment method row | Informational tile. It is not a selector |
| Origin template | Data-driven; see section 8 |

## 7. Screens

All screens exist at 1440 px and 390 px (`-390` suffix).

| Screen | File | Notes |
| --- | --- | --- |
| Design system sheet | `M-Sistema` | Tokens, type, components with states |
| Home | `M-Inicio` | Hero, marquee, product cards, benefits, cacao split, origin band |
| Shop | `M-Listado` | Filter chips, coffee and cacao groups |
| Product detail | `M-Detalle` | Weight and grind chips, sold-out combination, roast date, link to the origin |
| Origin (coffee) | `M-Origen` | Template instance for a coffee farm |
| Origin (cacao) | `M-Origen-Cacao` | Same template with empty states |
| Origins index | `M-Origenes` | Target of the "Orígenes" menu entry |
| Cart panel | `M-Carrito-Panel` | Animated drawer and bottom sheet, empty state |
| Cart page | `M-Carrito` | Lines, sticky summary, cross-sell |
| Checkout: details and shipping | `M-Checkout-Datos` | Contact, delivery, optional invoice data, coupon, consent |
| Checkout: review and pay | `M-Checkout-Pago` | Review, payment methods, order created with reservation |
| Order result | `M-Pedido` | States: paid, confirming, rejected, expired |

## 8. Rules that come from the domain documents

These are not style choices. Changing them means changing a domain document first.

- Origin page ([catalog.md](../../domain/catalog.md)): one template rendered per origin. Variety, process, tasting notes, cupping score, and roast are product attributes and never appear as origin facts. A product without an origin shows no origin link.
- Cart ([orders.md](../../domain/orders.md)): lives only in the browser. The browser never computes prices, discounts, taxes, or shipping, so the cart says "Subtotal estimado" and shows no shipping cost, no free-shipping bar, and no coupon field.
- Guest checkout only ([identity.md](../../domain/identity.md)). No login or registration. The order is reached only through the private link sent by email, never by order number.
- Customer data ([orders.md](../../domain/orders.md)): email and name are required; contact phone is optional. The delivery address requires recipient name, phone, address line, department, and municipality; second line, postal code, and delivery notes are optional.
- Shipping ([shipping.md](../../domain/shipping.md)): one rate per destination and weight, so the customer does not choose a carrier. An uncovered municipality blocks checkout with a clear explanation.
- Coupons ([promotions.md](../../domain/promotions.md)): one per order, validated with the customer email and destination, entered in checkout.
- Taxes ([invoicing-and-taxes.md](../../architecture/invoicing-and-taxes.md)): no VAT line under the approved scenario.
- Payment ([payments.md](../../domain/payments.md)): the method is chosen inside the Wompi widget. The return page is only a hint, so a "confirming" state exists. Retries are allowed while the reservation lasts; at most one payment is approved.
- Reservation ([orders.md](../../domain/orders.md)): stock is reserved for 30 minutes when the order is placed, not when adding to the cart.
- Consent ([notifications.md](../../domain/notifications.md)): express consent for personal data is collected at checkout. The checkbox starts unchecked.

## 9. Proposals not backed by a domain document

Confirm these before building them.

- Names of the purchase steps and of the customer-facing order statuses (Pago recibido, Preparando, Enviado, Entregado).
- Invoice data as an opt-in checkbox in checkout.
- Roast date and origin link inside the cart; cross-sell in the cart.
- Cart line state for a variant that ran out, and the "sold out while buying" alert in checkout.
- "This page refreshes itself" while a payment is confirming.
- Link to purchase terms next to the data policy.
- Hover colour `#A51F26` for the red button.

## 10. Known inconsistencies in the canvas

Resolve these in the canvas before treating either value as final.

- Product card on mobile: the sheet says the product overflows by 72 px and the title is 18 px; the shop screen (`M-Listado-390`) uses 120 px and 26 px.
- The canvas was never rendered and checked by its author. Heights, wrapping, and animations are unverified.

## 11. Placeholder content

Replace before production.

- Prices: Finca El Mirador $38.000 (was $45.000) comes from the original brief. Finca La María $42.000 and chocolates $14.000 to $16.000 are market approximations.
- Shipping $9.500, free shipping from $60.000, and the coupon `BIENVENIDA10` are invented examples.
- The cacao origin, the municipality, the farm story, and the legal footer line are bracketed placeholders.
- Stock photos listed in [README.md](README.md) are placeholders for the merchant's own photography.
