import type * as React from 'react';
import { formatCalendarDay, formatOrderDateTime, formatOrderDestination } from '../../../../lib/admin/order-format';
import { paymentMethodLabel } from '../../../../lib/admin/order-status';
import {
  buildTimeline,
  deliveryRateNote,
  formatPhone,
  paidAgo,
  shippingLineLabel,
  unitsLabel,
} from '../../../../lib/admin/order-detail';
import type { AdminOrder, AdminOrderLine } from '../../../../lib/admin/orders';
import { formatMoneyCop } from '../../../../lib/shared/formatters';
import { PaymentStatusBadge } from '../OrderBadges';

const CARD = 'rounded-md border border-border bg-card';
const SIDE_HEADING = 'm-0 font-condensed text-sm font-bold uppercase tracking-[0.08em] text-muted-foreground';
const TH = 'h-10 px-2.5 text-left';
const money = (amount: number) => formatMoneyCop(amount);

function LineImage({ line, size }: { line: AdminOrderLine; size: 'md' | 'sm' }) {
  // The product photo overflows its tile from the top, as in the canvas.
  return (
    <span className={`relative flex-none overflow-hidden rounded-sm bg-secondary ${size === 'md' ? 'size-12' : 'size-11'}`}>
      {line.image_url && <img src={line.image_url} alt="" className={`absolute left-1/2 top-0.5 -translate-x-1/2 ${size === 'md' ? 'h-[58px]' : 'h-[52px]'}`} />}
    </span>
  );
}

const unitsOf = (order: AdminOrder) => order.lines.reduce((sum, line) => sum + line.quantity, 0);

