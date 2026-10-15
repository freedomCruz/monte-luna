import { useEffect, useState, useMemo } from 'react';
import { useStore } from '@nanostores/react';
import {
  $totalItems,
  $cartItems,
  incrementItem,
  decrementItem,
  removeItem,
} from '../../lib/cart-store';
import {
  fetchCartAvailabilities,
  computeCartTotals,
} from '../../lib/cart-pricing';
import type { VariantAvailability } from '../../lib/availabilities-client';
import { formatMoneyCop, formatRoastDateSpanish } from '../../lib/formatters';

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

          <ol
            aria-label="Pasos de compra"
            className="list-none m-0 p-0 flex-1 max-w-[520px] flex items-center gap-2 md:gap-3 text-sm md:text-[17px] font-bold"
          >
            <li aria-current="step" className="flex items-center gap-2 md:gap-2.5 text-foreground">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-primary-foreground font-condensed text-lg md:text-[22px] font-extrabold">
                1
              </span>
              <span>Carrito</span>
            </li>
            <li aria-hidden="true" className="flex-1 h-0.5 bg-foreground" />
            <li className="flex items-center gap-2 md:gap-2.5 text-muted-foreground">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-muted-foreground bg-card text-muted-foreground font-condensed text-lg md:text-[22px] font-extrabold">
                2
              </span>
              <span className="hidden sm:inline">Datos y envío</span>
              <span className="sm:hidden">Datos</span>
            </li>
            <li aria-hidden="true" className="flex-1 h-0.5 bg-muted-foreground/40" />
            <li className="flex items-center gap-2 md:gap-2.5 text-muted-foreground">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-muted-foreground bg-card text-muted-foreground font-condensed text-lg md:text-[22px] font-extrabold">
                3
              </span>
              <span>Pago</span>
            </li>
          </ol>
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
              const lineTotal = unitPrice ? unitPrice * item.quantity : null;
              const lineCompareTotal = compareAt ? compareAt * item.quantity : null;
              const isCoffee = item.product_type === 'coffee';

              return (
                <article
                  key={item.variant_id}
                  className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-7 mt-8 sm:mt-9 pt-6 pb-6 pr-4 sm:pr-16 pl-28 sm:pl-48 bg-card rounded-[20px] shadow-sm border border-foreground/5 min-h-[170px]"
                >
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      className="absolute left-1 sm:left-3 -top-6 h-40 sm:h-52 object-contain -rotate-6 drop-shadow-md pointer-events-none"
                    />
                  )}

                  <div className="flex flex-col gap-1.5 min-w-0 flex-1">
                    <span className="font-condensed text-sm sm:text-base font-bold tracking-wider uppercase text-brand-green">
                      {isCoffee ? 'Café · Origen' : 'Cacao fino'}
                    </span>
                    <h2 className="m-0 text-xl sm:text-[26px] font-extrabold leading-tight text-foreground truncate">
                      <a
                        href={`/productos/${item.product_slug}`}
                        className="hover:text-accent transition-colors no-underline text-foreground"
                      >
                        {item.product_name}
                      </a>
                    </h2>
                    {item.variant_label && (
                      <span className="text-sm sm:text-[16px] font-medium text-muted-foreground">
                        {item.variant_label}
                      </span>
                    )}

                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {isCoffee && availability?.production_date && (
                        <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs sm:text-sm font-semibold">
                          Tostado el {formatRoastDateSpanish(availability.production_date)}
                        </span>
                      )}
                      {item.origin_slug && (
                        <a
                          href={`/origenes/${item.origin_slug}`}
                          className="text-xs sm:text-sm font-bold uppercase underline decoration-2 underline-offset-4 text-foreground hover:text-accent transition-colors"
                        >
                          De {item.origin_name || item.origin_slug} →
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3">
                    <div className="flex items-baseline gap-2">
                      {lineCompareTotal && (
                        <s
                          aria-label="Precio anterior"
                          className="text-sm sm:text-base font-medium text-muted-foreground"
                        >
                          {formatMoneyCop(lineCompareTotal)}
                        </s>
                      )}
                      <span className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-foreground leading-none">
                        {lineTotal ? formatMoneyCop(lineTotal) : '...'}
                      </span>
                    </div>

                    <div
                      role="group"
                      aria-label={`Cantidad de ${item.product_name}`}
                      className="flex items-center h-11 sm:h-12 border-2 border-foreground rounded-xl bg-card"
                    >
                      <button
                        type="button"
                        aria-label="Quitar una unidad"
                        onClick={() => decrementItem(item.variant_id, true)}
                        className="w-11 sm:w-12 h-full border-0 rounded-l-lg bg-transparent text-foreground font-sans text-xl font-bold cursor-pointer hover:bg-secondary/40 transition-colors focus-visible:outline-2 focus-visible:outline-foreground"
                      >
                        −
                      </button>
                      <span
                        aria-live="polite"
                        className="min-w-6 text-center text-base sm:text-lg font-extrabold text-foreground"
                      >
                        {item.quantity}
                      </span>
                      <button
                        type="button"
                        aria-label="Agregar una unidad"
                        onClick={() => incrementItem(item.variant_id)}
                        className="w-11 sm:w-12 h-full border-0 rounded-r-lg bg-transparent text-foreground font-sans text-xl font-bold cursor-pointer hover:bg-secondary/40 transition-colors focus-visible:outline-2 focus-visible:outline-foreground"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    aria-label={`Quitar ${item.product_name} del carrito`}
                    onClick={() => removeItem(item.variant_id)}
                    className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-transparent text-muted-foreground hover:text-accent cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
                  >
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
                    >
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
                    </svg>
                  </button>
                </article>
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
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    Al confirmar la compra en el siguiente paso, el inventario queda guardado media hora mientras pagas.
                  </span>
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
                  <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
                  <path d="M10.5 18h3" />
                </svg>
                <div className="flex flex-col gap-1">
                  <span className="text-base md:text-[17px] font-extrabold text-foreground">
                    Guardado en este navegador
                  </span>
                  <span className="text-sm leading-relaxed text-muted-foreground">
                    Tu carrito sigue aquí cuando vuelvas desde este mismo dispositivo.
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Summary Aside */}
          <aside
            aria-labelledby="resumen-h2"
            className="w-full lg:w-[380px] lg:sticky lg:top-28 flex flex-col gap-4 p-6 md:p-7 bg-card rounded-[20px] shadow-sm border border-foreground/10"
          >
            <h2 id="resumen-h2" className="m-0 text-2xl md:text-3xl font-extrabold text-foreground">
              Resumen
            </h2>

            {totals.regularTotalMinor > totals.subtotalMinor && (
              <div className="flex justify-between gap-3 text-base md:text-lg">
                <span className="text-muted-foreground">Precio regular</span>
                <span className="font-semibold text-foreground">
                  {loadingPrices ? '...' : totals.regularTotalFormatted}
                </span>
              </div>
            )}

            {totals.hasSavings && (
              <div className="flex justify-between gap-3 text-base md:text-lg font-bold text-accent">
                <span>Ahorras en ofertas</span>
                <span>−{totals.savingsFormatted}</span>
              </div>
            )}

            <div className="flex items-end justify-between gap-3 pt-4 border-t-2 border-foreground">
              <span className="text-base md:text-lg font-bold text-foreground">
                Subtotal estimado
              </span>
              <span
                aria-live="polite"
                className="text-3xl md:text-4xl font-extrabold tracking-tight text-foreground leading-none"
              >
                {loadingPrices ? '...' : totals.subtotalFormatted}
              </span>
            </div>

            <div className="flex flex-col gap-2 p-3.5 bg-background rounded-xl text-sm">
              <div className="flex justify-between gap-2">
                <span className="font-bold text-foreground">Envío</span>
                <span className="text-muted-foreground">Se calcula con tu municipio</span>
              </div>
            </div>

            <a
              href="/checkout"
              className="flex items-center justify-center min-h-[56px] rounded-xl bg-accent text-white text-base md:text-[17px] font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
            >
              Ir a pagar →
            </a>

            <p className="m-0 text-xs md:text-sm text-center text-muted-foreground leading-snug">
              Compras como invitado, sin crear cuenta. El total con envío se confirma en el siguiente paso.
            </p>

            <div className="flex flex-wrap justify-center gap-1.5 pt-3 border-t border-muted/50">
              <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-semibold">
                Tarjeta
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-semibold">
                PSE
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-semibold">
                Nequi
              </span>
              <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs font-semibold">
                Bancolombia
              </span>
            </div>
          </aside>
        </main>
      ) : (
        /* Empty State */
        <main className="max-w-[1320px] mx-auto px-5 py-16 md:py-24 flex flex-col items-center justify-center gap-6 text-center">
          <div className="flex flex-col items-center justify-center w-40 h-40 rounded-full bg-brand-green text-primary-foreground outline-2 outline-dashed outline-brand-yellow -outline-offset-8 -rotate-6">
            <span className="font-condensed text-sm font-bold tracking-wider uppercase">
              Todavía
            </span>
            <span className="text-4xl font-extrabold text-brand-yellow leading-none">
              Vacío
            </span>
            <span className="font-condensed text-sm font-bold tracking-wider uppercase">
              sin café
            </span>
          </div>

          <h2 className="m-0 text-4xl md:text-5xl font-extrabold text-foreground leading-tight">
            Tu carrito está vacío
          </h2>

          <p className="m-0 text-lg md:text-xl text-muted-foreground max-w-md leading-normal">
            Elige un café de finca o un chocolate oscuro y aparecerá aquí.
          </p>

          <a
            href="/tienda"
            className="inline-flex items-center justify-center min-h-[56px] px-8 rounded-xl bg-accent text-white text-base md:text-lg font-bold uppercase tracking-wide no-underline hover:bg-accent/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
          >
            Ir a la tienda
          </a>
        </main>
      )}
    </div>
  );
}
