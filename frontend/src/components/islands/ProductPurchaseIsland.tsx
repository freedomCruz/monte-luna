import { useEffect, useState, useMemo } from 'react';
import type { Variant, VariantOption } from '../../lib/catalog';
import {
  fetchProductAvailabilities,
  type VariantAvailability,
} from '../../lib/availabilities-client';
import { formatMoneyCop, formatRoastDateSpanish } from '../../lib/formatters';

export interface ProductPurchaseIslandProps {
  productSlug: string;
  variants: Variant[];
}

export function ProductPurchaseIsland({
  productSlug,
  variants,
}: ProductPurchaseIslandProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());

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

  return (
    <div className="flex flex-col gap-6" data-testid="product-purchase-island">
      {/* Live Pricing and Roast Date Display Area */}
      <div className="p-6 rounded-2xl bg-background border border-foreground/10 flex flex-col gap-3 min-h-[120px] justify-center">
        {loading ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-yellow animate-pulse"></span>
              <span className="text-sm font-semibold text-muted-foreground">
                Cargando disponibilidad y precio...
              </span>
            </div>
            <div className="h-4 bg-secondary rounded-md animate-pulse w-48"></div>
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
          <div className="flex flex-col gap-3">
            {/* Price line with savings badge */}
            <div className="flex flex-wrap items-baseline gap-3">
              <span className="text-4xl font-extrabold tracking-tight text-foreground font-sans">
                {formatMoneyCop(currentAvailability.price_amount)}
              </span>
              {currentAvailability.compare_at_price_amount &&
                currentAvailability.compare_at_price_amount > currentAvailability.price_amount && (
                  <>
                    <s
                      aria-label={`Precio anterior: ${formatMoneyCop(
                        currentAvailability.compare_at_price_amount
                      )}`}
                      className="text-lg font-medium text-muted-foreground"
                    >
                      {formatMoneyCop(currentAvailability.compare_at_price_amount)}
                    </s>
                    <span className="px-2.5 py-1 rounded-lg bg-accent text-primary-foreground text-xs font-bold uppercase tracking-wider">
                      Ahorras{' '}
                      {formatMoneyCop(
                        currentAvailability.compare_at_price_amount -
                          currentAvailability.price_amount
                      )}
                    </span>
                  </>
                )}
            </div>

            {/* Roast Date / Lot Production Date */}
            {currentAvailability.production_date && (
              <div className="flex items-center gap-3 p-3 bg-secondary rounded-xl text-sm">
                <svg
                  className="w-5 h-5 text-foreground shrink-0"
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
                <div className="flex flex-col">
                  <span className="font-bold text-foreground">
                    Tostado el {formatRoastDateSpanish(currentAvailability.production_date)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Lote más antiguo con existencias disponibles para este pedido
                  </span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-sm text-muted-foreground italic">
            Combinación no disponible
          </div>
        )}
      </div>

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

      {/* Out of Stock notice & Stock status message */}
      <div className="flex flex-col gap-2 pt-2">
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

      {/* Invariant Gate G2 / S4: NO add-to-cart button rendered in Catalog v1 */}
    </div>
  );
}
