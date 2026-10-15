import React from 'react';
import type { CartItem } from '../../lib/cart-store';
import type { VariantAvailability } from '../../lib/availabilities-client';
import type { OrderQuote } from '../../lib/orders/client';
import { formatMoneyCop } from '../../lib/formatters';

export interface CheckoutSummaryAsideProps {
  id: string;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  quote: OrderQuote | null;
  quoteError: string | null;
  fallbackSubtotalMinor: number;
  totalLabel: string;
  totalDisplay: string;
}

export function CheckoutSummaryAside({
  id,
  items,
  availabilities,
  quote,
  quoteError,
  fallbackSubtotalMinor,
  totalLabel,
  totalDisplay,
}: CheckoutSummaryAsideProps) {
  return (
    <aside
      aria-labelledby={id}
      className="w-full lg:w-[380px] shrink-0 p-6 md:p-8 bg-card border border-border rounded-2xl flex flex-col gap-5 sticky top-24"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={id} className="text-2xl font-extrabold">
          Tu pedido
        </h2>
        <a
          href="/carrito"
          className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
        >
          Editar
        </a>
      </div>

      {/* Line items list */}
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const availability = availabilities.get(item.variant_id);
          const unitPrice = availability?.price_amount ?? 0;
          const compareAt = availability?.compare_at_price_amount;
          const hasDiscount = Boolean(compareAt && compareAt > unitPrice);

          return (
            <div key={item.variant_id} className="flex items-center gap-3.5">
              <div className="relative shrink-0 w-16 h-16 rounded-xl bg-secondary flex items-center justify-center p-1">
                {item.image_url ? (
                  <img
                    src={item.image_url}
                    alt=""
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <span className="font-condensed font-bold text-xs">Monteluna</span>
                )}
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-extrabold flex items-center justify-center">
                  {item.quantity}
                </span>
              </div>

              <div className="flex-1 min-w-0 flex flex-col">
                <span className="text-base font-extrabold truncate">{item.product_name}</span>
                <span className="text-xs text-muted-foreground">{item.variant_label}</span>
                {availability?.production_date && item.product_type === 'coffee' && (
                  <span className="text-xs font-semibold text-brand-green">
                    Tostado el {availability.production_date}
                  </span>
                )}
              </div>

              <div className="flex flex-col items-end">
                {hasDiscount && (
                  <s aria-label="Precio regular" className="text-xs text-muted-foreground">
                    {formatMoneyCop(compareAt! * item.quantity)}
                  </s>
                )}
                <span className="text-base font-extrabold">
                  {formatMoneyCop(unitPrice * item.quantity)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Totals Breakdown */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-border text-base">
        <div className="flex justify-between items-center">
          <span>Subtotal</span>
          <span className="font-semibold">
            {quote ? formatMoneyCop(quote.subtotal_amount) : formatMoneyCop(fallbackSubtotalMinor)}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span>Envío</span>
          <span
            className={`font-semibold ${
              quote?.shipping.is_free_shipping
                ? 'text-success'
                : quote
                  ? 'text-foreground'
                  : quoteError
                    ? 'text-destructive'
                    : 'text-muted-foreground'
            }`}
          >
            {quote?.shipping.is_free_shipping
              ? 'Gratis'
              : quote
                ? formatMoneyCop(quote.shipping_amount)
                : quoteError
                  ? 'Sin cobertura'
                  : 'Elige tu municipio'}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-end pt-4 border-t-2 border-dashed border-dashed">
        <div className="flex flex-col">
          <span className="text-base font-bold">{totalLabel}</span>
          <span className="text-xs text-muted-foreground">Pesos colombianos</span>
        </div>
        <span className="text-3xl font-extrabold text-foreground">{totalDisplay}</span>
      </div>
    </aside>
  );
}
