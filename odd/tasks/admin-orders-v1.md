# Feature: admin-orders-v1

Stage 2 of the `/admin` panel (see the staged plan in `odd/tasks/admin-access-v1.md`): the screens `A-Inicio`, `A-Pedidos`, `A-Pedido` and the "Registrar despacho" sheet, plus the backend they need (admin contracts for orders and shipping, the `shipments` table, admin order transitions, and order emails). Built by parallel agents under `AGENTS.md` section 5: one backend worker, one frontend worker, one read-only verifier; the coordinator owns this document. Branch `feat/admin-orders-v1` from `main` (`d661476`). Read this whole document through `## Log` before working.

Canonical sources: `docs/design/monteluna/admin/admin.md` and its `canvas/A-Inicio*`, `A-Pedidos*`, `A-Pedido*` and `A-Sistema` artboards, `docs/design/monteluna/design-system.md`, `docs/domain/orders.md`, `docs/domain/shipping.md`, `docs/domain/payments.md`, `docs/domain/notifications.md`, `docs/domain/identity.md`, `docs/architecture/api-conventions.md`, `docs/architecture/data-modeling.md`, and the skills `orders-domain`, `shipping-domain`, `payments-domain`, `notifications-domain`, `domain-events-outbox`, `backend-go-modules`, `database-postgres`, `frontend-astro-islands`, `testing`, `parallel-agents-orca`.

## Specs

### S1: Stage 2 scope
> "Porfa recupera memoria y comencemos a implementar el módulo de órdenes."

Scope fixed by the staged plan: "`admin-orders-v1` | Pedidos, Pedido, Registrar despacho, Inicio (order data only) | New admin contracts for orders and shipping". Both roles (`owner` and `staff`) can view orders, move them to "En preparación", register dispatch, mark delivered, and cancel; owner-only data (manual refunds) is shown only to owners. The sidebar adds only the entries whose screens exist after this stage (Inicio, Pedidos), and `/admin/` lands on Inicio instead of Mi cuenta (replacing the stage 1 rule in `admin-access-v1` L11).

### S2: Inicio, complete with order data
User selected: "Completo con datos de pedidos (Recomendado)": "KPIs + gráfico/tabla + alertas de pedidos (por despachar; reembolso pendiente solo owner) + últimos pedidos. Endpoint nuevo de métricas. Alertas de stock/tueste/factura se ocultan hasta su etapa."

- Period filters `Hoy`, `7 días`, `30 días`, `Rango`; KPIs "Ventas pagadas", "Pedidos", "Ticket promedio", "Unidades vendidas", each with the delta against the previous period of equal length.
- Sales chart by hour (Hoy) or day (other periods) with the previous-period comparison, and the `Ver tabla` / `Ver gráfico` toggle.
- "Requiere atención": "Pedidos pagados por despachar" for every role; "Reembolso manual pendiente" for owners only. Stock, roast-age and invoicing alerts are not rendered.
- "Últimos pedidos" with the canvas columns per width, and `Ver todos los pedidos` to Pedidos.
- Metrics count only paid orders (statuses `paid`, `preparing`, `shipped`, `delivered`) and use the store time zone `America/Bogota` for day and hour buckets.

### S3: Pedidos list
Canvas `A-Pedidos`: search "Número, cliente o correo"; filters `Estado`, `Fecha` (default "últimos 30 días") and `Método de pago`, with `Limpiar filtros`; mobile chips `Por despachar · N` and `Todos`; columns per width (order number, date sortable, customer, destination, total, order status badge, payment status badge, method); count "1–8 de 214 pedidos" (`total` field, allowed for admin tables by `api-conventions.md`), page size 25/50/100, cursor pagination; loading, empty, and error states with `Reintentar`.

User selected for the batch action: "Omitirla en v1": "Solo el cambio individual desde el detalle; la tabla queda sin checkboxes."