/** Productos card (≥ 768 px): lines with allocated lots, then the money summary. */
export function OrderLinesCard({ order }: { order: AdminOrder }) {
  const { summary } = order;
  return (
    <section aria-labelledby="h-lineas" className={CARD}>
      <h2 id="h-lineas" className="m-0 px-5 py-4 text-lg font-extrabold">Productos · {unitsLabel(unitsOf(order))}</h2>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary font-condensed text-[13px] uppercase tracking-[0.08em]">
              <th className="h-10 pl-5 pr-3 text-left">Producto</th>
              <th className={TH}>Lote asignado</th>
              <th className="px-2.5 text-right">Cant.</th>
              <th className="hidden px-2.5 text-right min-[1024px]:table-cell">Precio</th>
              <th className="pl-2.5 pr-5 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="border-t border-border align-middle">
                <td className="py-3 pl-5 pr-3">
                  <span className="flex items-center gap-3">
                    <LineImage line={line} size="md" />
                    <span className="flex flex-col"><span className="font-extrabold">{line.product_title}</span><span className="text-[13px] text-muted-foreground">{line.variant_label} · {line.sku}</span></span>
                  </span>
                </td>
                <td className="px-2.5 py-3">
                  <span className="flex flex-col gap-0.5">
                    {line.lot_allocations.map((lot) => (
                      <span key={lot.lot_id} className="text-[13px]"><span className="font-extrabold">{lot.lot_code}</span> × {lot.quantity} <span className="text-muted-foreground">· tostado {formatCalendarDay(lot.production_date)}</span></span>
                    ))}
                  </span>
                </td>
                <td className="px-2.5 py-3 text-right font-bold">{line.quantity}</td>
                <td className="hidden px-2.5 py-3 text-right min-[1024px]:table-cell">{money(line.unit_price_amount)}</td>
                <td className="py-3 pl-2.5 pr-5 text-right font-extrabold">{money(line.line_total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-x-5 gap-y-2 border-t border-border px-5 py-4 text-[15px]">
        <dt>Subtotal</dt><dd className="m-0 text-right font-semibold">{money(summary.subtotal_amount)}</dd>
        {summary.discount_amount > 0 && <><dt>{summary.coupon_code ? `Descuento · cupón ${summary.coupon_code}` : 'Descuento'}</dt><dd className="m-0 text-right font-bold text-accent">−{money(summary.discount_amount)}</dd></>}
        <dt>{shippingLineLabel(summary.shipping)}</dt><dd className="m-0 text-right font-semibold">{money(summary.shipping_amount)}</dd>
        {summary.shipping_discount_amount > 0 && <><dt>Descuento de envío</dt><dd className="m-0 text-right font-bold text-accent">−{money(summary.shipping_discount_amount)}</dd></>}
        <dt>Impuestos</dt><dd className="m-0 text-right font-semibold">{money(summary.tax_amount)}</dd>
        <dt className="border-t-2 border-foreground pt-2.5 text-[17px] font-extrabold">Total</dt><dd className="m-0 border-t-2 border-foreground pt-2.5 text-right text-[22px] font-extrabold">{money(summary.total_amount)}</dd>
      </dl>
    </section>
  );
}

/** Productos card at 390 px: compact rows and one total line. */
export function OrderLinesCompact({ order }: { order: AdminOrder }) {
  const { summary } = order;
  const includes = [
    summary.discount_amount > 0 ? `cupón −${money(summary.discount_amount)}` : null,
    summary.shipping_amount > 0 ? `envío ${money(summary.shipping_amount)}` : null,
  ].filter(Boolean);
  return (
    <section aria-labelledby="h-lineas" className={`${CARD} flex flex-col gap-2.5 p-3.5`}>
      <h2 id="h-lineas" className="m-0 text-base font-extrabold">Productos · {unitsLabel(unitsOf(order))}</h2>
      {order.lines.map((line) => (
        <div key={line.id} className="flex gap-2.5">
          <LineImage line={line} size="sm" />
          <span className="flex flex-1 flex-col gap-px">
            <span className="text-sm font-extrabold">{line.product_title} × {line.quantity}</span>
            <span className="text-xs text-muted-foreground">{line.variant_label} · lotes {line.lot_allocations.map((lot) => `${lot.lot_code} ×${lot.quantity}`).join(', ')}</span>
          </span>
          <span className="text-sm font-extrabold">{money(line.line_total_amount)}</span>
        </div>
      ))}
      <div className="flex justify-between border-t-2 border-foreground pt-2.5 text-base font-extrabold"><span>Total</span><span>{money(summary.total_amount)}</span></div>
      {includes.length > 0 && <span className="text-xs text-muted-foreground">Incluye {includes.join(' y ')}.</span>}
    </section>
  );
}

/** Intentos de pago card (hidden at 390 px). */
export function OrderPaymentsCard({ order }: { order: AdminOrder }) {
  return (
    <section aria-labelledby="h-pagos" className={CARD}>
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4">
        <h2 id="h-pagos" className="m-0 text-lg font-extrabold">Intentos de pago · {order.payment_attempts.length}</h2>
        <span className="text-[13px] text-muted-foreground">Puede haber varios intentos; solo uno queda aprobado.</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="bg-secondary font-condensed text-[13px] uppercase tracking-[0.08em]">
              <th className="h-10 pl-5 pr-3 text-left">Referencia</th>
              <th className={TH}>Método</th>
              <th className={TH}>Estado</th>
              <th className={`${TH} hidden min-[1440px]:table-cell`}>ID de Wompi</th>
              <th className="pl-2.5 pr-5 text-left">Hora</th>
            </tr>
          </thead>
          <tbody>
            {order.payment_attempts.map((attempt) => (
              <tr key={attempt.id} className="h-[52px] border-t border-border">
                <td className="pl-5 pr-3 font-bold">{attempt.reference}</td>
                <td className="px-2.5">{paymentMethodLabel(attempt.payment_method_type)}</td>
                <td className="px-2.5"><PaymentStatusBadge status={attempt.status} /></td>
                <td className="hidden px-2.5 text-muted-foreground min-[1440px]:table-cell">{attempt.provider_transaction_id ?? '—'}</td>
                <td className="whitespace-nowrap pl-2.5 pr-5 text-muted-foreground">{formatOrderDateTime(attempt.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Línea de tiempo from the status history, with the steps still ahead. */
export function OrderTimelineCard({ order, compact = false }: { order: AdminOrder; compact?: boolean }) {
  const entries = buildTimeline(order);
  const dot = (state: 'done' | 'pending') => (state === 'done' ? 'border-brand-green bg-brand-green' : 'border-[color:var(--dashed)] bg-card');
  return (
    <section aria-label="Línea de tiempo" className={`${CARD} flex flex-col ${compact ? 'gap-2.5 p-3.5' : 'gap-3.5 px-5 py-[18px]'}`}>
      <h2 className={`m-0 font-extrabold ${compact ? 'text-base' : 'text-lg'}`}>Línea de tiempo</h2>
      <ol className={`m-0 flex list-none flex-col p-0 ${compact ? 'gap-2.5' : ''}`}>
        {entries.map((entry) => (
          <li key={entry.key} className={`flex ${compact ? 'items-start gap-2.5' : 'min-h-[58px] gap-3.5'}`}>
            <span className={`flex flex-col items-center ${compact ? 'mt-[3px]' : ''}`}>
              <span className={`box-border rounded-full border-2 ${compact ? 'size-3.5' : 'size-4'} ${dot(entry.state)}`} />
              {!compact && !entry.last && <span className="w-0.5 flex-1 bg-border" />}
            </span>
            <span className={`flex flex-col gap-0.5 ${compact ? '' : 'pb-3'}`}>
              <span className={`font-extrabold ${compact ? 'text-sm' : 'text-[15px]'} ${entry.state === 'pending' ? 'text-muted-foreground' : ''}`}>{entry.title}</span>
              <span className={`text-muted-foreground ${compact ? 'text-xs' : 'text-[13px]'}`}>{entry.detail}</span>
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function SideCard({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className={`${CARD} flex flex-col gap-1 px-5 py-[18px]`}>
      <h2 id={id} className={`${SIDE_HEADING} mb-1.5`}>{title}</h2>
      {children}
    </section>
  );
}

export function CustomerCard({ order }: { order: AdminOrder }) {
  const { customer } = order;
  return (
    <SideCard id="h-cliente" title="Cliente">
      <span className="text-base font-extrabold">{customer.full_name}</span>
      <span className="text-sm">{customer.email}</span>
      {customer.phone && <span className="text-sm">{formatPhone(customer.phone)}</span>}
    </SideCard>
  );
}

function addressLines(order: AdminOrder) {
  const { shipping_address: address } = order;
  return {
    street: [address.address_line1, address.address_line2].filter(Boolean).join(', '),
    town: formatOrderDestination(address.municipality_name, address.department_name),
    address,
  };
}

export function DeliveryCard({ order }: { order: AdminOrder }) {
  const { street, town, address } = addressLines(order);
  return (
    <SideCard id="h-entrega" title="Entrega">
      <span className="text-base font-extrabold">{street}</span>
      <span className="text-sm">{town} · {address.municipality_code}</span>
      <span className="text-sm">Recibe {address.recipient_name} · {formatPhone(address.recipient_phone)}</span>
      {address.delivery_notes && <span className="text-[13px] text-muted-foreground">Nota: {address.delivery_notes}</span>}
      <span className="mt-2 rounded-sm bg-background px-3 py-2.5 text-[13px] leading-[1.4]">{deliveryRateNote(order.summary.shipping)}</span>
    </SideCard>
  );
}

/** Entrega card at 390 px (A-Pedido-390): address, recipient with a call link and the note. */
export function DeliveryCompact({ order }: { order: AdminOrder }) {
  const { street, town, address } = addressLines(order);
  return (
    <section aria-labelledby="h-entrega" className={`${CARD} flex flex-col gap-[3px] p-3.5`}>
      <h2 id="h-entrega" className={`${SIDE_HEADING} mb-1 text-[13px]`}>Entrega</h2>
      <span className="text-[15px] font-extrabold">{street}</span>
      <span className="text-sm">{town}</span>
      <span className="text-sm">{address.recipient_name} · <a href={`tel:${address.recipient_phone}`} className="font-bold">{formatPhone(address.recipient_phone)}</a></span>
      {address.delivery_notes && <span className="text-xs text-muted-foreground">{address.delivery_notes}</span>}
    </section>
  );
}

/** Envío card: dispatch state, carrier and tracking. */
export function ShipmentCard({ order, now, compact = false }: { order: AdminOrder; now: Date; compact?: boolean }) {
  const { shipment } = order;
  const dispatched = shipment !== null && (shipment.status === 'shipped' || shipment.status === 'delivered' || shipment.status === 'returned');
  const awaiting = order.status === 'paid' || order.status === 'preparing';
  return (
    <section aria-labelledby="h-envio" className={`${CARD} flex flex-col gap-2 ${compact ? 'p-3.5' : 'px-5 py-[18px]'}`}>
      <h2 id="h-envio" className={SIDE_HEADING}>Envío</h2>
      {dispatched && shipment ? (
        <>
          <span className="text-[15px] font-bold">{shipment.carrier_name}</span>
          {shipment.tracking_number && <span className="text-sm">Guía {shipment.tracking_number}</span>}
          {shipment.tracking_url && <a href={shipment.tracking_url} rel="noreferrer" target="_blank" className="w-fit text-sm font-bold">Ver seguimiento</a>}
          {shipment.shipped_at && <span className="text-[13px] text-muted-foreground">Enviado {formatOrderDateTime(shipment.shipped_at)}</span>}
          {shipment.delivered_at && <span className="text-[13px] text-muted-foreground">Entregado {formatOrderDateTime(shipment.delivered_at)}</span>}
        </>
      ) : awaiting ? (
        <>
          <span className="text-[15px] font-bold">Aún no se despacha</span>
          <span className="text-[13px] leading-[1.4] text-muted-foreground">{order.paid_at ? `Pagado ${paidAgo(order.paid_at, now)}. ` : ''}Al registrar la guía, la cliente recibe un correo con el seguimiento.</span>
        </>
      ) : (
        <span className="text-[15px] font-bold">Sin despacho</span>
      )}
    </section>
  );
}
