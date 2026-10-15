import { useEffect, useState, useMemo } from 'react';
import type { Variant, VariantOption } from '../../lib/catalog/catalog';
import {
  fetchProductAvailabilities,
  type VariantAvailability,
} from '../../lib/catalog/availabilities';
import { formatMoneyCop, formatRoastDateSpanish } from '../../lib/shared/formatters';
import { addItem, openCart } from '../../lib/cart/store';
import { QuantityStepper } from '../ui/quantity-stepper';

export interface ProductPurchaseIslandProps {
  productSlug: string;
  variants: Variant[];
  productName?: string;
  productImage?: string;
  productType?: string;
  originSlug?: string;
  originName?: string;
}

export function ProductPurchaseIsland({
  productSlug,
  variants,
  productName,
  productImage,
  productType,
  originSlug,
  originName,
}: ProductPurchaseIslandProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());
  const [quantity, setQuantity] = useState(1);

  // Derive unique option axes (e.g. presentation, grind) from variants
  const optionAxes = useMemo(() => {
    const axesMap = new Map<string, { label: string; values: { value: string; display_value: string }[] }>();

    for (const v of variants) {
      for (const opt of v.options) {
        if (!axesMap.has(opt.key)) {
          axesMap.set(opt.key, {
            label: opt.label || opt.key,
            values: [],
          });
        }
        const axis = axesMap.get(opt.key)!;
        const stringVal = String(opt.value ?? '');
        const stringDisplay = String(opt.display_value ?? stringVal);
        if (!axis.values.some((val) => val.value === stringVal)) {
          axis.values.push({
            value: stringVal,
            display_value: stringDisplay,
          });
        }
      }
    }
    return Array.from(axesMap.entries()).map(([key, axis]) => ({
      key,
      label: axis.label,
      values: axis.values,
    }));
  }, [variants]);

  // Selected values per axis, defaulted to first variant's options
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    const first = variants[0];
    if (first) {
      for (const opt of first.options) {
        initial[opt.key] = String(opt.value ?? '');
      }
    }
    return initial;
  });

  // Fetch live availability on mount (client:load)
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchProductAvailabilities([productSlug]);
        if (cancelled) return;

        const productData = page.items.find((item) => item.product_slug === productSlug);
        const map = new Map<string, VariantAvailability>();
        if (productData && Array.isArray(productData.variants)) {
          for (const va of productData.variants) {
            map.set(va.variant_id, va);
          }
        }
        setAvailabilities(map);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'error_loading_availability';
        setError(msg);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [productSlug]);

  // Find currently selected variant (or undefined if the selected options combination does not exist)
  const currentVariant = useMemo(() => {
    return variants.find((v) => {
      return Object.entries(selectedOptions).every(([key, val]) => {
        const opt = v.options.find((o: VariantOption) => o.key === key);
        return opt ? opt.value === val : false;
      });
    });
  }, [variants, selectedOptions]);

  const currentAvailability = currentVariant
    ? availabilities.get(currentVariant.id)
    : undefined;

  const isCurrentOutOfStock = currentAvailability?.availability === 'out_of_stock';

  // Helper to check if a specific option value combination is out of stock
  const isOptionOutOfStock = (axisKey: string, optValue: string): boolean => {
    const candidateOptions = { ...selectedOptions, [axisKey]: optValue };
    const matchingVariant = variants.find((v) =>
      Object.entries(candidateOptions).every(([key, val]) => {
        const opt = v.options.find((o: VariantOption) => o.key === key);
        return opt ? opt.value === val : false;
      })
    );
    if (!matchingVariant) return false;
    const av = availabilities.get(matchingVariant.id);
    return av?.availability === 'out_of_stock';
  };

  const handleSelectOption = (axisKey: string, optValue: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [axisKey]: optValue,
    }));
  };

  const decrementQuantity = () => {
    setQuantity((prev) => Math.max(1, prev - 1));
  };

  const incrementQuantity = () => {
    setQuantity((prev) => prev + 1);
  };

  const handleAddToCart = () => {
    if (!currentVariant || isCurrentOutOfStock) return;

    const variantLabel = currentVariant.options
      .map((o: VariantOption) => o.display_value || o.value)
      .join(' · ');

    addItem({
      variant_id: currentVariant.id,
      quantity,
      product_slug: productSlug,
      product_name: productName || productSlug,
      variant_label: variantLabel,
      image_url: productImage,
      product_type: productType,
      origin_slug: originSlug,
      origin_name: originName,
    });

    openCart();
  };

  return (
    <div className="flex flex-col gap-6" data-testid="product-purchase-island">
      {/* Live Pricing and Roast Date Display Area */}
      {loading ? (
        <div className="py-4 border-y-2 border-foreground flex items-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-yellow animate-pulse"></span>
          <span className="text-sm font-semibold text-muted-foreground">
            Cargando disponibilidad y precio...
          </span>
        </div>
      ) : error ? (
        <div
          role="alert"
          className="flex items-center gap-3 text-destructive p-3 rounded-xl bg-card border border-destructive/30"
        >
          <svg
            className="w-5 h-5 shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span className="text-sm font-medium">
            No fue posible cargar el precio o disponibilidad. Intenta recargar la página.
          </span>
        </div>
      ) : currentVariant && currentAvailability ? (
        <div className="flex flex-col gap-5">
          {/* Price line with 2px solid foreground borders and savings badge (M-Detalle original) */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3.5 py-5 border-y-2 border-foreground">
            <span className="text-4xl sm:text-[44px] font-extrabold leading-none tracking-tight text-foreground font-sans">
              {formatMoneyCop(currentAvailability.price_amount)}
            </span>
            {currentAvailability.compare_at_price_amount &&
              currentAvailability.compare_at_price_amount > currentAvailability.price_amount && (
                <>
                  <s
                    aria-label={`Precio anterior: ${formatMoneyCop(
                      currentAvailability.compare_at_price_amount
                    )}`}
                    className="text-lg sm:text-xl font-medium text-muted-foreground"
                  >
                    {formatMoneyCop(currentAvailability.compare_at_price_amount)}
                  </s>
                  <span className="px-3 py-1 rounded-lg bg-accent text-white text-sm font-bold">
                    Ahorras{' '}
                    {formatMoneyCop(
                      currentAvailability.compare_at_price_amount -
                        currentAvailability.price_amount
                    )}
                  </span>
                </>
              )}
          </div>

          {/* Roast Date / Production Date in Warm Arena Box */}
          {currentAvailability.production_date && (
            <div className="flex items-center gap-3.5 p-4 bg-secondary rounded-2xl">
              <svg
                className="w-6 h-6 text-foreground shrink-0"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="16" y1="2" x2="16" y2="6"></line>
                <line x1="8" y1="2" x2="8" y2="6"></line>
                <line x1="3" y1="10" x2="21" y2="10"></line>
              </svg>
              <div className="flex flex-col gap-0.5">
                <span className="text-[17px] font-extrabold text-foreground leading-tight">
                  Tostado el {formatRoastDateSpanish(currentAvailability.production_date)}
                </span>
                <span className="text-[15px] text-muted-foreground leading-tight">
                  Lote más antiguo con existencias disponibles para este pedido
                </span>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="py-4 border-y-2 border-foreground text-sm text-muted-foreground italic">
          Combinación no disponible
        </div>
      )}

      {/* Option Matrix / Chips per axis */}
      {optionAxes.map((axis) => {
        const currentVal = selectedOptions[axis.key];
        const currentDisplay = axis.values.find((v) => v.value === currentVal)?.display_value;

        return (
          <fieldset key={axis.key} className="m-0 p-0 border-0 min-w-0 flex flex-col gap-2.5">
            <legend className="p-0 text-sm font-bold text-foreground">
              <span>{axis.label}</span>{' '}
              {currentDisplay && <span className="text-muted-foreground font-normal">· {currentDisplay}</span>}
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {axis.values.map((opt) => {
                const isSelected = opt.value === currentVal;
                const isSoldOut = isOptionOutOfStock(axis.key, opt.value);

                // Monteluna Design System classes for Option Chips (M-Sistema / M-Detalle)
                // Rest: bg-card text-foreground border-2 border-input
                // Selected: bg-brand-green text-primary-foreground border-2 border-brand-green
                // Sold out: bg-secondary text-muted-foreground border-2 border-dashed border-dashed line-through
                // Sold out & selected: bg-secondary text-foreground border-2 border-foreground line-through
                let chipClasses = 'bg-card text-foreground border-2 border-input';

                if (isSoldOut && isSelected) {
                  chipClasses = 'bg-secondary text-foreground border-2 border-foreground';
                } else if (isSoldOut) {
                  chipClasses = 'bg-secondary text-muted-foreground border-2 border-dashed border-dashed';
                } else if (isSelected) {
                  chipClasses = 'bg-brand-green text-primary-foreground border-2 border-brand-green';
                }

                return (
                  <button
                    key={opt.value}
                    type="button"
                    aria-pressed={isSelected}
                    aria-label={
                      isSoldOut
                        ? `${opt.display_value}, agotado en esta combinación`
                        : opt.display_value
                    }
                    onClick={() => handleSelectOption(axis.key, opt.value)}
                    className={`flex flex-col items-center justify-center gap-0.5 h-[54px] px-3 rounded-xl font-bold text-sm cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-foreground ${chipClasses}`}
                  >
                    <span className={isSoldOut ? 'line-through' : ''}>{opt.display_value}</span>
                    {isSoldOut && (
                      <span className="text-[10px] tracking-wider uppercase font-bold text-destructive">
                        Agotado
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        );
      })}

      {/* Quantity & Add to Cart Controls */}
      <div className="flex flex-col gap-3 pt-2">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-3 w-full sm:w-auto">
            <span className="sm:hidden font-bold text-foreground text-base">Cantidad</span>
            <QuantityStepper
              size="lg"
              label="Cantidad"
              decrementLabel="Disminuir cantidad"
              incrementLabel="Aumentar cantidad"
              quantity={quantity}
              min={1}
              onIncrement={incrementQuantity}
              onDecrement={decrementQuantity}
              disabled={isCurrentOutOfStock}
              decrementButtonClassName="rounded-l-xl text-xl sm:text-2xl hover:bg-foreground/5"
              incrementButtonClassName="rounded-r-xl text-xl sm:text-2xl hover:bg-foreground/5"
              valueClassName="text-lg sm:text-xl font-sans"
            />
          </div>

          {/* CTA button (responsive: inline on desktop sm:flex-1, fixed bar on mobile) */}
          <div className="w-full sm:w-auto sm:flex-1 fixed sm:static bottom-0 left-0 right-0 z-30 sm:z-auto p-3 sm:p-0 bg-card sm:bg-transparent border-t-2 sm:border-t-0 border-foreground flex items-center justify-between sm:justify-start gap-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:shadow-none">
            {/* Mobile-only price & stock status display */}
            <div className="sm:hidden flex flex-col gap-0.5 min-w-0">
              <span className="text-xl font-extrabold text-foreground leading-tight tracking-tight">
                {currentAvailability?.price_amount ? formatMoneyCop(currentAvailability.price_amount) : '...'}
              </span>
              <span className={`text-xs font-semibold truncate ${isCurrentOutOfStock ? 'text-destructive' : 'text-success'}`}>
                {isCurrentOutOfStock ? 'Agotado' : 'Disponible'}
              </span>
            </div>

            <button
              type="button"
              disabled={isCurrentOutOfStock || !currentVariant || loading}
              onClick={handleAddToCart}
              className={`flex-1 sm:min-w-[220px] inline-flex items-center justify-center gap-2.5 h-[54px] sm:h-[60px] px-4 sm:px-6 rounded-xl font-sans text-sm sm:text-[17px] font-bold tracking-wide uppercase transition-colors focus-visible:outline-3 focus-visible:outline-foreground ${
                isCurrentOutOfStock || !currentVariant
                  ? 'bg-muted text-muted-foreground border-2 border-muted cursor-not-allowed'
                  : 'bg-foreground text-primary-foreground hover:bg-foreground/90 cursor-pointer shadow-sm hover:shadow'
              }`}
            >
              {!isCurrentOutOfStock && currentVariant && (
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
                  <path d="M5 8h14l-1 12H6L5 8z"></path>
                  <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
                </svg>
              )}
              {isCurrentOutOfStock ? 'Agotado' : !currentVariant ? 'No disponible' : 'Agregar al carrito'}
            </button>
          </div>
        </div>

        {/* Out of Stock notice & Stock status message */}
        <div className="flex flex-col gap-2 pt-1">
          {!currentVariant ? (
            <div
              role="status"
              className="flex items-center gap-2 text-sm font-semibold text-muted-foreground italic"
            >
              <span>Selecciona una combinación disponible de opciones</span>
            </div>
          ) : isCurrentOutOfStock ? (
            <div
              role="status"
              className="flex items-center gap-2 text-sm font-bold text-destructive"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-destructive" aria-hidden="true"></span>
              <span>
                Sin existencias para{' '}
                {currentVariant.options
                  .map((o: VariantOption) => o.display_value || o.value)
                  .join(' · ')}
              </span>
            </div>
          ) : (
            !loading &&
            currentAvailability && (
              <div
                role="status"
                className="flex items-center gap-2 text-sm font-semibold text-success"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-success" aria-hidden="true"></span>
                <span>
                  Disponible en{' '}
                  {currentVariant.options
                    .map((o: VariantOption) => o.display_value || o.value)
                    .join(' · ')}
                </span>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
