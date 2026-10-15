import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  $isCartOpen,
  $totalItems,
  $cartItems,
  closeCart,
  incrementItem,
  decrementItem,
  removeItem,
} from '../../lib/cart/store';
import {
  fetchCartAvailabilities,
  computeCartTotals,
} from '../../lib/cart/pricing';
import type { VariantAvailability } from '../../lib/catalog/availabilities';
import { formatRoastDateSpanish } from '../../lib/shared/formatters';
import { OrderLineItem } from '../ui/order-line-item';
import { QuantityStepper } from '../ui/quantity-stepper';

export function CartPanel() {
  const isOpen = useStore($isCartOpen);
  const totalCount = useStore($totalItems);
  const items = useStore($cartItems);

  const [prices, setPrices] = useState<Map<string, VariantAvailability>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        closeCart();
      }
    }
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Fetch live prices when cart opens or items change
  useEffect(() => {
    let cancelled = false;
    if (!isOpen || items.length === 0) return;

    async function loadPrices() {
      setLoadingPrices(true);
      try {
        const result = await fetchCartAvailabilities(items);
        if (!cancelled) {
          setPrices(result);
        }
      } catch (err) {
        console.error('Failed to load cart prices:', err);
      } finally {
        if (!cancelled) {
          setLoadingPrices(false);
        }
      }
    }

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [isOpen, items]);

  const totals = useMemo(() => {
    return computeCartTotals(items, prices);
  }, [items, prices]);

  if (!isOpen) return null;

  const countLabel = `${totalCount} ${totalCount === 1 ? 'producto' : 'productos'}`;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden font-sans">
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar el carrito"
        onClick={closeCart}
        className="fixed inset-0 w-full h-full p-0 border-0 bg-foreground/60 backdrop-blur-[3px] cursor-pointer transition-opacity"
      />

      {/* Slide-over panel:
          - Desktop (md:): slide from right, w-[500px], right:0, top:0, bottom:0
          - Mobile (<md): bottom-sheet, rounded-t-[24px], h-[780px] max-h-[90vh], bottom:0, inset-x:0
      */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="carrito-titulo"
        className="fixed md:top-0 md:right-0 md:bottom-0 md:left-auto md:w-[500px] md:h-full left-0 right-0 bottom-0 h-[85vh] md:max-h-full max-h-[85vh] rounded-t-[24px] md:rounded-none bg-background shadow-2xl flex flex-col z-10 overflow-hidden"
      >
        {/* Mobile handle indicator */}
        <div className="md:hidden flex flex-col items-center pt-2.5 pb-1 bg-brand-yellow">
          <span
            aria-hidden="true"
            className="w-11 h-1.5 rounded-full bg-foreground/35"
          />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-4 md:px-6 md:py-5 bg-brand-yellow border-b border-foreground/10">
          <div className="flex items-center gap-3">
            <h2
              id="carrito-titulo"
              className="m-0 text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-none"
            >
              Tu carrito
            </h2>
            <span className="px-2.5 py-1 rounded-lg bg-foreground text-primary-foreground text-sm md:text-[15px] font-bold">
              {countLabel}
            </span>
          </div>

          <button
            type="button"
            aria-label="Cerrar el carrito"
            onClick={closeCart}
            className="inline-flex items-center justify-center w-11 h-11 md:w-12 md:h-12 border-0 rounded-xl bg-foreground text-primary-foreground cursor-pointer hover:bg-foreground/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* Content */}
        {items.length > 0 ? (
          <>
            <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-3.5 p-4 md:p-6">
              {items.map((item) => {
                const availability = prices.get(item.variant_id);
                const unitPrice = availability?.price_amount;
                const compareAt = availability?.compare_at_price_amount;
                const isCoffee = item.product_type === 'coffee';

                return (
                  <OrderLineItem
                    key={item.variant_id}
                    id={item.variant_id}
                    variant="panel"
                    image={item.image_url}
                    title={item.product_name}
                    titleHref={`/productos/${item.product_slug}`}
                    onTitleClick={closeCart}
                    variantLabel={item.variant_label}
                    quantity={item.quantity}
                    amountMinor={unitPrice}
                    compareAtAmountMinor={compareAt}
                    productionDate={
                      isCoffee && availability?.production_date
                        ? formatRoastDateSpanish(availability.production_date)
                        : null
                    }
                    originSlug={item.origin_slug}
                    onOriginClick={closeCart}
                    isCoffee={isCoffee}
                    onRemove={() => removeItem(item.variant_id)}
                    controlsSlot={
                      <QuantityStepper
                        size="sm"
                        label={`Cantidad de ${item.product_name}`}
                        quantity={item.quantity}
                        min={1}
                        onIncrement={() => incrementItem(item.variant_id)}
                        onDecrement={() => decrementItem(item.variant_id, true)}
                      />
                    }
                  />
                );
              })}
            </div>

            {/* Panel Footer: Subtotal and Checkout Button */}
            <div className="flex flex-col gap-3 p-4 md:p-6 bg-card border-t-2 border-foreground">
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm md:text-base font-bold text-foreground">
                    Subtotal estimado
                  </span>
                  {totals.hasSavings && (
                    <span className="self-start px-2 py-0.5 md:px-2.5 md:py-1 rounded-lg bg-accent text-white text-xs md:text-sm font-bold">
                      Ahorras {totals.savingsFormatted}
                    </span>
                  )}
                </div>
                <span
                  aria-live="polite"
                  className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-none"
                >
                  {loadingPrices ? '...' : totals.subtotalFormatted}
                </span>
              </div>

              <p className="m-0 text-xs md:text-sm leading-snug text-muted-foreground">
                El envío se calcula con tu municipio en el paso siguiente.
              </p>

              <a
                href="/checkout"
                onClick={closeCart}
                className="flex items-center justify-center min-h-[54px] md:min-h-[58px] rounded-xl bg-accent text-white text-base md:text-[17px] font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
              >
                Ir a pagar
              </a>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <a
                  href="/carrito"
                  onClick={closeCart}
                  className="inline-flex items-center min-h-[40px] text-sm md:text-[15px] font-bold uppercase underline decoration-2 underline-offset-4 text-foreground hover:text-accent transition-colors"
                >
                  Ver carrito completo
                </a>
                <span className="text-xs font-medium text-muted-foreground">
                  Tarjeta · PSE · Nequi · Bancolombia
                </span>
              </div>
            </div>
          </>
        ) : (
          /* Empty cart state */
          <div className="flex-1 flex flex-col items-center justify-center gap-5 p-8 text-center">
            <div className="flex flex-col items-center justify-center w-36 h-36 rounded-full bg-brand-green text-primary-foreground outline-2 outline-dashed outline-brand-yellow -outline-offset-8 -rotate-6">
              <span className="font-condensed text-sm font-bold tracking-wider uppercase">
                Todavía
              </span>
              <span className="text-3xl font-extrabold text-brand-yellow leading-none">
                Vacío
              </span>
              <span className="font-condensed text-sm font-bold tracking-wider uppercase">
                sin café
              </span>
            </div>

            <h3 className="m-0 text-2xl md:text-3xl font-extrabold text-foreground leading-tight">
              Tu carrito está vacío
            </h3>

            <p className="m-0 text-base md:text-lg text-muted-foreground max-w-xs leading-normal">
              Elige un café de finca o un chocolate oscuro y aparecerá aquí.
            </p>

            <a
              href="/tienda"
              onClick={closeCart}
              className="inline-flex items-center justify-center min-h-[52px] px-7 rounded-xl bg-accent text-white text-base font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
            >
              Ir a la tienda
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
