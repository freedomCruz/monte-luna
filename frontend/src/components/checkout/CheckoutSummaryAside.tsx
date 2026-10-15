import { OrderLineItem } from '../ui/order-line-item';
import type { CartItem } from '../../lib/cart/store';
import type { VariantAvailability } from '../../lib/catalog/availabilities';
import type { OrderQuoteResponse } from '../../lib/orders/client';
import { formatMoneyCop } from '../../lib/shared/formatters';

export interface CheckoutSummaryAsideProps {
  id: string;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  quote: OrderQuoteResponse | null;
  quoteLoading?: boolean;
  quoteError: string | null;
  totalLabel: string;
  totalDisplay: string;
}

export function CheckoutSummaryAside({
  id,
  items,
  availabilities,
  quote,
  quoteLoading,
  quoteError,
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

      {/* Line items list using shared OrderLineItem */}
      <div className="flex flex-col gap-4">
        {items.map((item) => {
          const availability = availabilities.get(item.variant_id);
          const unitPrice = availability?.price_amount ?? null;
          const compareAt = availability?.compare_at_price_amount;

          return (
            <OrderLineItem
              key={item.variant_id}
              image={item.image_url}
              title={item.product_name}
              variantLabel={item.variant_label}
              quantity={item.quantity}
              amountMinor={unitPrice}
              compareAtAmountMinor={compareAt}
              productionDate={availability?.production_date}
              isCoffee={item.product_type === 'coffee'}
            />
          );
        })}
      </div>

      {/* Totals Breakdown */}
      <div className="flex flex-col gap-2.5 pt-4 border-t border-border text-base">
        <div className="flex justify-between items-center">
          <span>Subtotal</span>
          <span className="font-semibold">
            {quote ? (
              formatMoneyCop(quote.subtotal_amount)
            ) : quoteLoading ? (
              <span className="text-muted-foreground text-sm">Calculando…</span>
            ) : (
              <span className="text-muted-foreground text-sm font-normal">Sin cotizar</span>
            )}
          </span>
        </div>
        <div className="flex justify-between items-center">
          <span>Envío</span>
          <span
            className={`font-semibold ${
              quote?.shipping.is_free_shipping
                ? 'text-brand-green'
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
                : quoteLoading
                  ? 'Calculando…'
                  : quoteError
                    ? 'Sin cobertura'
                    : 'Elige tu municipio'}
          </span>
        </div>
      </div>

      <div className="flex justify-between items-end pt-4 border-t-2 border-dashed border-border">
        <div className="flex flex-col">
          <span className="text-base font-bold">{totalLabel}</span>
          <span className="text-xs text-muted-foreground">Pesos colombianos</span>
        </div>
        <span className="text-3xl font-extrabold text-foreground">{totalDisplay}</span>
      </div>

      {/* Reassurance text */}
      <div className="flex items-start gap-3 p-3.5 bg-hero/60 rounded-xl text-xs sm:text-sm text-foreground/90">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 mt-0.5"
        >
          <circle cx="12" cy="12" r="9"></circle>
          <path d="M12 7v5l3 2"></path>
        </svg>
        <span>
          En el siguiente paso creamos tu pedido y lo apartamos{' '}
          <strong className="font-extrabold">30 minutos</strong> mientras pagas.
        </span>
      </div>
    </aside>
  );
}
