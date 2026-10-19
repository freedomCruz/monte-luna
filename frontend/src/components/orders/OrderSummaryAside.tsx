import React from 'react';
import type { components } from '../../generated/orders';
import { formatMoneyCop } from '../../lib/shared/formatters';
import {
  formatPaymentMethodLabel,
  resolveTrackingViewState,
} from '../../lib/orders/payment-tracking';

export interface OrderSummaryAsideProps {
  lines: components['schemas']['GuestOrderLine'][];
  subtotalAmount: number;
  shippingAmount: number;
  totalAmount: number;
  status: components['schemas']['OrderStatus'];
  payment?: components['schemas']['GuestPayment'] | null;
}

export function OrderSummaryAside({
  lines,
  subtotalAmount,
  shippingAmount,
  totalAmount,
  status,
  payment,
}: OrderSummaryAsideProps) {
  const viewState = resolveTrackingViewState(status, payment);

  let totalLabel = 'Total';
  let totalNote: string | null = 'Pesos colombianos';

  switch (viewState) {
    case 'Pagado':
      totalLabel = 'Total pagado';
      totalNote = formatPaymentMethodLabel(payment?.payment_method_type ?? null);
      break;
    case 'Confirmando':
      totalLabel = 'Total';
      totalNote = 'Pago en confirmación';
      break;
    case 'Rechazado':
      totalLabel = 'Total por pagar';
      totalNote = 'Pesos colombianos';
      break;
    case 'Vencido':
      totalLabel = 'Total';
      totalNote = 'Pedido sin pagar';
      break;
    case 'Cancelado':
      totalLabel = 'Total pagado';
      totalNote = 'Te lo devolvemos completo';
      break;
  }

  return (
    <aside
      aria-labelledby="h-resumen-pedido"
      className="flex-1 w-full lg:max-w-[420px] flex flex-col gap-5 p-6 md:p-7 bg-card border border-border rounded-2xl shadow-xs"
    >
      <h2 id="h-resumen-pedido" className="font-sans text-2xl md:text-3xl font-extrabold m-0">
        Resumen
      </h2>

      {/* Line items list */}
      <div className="flex flex-col gap-4">
        {lines.map((line) => (
          <div key={line.variant_id} className="flex items-center gap-4">
            {/* Thumbnail shell */}
            <div className="relative shrink-0 w-16 h-16 md:w-18 md:h-18 rounded-xl bg-hero/20 flex items-center justify-center overflow-visible border border-hero/30">
              <span className="font-condensed text-xl font-black text-hero">
                ☕
              </span>
              <span className="absolute -top-2 -right-2 min-w-6 h-6 px-1.5 rounded-full bg-primary text-primary-foreground text-xs leading-6 font-extrabold text-center">
                {line.quantity}
              </span>
            </div>

            {/* Details */}
            <div className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-base md:text-lg font-extrabold truncate">
                {line.product_title}
              </span>
              <span className="text-xs md:text-sm text-muted-foreground truncate">
                {line.variant_label}
              </span>
              {line.production_date && (
                <span className="text-xs font-semibold text-brand-green">
                  Tostado el {line.production_date}
                </span>
              )}
            </div>

            {/* Total line price */}
            <span className="text-base md:text-lg font-extrabold whitespace-nowrap">
              {formatMoneyCop(line.line_total_amount)}
            </span>
          </div>
        ))}
      </div>

      {/* Subtotals & shipping */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-border text-base md:text-lg">
        <div className="flex justify-between gap-3">
          <span>Subtotal</span>
          <span className="font-semibold">{formatMoneyCop(subtotalAmount)}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>Envío</span>
          <span className="font-semibold">{formatMoneyCop(shippingAmount)}</span>
        </div>
      </div>

      {/* Authoritative Total */}
      <div className="relative flex items-end justify-between gap-3 -mx-6 md:-mx-7 px-6 md:px-7 pt-5 border-t-2 border-dashed border-border/80">
        <div className="flex flex-col gap-0.5">
          <span className="text-base md:text-lg font-bold">{totalLabel}</span>
          {totalNote && <span className="text-xs md:text-sm text-muted-foreground">{totalNote}</span>}
        </div>
        <span className="font-sans text-3xl md:text-4xl font-extrabold tracking-tight">
          {formatMoneyCop(totalAmount)}
        </span>
      </div>
    </aside>
  );
}
