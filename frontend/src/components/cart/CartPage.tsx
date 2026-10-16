import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  $totalItems,
  $cartItems,
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
import { PurchaseSteps } from '../ui/purchase-steps';
import { OrderLineItem } from '../ui/order-line-item';
import { QuantityStepper } from '../ui/quantity-stepper';

export function CartPage() {
  const totalCount = useStore($totalItems);
  const items = useStore($cartItems);

  const [prices, setPrices] = useState<Map<string, VariantAvailability>>(new Map());
  const [loadingPrices, setLoadingPrices] = useState(false);

  // Fetch live prices on load and when items change
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;

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
  }, [items]);

  const totals = useMemo(() => {
    return computeCartTotals(items, prices);
  }, [items, prices]);

  const countLabel = `${totalCount} ${totalCount === 1 ? 'producto' : 'productos'}`;

  return (
    <div className="w-full">
      {/* Banner / Header Bar with breadcrumb and purchase steps */}
      <div className="bg-[#F8E4AE]">
        <div className="max-w-[1320px] mx-auto px-5 py-8 md:px-12 md:py-10 flex flex-wrap items-end justify-between gap-6 md:gap-16">
          <div className="flex flex-col gap-3">
            <nav
              aria-label="Ruta de navegación"
              className="flex items-center gap-2 text-sm md:text-base font-semibold text-foreground/80"
            >
              <a href="/" className="hover:text-accent transition-colors no-underline text-foreground">
                Inicio
              </a>
              <span aria-hidden="true">/</span>
              <span className="text-foreground">Carrito</span>
            </nav>
            <div className="flex flex-wrap items-center gap-3 md:gap-4">
              <h1 className="m-0 text-4xl md:text-6xl font-extrabold tracking-tight text-foreground leading-none">
                Tu carrito
              </h1>
              <span className="px-3 py-1 md:px-3.5 md:py-1.5 rounded-lg bg-foreground text-primary-foreground text-sm md:text-[17px] font-bold">
                {countLabel}
              </span>
            </div>
          </div>

          <PurchaseSteps currentStep={1} />
        </div>
      </div>

      {items.length > 0 ? (
        <main className="max-w-[1320px] mx-auto px-5 py-6 md:px-12 md:py-12 flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
          {/* Items list */}
          <div className="flex-1 w-full flex flex-col gap-5">
            {items.map((item) => {
              const availability = prices.get(item.variant_id);
              const unitPrice = availability?.price_amount;
              const compareAt = availability?.compare_at_price_amount;
              const isCoffee = item.product_type === 'coffee';

              return (
                <OrderLineItem
                  key={item.variant_id}
                  id={item.variant_id}
                  variant="page"
                  image={item.image_url}
                  title={item.product_name}
                  titleHref={`/productos/${item.product_slug}`}
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
                  originName={item.origin_name}
                  isCoffee={isCoffee}
                  onRemove={() => removeItem(item.variant_id)}
                  controlsSlot={
                    <QuantityStepper
                      size="md"
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

            {/* Informational banners matching M-Carrito */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="flex items-start gap-3.5 p-4 md:p-5 bg-secondary rounded-2xl">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="flex-none text-foreground mt-0.5"
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M12 7v5l3 2" />
                </svg>
                <div className="flex flex-col gap-1">
                  <span className="text-base md:text-[17px] font-extrabold text-foreground">
                    Apartamos tu pedido 30 minutos
                  </span>
                  <p className="m-0 text-xs md:text-sm text-muted-foreground leading-snug">
                    Mientras completas el pago, las unidades quedan reservadas exclusivamente para ti.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3.5 p-4 md:p-5 bg-secondary rounded-2xl">
                <svg
                  width="26"
                  height="26"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  className="flex-none text-foreground mt-0.5"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <path d="M8 21h8M12 17v4" />
                </svg>
                <div className="flex flex-col gap-1">
                  <span className="text-base md:text-[17px] font-extrabold text-foreground">
                    Tueste reciente garantizado
                  </span>
                  <p className="m-0 text-xs md:text-sm text-muted-foreground leading-snug">
                    Despachamos lotes tostados en los últimos días para asegurar su máxima frescura y aroma.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Cart Sidebar: Summary and Checkout CTA */}
          <aside
            aria-labelledby="resumen-pedido-titulo"
            className="w-full lg:w-[420px] shrink-0 p-6 md:p-8 bg-card rounded-[24px] shadow-sm border border-foreground/10 flex flex-col gap-6"
          >
            <h2
              id="resumen-pedido-titulo"
              className="m-0 text-2xl md:text-3xl font-extrabold text-foreground tracking-tight"
            >
              Resumen del pedido
            </h2>

            <div className="flex flex-col gap-4 text-base md:text-lg">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground font-medium">Subtotal estimado</span>
                <span className="font-extrabold text-foreground">
                  {loadingPrices ? '...' : totals.subtotalFormatted}
                </span>
              </div>

              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground font-medium">Envío</span>
                <span className="text-xs md:text-sm font-bold text-brand-green uppercase tracking-wide">
                  Calculado al pagar
                </span>
              </div>

              {totals.hasSavings && (
                <div className="flex items-center justify-between gap-4 p-3 bg-accent/10 rounded-xl">
                  <span className="text-sm md:text-base font-bold text-accent">Ahorras en ofertas</span>
                  <span className="text-sm md:text-base font-extrabold text-accent">
                    -{totals.savingsFormatted}
                  </span>
                </div>
              )}

              <div className="h-px bg-foreground/15 my-1" />

              <div className="flex items-baseline justify-between gap-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-lg md:text-xl font-extrabold text-foreground">
                    Total estimado
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Impuestos incluidos si aplican
                  </span>
                </div>
                <span
                  aria-live="polite"
                  className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-none"
                >
                  {loadingPrices ? '...' : totals.subtotalFormatted}
                </span>
              </div>
            </div>

            <p className="m-0 text-xs md:text-sm leading-snug text-muted-foreground">
              El costo de envío se calculará automáticamente en el paso siguiente según tu municipio de destino.
            </p>

            <a
              href="/checkout"
              className="flex items-center justify-center min-h-[58px] md:min-h-[64px] px-8 rounded-xl bg-accent text-white text-base md:text-[18px] font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors shadow-sm focus-visible:outline-3 focus-visible:outline-foreground"
            >
              Continuar al pago
            </a>

            <div className="flex flex-col items-center gap-2 pt-2 border-t border-foreground/10 text-center">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Pagos 100 % seguros
              </span>
              <span className="text-xs text-muted-foreground">
                Aceptamos tarjetas de crédito, débito, PSE, Nequi y Bancolombia
              </span>
            </div>
          </aside>
        </main>
      ) : (
        /* Empty cart state */
        <main className="max-w-[1320px] mx-auto px-5 py-16 md:py-24 flex flex-col items-center justify-center gap-6 text-center">
          <div className="flex flex-col items-center justify-center w-40 h-40 md:w-48 md:h-48 rounded-full bg-brand-green text-primary-foreground outline-2 outline-dashed outline-brand-yellow -outline-offset-10 -rotate-6 shadow-md">
            <span className="font-condensed text-base md:text-lg font-bold tracking-wider uppercase">
              Todavía
            </span>
            <span className="text-4xl md:text-5xl font-extrabold text-brand-yellow leading-none">
              Vacío
            </span>
            <span className="font-condensed text-base md:text-lg font-bold tracking-wider uppercase">
              sin café
            </span>
          </div>

          <h2 className="m-0 text-3xl md:text-5xl font-extrabold text-foreground leading-tight tracking-tight">
            Tu carrito está vacío
          </h2>

          <p className="m-0 text-lg md:text-xl text-muted-foreground max-w-md leading-normal">
            Aún no has agregado productos. Explora nuestros cafés de especialidad y chocolates de origen colombiano.
          </p>

          <a
            href="/tienda"
            className="inline-flex items-center justify-center min-h-[56px] px-8 rounded-xl bg-accent text-white text-base md:text-[17px] font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors shadow-sm focus-visible:outline-3 focus-visible:outline-foreground"
          >
            Ir a la tienda
          </a>
        </main>
      )}
    </div>
  );
}