### S4: Pedido detail
Canvas `A-Pedido`: breadcrumb, order number, order and payment badges, date and customer; lines with image, title, variant, SKU, allocated lots (`lot_code × qty · tostado <date>`), quantity, unit price and line total; summary (subtotal, coupon discount with code, shipping with zone and band, taxes, total); payment attempts (reference, method, status, Wompi transaction id, time; hidden on mobile with the canvas note); timeline from `order_status_history` with notes; side cards Cliente, Entrega, Envío. Actions by status:

- `paid`: "Pasar a «En preparación»" and "Registrar despacho".
- `preparing`: "Registrar despacho".
- `shipped`: User selected: "Agregar «Marcar como entregado» (Recomendado)": "En pedidos Enviados, el botón primario de la cabecera (y la barra fija móvil) pasa a «Marcar como entregado», con confirmación. Desviación mínima del canvas."
- `paid` and `preparing`: the `...` menu offers "Cancelar pedido" (dialog with optional `Motivo`, recorded in the history).
- Other statuses: no actions.

Every write sends the record `version` (optimistic locking, `data-modeling.md`); a version conflict shows a message and reloads the order.

### S5: Registrar despacho
Canvas sheet: `Transportadora` (required), `Número de guía` (optional), `Enlace de seguimiento` (optional `https://` URL), the note "Al registrar, el pedido pasa a Enviado y [Cliente] recibe un correo con la transportadora y la guía.", `Cancelar` and `Registrar despacho`, success toast. 520 px at 1440/1024, full screen at 768/390.

User selected: "Desde Pagado con preparación auto (Recomendado)": "Si está Pagado, el backend registra paid→preparing→shipped en el historial en la misma transacción. La línea de tiempo queda completa."

### S6: Order emails
User selected: "Incluir despacho y cancelación (Recomendado)": "Notifications consume shipping.shipment_shipped y orders.order_cancelled con plantillas en español. Suma una tarea backend y cumple lo que promete la UI."

### S7: Backend rules
- Shipments: `shipping.shipments` per `shipping.md` 3.4, created `pending` by consuming `orders.order_paid`; dispatch sets `shipped`, `shipped_at`, `actor_id`, and publishes `shipping.shipment_shipped` through the outbox; `orders` consumes it idempotently (S5 rule for `paid`). Delivery is recorded on both the shipment and the order.
- Cancellation from `paid` or `preparing` publishes `orders.order_cancelled` (the existing payments consumer creates the manual refund), returns allocated stock to its lots, and records `actor_type = 'admin'`, `actor_id`, and the reason in `order_status_history`.
- No cross-schema reads: payment data reaches orders admin views through the payments module's public port; product images through the catalog port.
- Admin endpoints use the `adminSession` scheme, `401`/`403`, RFC 9457 problems, and the conventions in `api-conventions.md`.

### S8: Design fidelity and browser security
Same rules as `admin-access-v1` S3 and S4: read every original `.dc.html` (1440, 1024, 768, 390) and `A-Sistema` before building; replicate composition and responsive behaviour; visual acceptance compares rendered views against the artboards at every width; no private data in static HTML; data hydrated client-side after the session check. The Factura card in `A-Pedido` is not rendered (no invoicing data exists; L5).

## Tasks

| ID | Task | Specs | Owner | Commit |
|---|---|---|---|---|
| C1 | Admin contracts: `contracts/openapi/orders.yaml` (list, detail, dashboard metrics, to-preparing, deliver, cancel) and new `contracts/openapi/shipping.yaml` (register dispatch), plus contract tests; resolve the open items in L5 inside the contract and report each resolution | S1–S7 | backend worker | `2c155f2` |
| G1 | **Gate**: user approves the contract | — | user | approved (L7) |
| B1 | Shipping: `shipments` migration and sqlc, consumer of `orders.order_paid`, dispatch and deliver use cases, outbox `shipping.shipment_shipped`, admin HTTP handler | S5, S7 | backend worker | pending |
| B2 | Orders admin reads: list (search, filters, sort, cursor, `total`), detail (lots, history, payment attempts through the payments port, images through the catalog port), dashboard metrics | S2–S4, S7 | backend worker | pending |
| B3 | Orders admin writes: to-preparing, cancel (refund event, stock return, history), deliver, consumer of `shipping.shipment_shipped` with the paid→preparing→shipped rule | S4, S5, S7 | backend worker | pending |
| B4 | Notifications: consumers and Spanish templates for `shipping.shipment_shipped` and `orders.order_cancelled` | S6 | backend worker | pending |
| F1 | Frontend foundation: generated types, admin client functions, shell entries Inicio and Pedidos, `/admin/` lands on Inicio, shared order badges | S1, S8 | frontend worker | pending |
| F2 | Pedidos screen | S3, S8 | frontend worker | pending |
| F3 | Pedido screen with Registrar despacho sheet, cancel dialog and mark-delivered confirmation | S4, S5, S8 | frontend worker | pending |
| F4 | Inicio screen | S2, S8 | frontend worker | pending |
| V1 | Integrated verification on `feat/admin-orders-v1`: verdict per S#, visual comparison at every width, independent check of risk items | S1–S8 | verifier (read-only) | pending |
| R1 | Pull request to `main`; release and staging | S1 | user gate | pending |

Order: C1 → G1 → (B1 → B2 → B3 → B4) in parallel with (F1 → F2 → F3 → F4) against the approved contract and mocks → coordinator merges each worker branch → V1 → R1.

Workers and models (L3): backend worker `openai-codex/gpt-6.1-sol` (effort medium), frontend worker `claude-bridge/claude-sonnet-5-5`, coordinator `claude-bridge/claude-opus-5-5`. The verifier must use a model different from both writers.

Risks recorded before work: (1) data: B1 adds the `shipments` table; paid orders that already exist need a shipment row (backfill) or the dispatch use case must create one on demand; decided in C1. (2) security: admin endpoints and role gating (owner-only refund alert). (3) concurrency: dispatch, cancel and the `shipment_shipped` consumer can race on the same order; optimistic locking and idempotent consumers. (4) dependencies: the `Rango` date picker and the chart may need a library; any install stops for `dependency-audit` and user approval. Items 1–3 require the independent verification in V1.

## Log

- L1 (user, 2026-11-03): "Porfa recupera memoria y comencemos a implementar el módulo de órdenes."
- L2 (user decisions, 2026-11-03): Inicio: "Completo con datos de pedidos (Recomendado)". Dispatch from Pagado: "Desde Pagado con preparación auto (Recomendado)". Delivered: "Agregar «Marcar como entregado» (Recomendado)". Batch action: "Omitirla en v1". Order emails: "Incluir despacho y cancelación (Recomendado)".
- L3 (user, earlier session, 2026-11-03): "vamos a orquestar con opus 5.5, backend contrato y worker con Sol - medium, Frontend con sunnet 5.5". This overrides the frontend model in the `parallel-agents-orca` skill table for this feature.
- L4 (coordinator exploration): Only storefront paths exist in `orders.yaml` (`calculateOrderQuote`, `placeOrder`, `getGuestOrder`); there is no `shipping.yaml`. `shipping.shipments` is approved in `shipping.md` 3.4 but has no migration (`backend/internal/shipping/adapters/postgres/migrations` holds only zones and rates). Notifications consume only identity events and `payments.payment_failed`; no order email exists. Payment status and method live in `payments.payment_attempts`, not in `orders`. `shipping.md` says `shipment_shipped` moves the order "from preparing to shipped" while the canvas allows dispatch from `paid` (resolved by S5). The canvas has no mark-delivered control (resolved by S4).
- L5 (coordinator, open items for C1, to be shown to the user at G1): (a) `shipments.carrier_name` is `NOT NULL` in `shipping.md` but the row is created `pending` before any carrier is known; propose nullable with a check that requires it once `shipped`, and update `shipping.md` after approval. (b) Delivery: `shipping.md` defines no delivered event; propose how the order reaches `delivered` (shipment event or orders-owned transition). (c) Backfill of shipments for orders already paid (risk 1). (d) `A-Pedidos` header link "Ver despachos pendientes · 6" targets `A-Envios` (stage 4); propose applying the "Por despachar" filter instead. (e) The Factura card is not rendered: no invoicing data. (f) Whether the sidebar shows a "Por despachar" count badge now that the data exists (stage 1 omitted badges for lack of data).
- L6 (backend worker, C1, `2c155f2`): Seven admin operations, all `owner` and `staff`: `GET /api/v1/admin/orders` (listAdminOrders), `GET /api/v1/admin/orders/{id}` (getAdminOrder), `GET /api/v1/admin/orders/metrics` (getAdminOrderMetrics), `POST .../{id}/to-preparing` (prepareAdminOrder), `POST .../{id}/deliver` (deliverAdminOrder), `POST .../{id}/cancel` (cancelAdminOrder), and `POST .../{id}/dispatch` (dispatchAdminOrder, in `shipping.yaml`). Optimistic locking by strong ETag and `If-Match` (412 `version_conflict`). Proposed L5 resolutions: (a) `carrier_name` nullable while `pending`, required nonblank once `shipped`/`delivered`; (b) delivery owned by orders with a new `orders.order_delivered` event consumed idempotently by shipping; (c) no backfill: the shipment row is created on demand at dispatch, one per order; (d) the header link applies `pending_dispatch=true` with all dates and clears other filters; (e) no Factura fields; (f) a global `pending_dispatch_count` feeds the sidebar, mobile header and chips. Extra proposal: existing orders never stored the shipping zone or weight band, so those fields are null for historical orders and future placements snapshot them (domain doc update). Dispatch returns 200 once the shipment and its outbox event are stored; the order reaching `shipped` and the email are asynchronous. RED then GREEN contract tests; `go vet` passed. Merged fast-forward into `feat/admin-orders-v1`.
- L7 (user, G1, 2026-11-03): Contract: "Aprobar contrato (Recomendado)". L6 proposals (a)-(f): "Aceptar todas (Recomendado)". Shipping snapshot: "Sí, guardarlos desde ahora (Recomendado)": "Columnas nuevas nulables en orders; los pedidos antiguos muestran solo el valor del envío. Actualizo orders.md." Coordinator updated `docs/domain/shipping.md` (dispatch from paid/preparing, on-demand shipment, nullable pending carrier, `orders.order_delivered` consumer) and `docs/domain/orders.md` (paid→preparing→shipped rule, delivered transition and event, nullable zone and weight-band snapshot columns). B2 adds the snapshot migration and fills it at placement through the shipping public port. Delivery: chained PRs like stage 1 (contract and docs; backend slices; frontend slices), recorded at R1.
- L8 (backend worker, B1 slice 1, `8a5af06` on `feat/admin-orders-v1-backend`): shipment DTOs, strict dispatch validation and order-guarded application dispatch, RED then GREEN domain and app tests (260 added lines). Concurrency design: orders exposes a public guard that holds the order row lock until the shipping dispatch commits; B3 cancellation takes the same order lock and refuses when the shipment is already shipped, even before the `shipment_shipped` consumer converges. Risk item 4 for V1.
- L9 (backend worker, B1 slices 2-3, `ab4b9a2` 319 lines, `db2deb6` 396 lines): shipment schema and sqlc, transactional dispatch, consumers of `orders.order_paid` and `orders.order_delivered`; PostgreSQL 18 Testcontainers shipping suite passes after fixing UTC DTO normalization and a legacy test that assumed migration 2 was the latest. Next B1 unit: the public orders lock guard and a public identity session middleware bridge for the dispatch endpoint. Frontend F1 has `20b97f1` (typed client) and `3af0a5d` (Inicio landing, Pedidos navigation, badges); `task frontend:verify` running.
