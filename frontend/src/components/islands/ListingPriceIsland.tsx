import { useEffect } from 'react';
import {
  fetchProductAvailabilities,
  type ProductAvailability,
  type VariantAvailability,
} from '../../lib/availabilities-client';
import { formatMoneyCop } from '../../lib/formatters';

export interface ListingPriceIslandProps {
  productSlugs: string[];
}

/**
 * Headless listing island mounted once on /tienda with `client:visible`.
 * Queries /api/v1/product-availabilities for all visible product slugs in batches of <= 100,
 * and imperatively hydrates the prerendered card price slots (`data-live-price-slot="<slug>"`).
 *
 * This keeps the DOM lightweight (single island instance rather than one island per card)
 * while preserving valid accessible HTML across multi-category grids.
 */
export function ListingPriceIsland({ productSlugs }: ListingPriceIslandProps) {
  useEffect(() => {
    let cancelled = false;

    async function loadPrices() {
      try {
        const page = await fetchProductAvailabilities(productSlugs);
        if (cancelled) return;

        // Group availability items by product_slug
        const productMap = new Map<string, ProductAvailability>();
        for (const item of page.items) {
          productMap.set(item.product_slug, item);
        }

        for (const slug of productSlugs) {
          const priceSlots = document.querySelectorAll(`[data-live-price-slot="${slug}"]`);
          const savingsSlots = document.querySelectorAll(`[data-live-savings-slot="${slug}"]`);

          const item = productMap.get(slug);

          if (!item || !item.variants || item.variants.length === 0) {
            priceSlots.forEach((slot) => {
              slot.innerHTML = `<span class="text-xs font-medium text-foreground/50 italic">Precio no disponible</span>`;
            });
            savingsSlots.forEach((slot) => {
              slot.innerHTML = '';
            });
            continue;
          }

          const inStockVariants = item.variants.filter(
            (v: VariantAvailability) => v.availability === 'in_stock'
          );

          if (inStockVariants.length === 0) {
            // All variants are out of stock
            priceSlots.forEach((slot) => {
              slot.innerHTML = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-destructive/40 text-destructive text-xs font-bold uppercase tracking-wider">
                  <span class="w-2 h-2 rounded-full bg-destructive"></span>
                  Agotado
                </span>
              `;
            });
            savingsSlots.forEach((slot) => {
              slot.innerHTML = '';
            });
            continue;
          }

          // Calculate lowest available price
          const prices = inStockVariants.map((v: VariantAvailability) => v.price_amount);
          const minPrice = Math.min(...prices);
          const matchingVariant = inStockVariants.find(
            (v: VariantAvailability) => v.price_amount === minPrice
          );
          const compareAt = matchingVariant?.compare_at_price_amount;

          // Check if there are distinct variant prices
          const hasMultiplePrices = new Set(prices).size > 1;

          priceSlots.forEach((slot) => {
            let html = '';
            if (hasMultiplePrices) {
              html = `
                <div class="flex items-baseline gap-1.5">
                  <span class="text-xs font-bold text-primary-foreground/75 uppercase tracking-wider">Desde</span>
                  <span class="text-base font-extrabold text-primary-foreground leading-none">${formatMoneyCop(minPrice)}</span>
                </div>
              `;
            } else if (compareAt && compareAt > minPrice) {
              html = `
                <div class="flex items-baseline gap-2">
                  <span class="text-base font-extrabold text-primary-foreground leading-none">${formatMoneyCop(minPrice)}</span>
                  <s class="text-xs font-medium text-primary-foreground/70" aria-label="Precio anterior: ${formatMoneyCop(compareAt)}">${formatMoneyCop(compareAt)}</s>
                </div>
              `;
            } else {
              html = `<span class="text-base font-extrabold text-primary-foreground leading-none">${formatMoneyCop(minPrice)}</span>`;
            }
            slot.innerHTML = html;
          });

          // Live savings pill for matching variant: "Ahorras $X.000"
          if (compareAt && compareAt > minPrice) {
            const savingsAmount = compareAt - minPrice;
            const savingsText = `Ahorras ${formatMoneyCop(savingsAmount)}`;
            savingsSlots.forEach((slot) => {
              slot.innerHTML = `
                <span class="px-2.5 sm:px-3 py-1 rounded-lg bg-accent text-white text-xs sm:text-sm font-bold tracking-wide shadow-sm">
                  ${savingsText}
                </span>
              `;
            });
          } else {
            savingsSlots.forEach((slot) => {
              slot.innerHTML = '';
            });
          }
        }
      } catch (_err) {
        if (cancelled) return;
        // On network or API error, gracefully show unobtrusive error status in price slots
        for (const slug of productSlugs) {
          const priceSlots = document.querySelectorAll(`[data-live-price-slot="${slug}"]`);
          priceSlots.forEach((slot) => {
            slot.innerHTML = `<span class="text-xs font-medium text-destructive/70 italic">Precio no disponible</span>`;
          });
          const savingsSlots = document.querySelectorAll(`[data-live-savings-slot="${slug}"]`);
          savingsSlots.forEach((slot) => {
            slot.innerHTML = '';
          });
        }
      }
    }

    loadPrices();

    return () => {
      cancelled = true;
    };
  }, [productSlugs]);

  // Render a real wrapper element with an observable child node
  // so Astro's client:visible IntersectionObserver (`for (const child of el.children) io.observe(child)`)
  // can reliably observe it and trigger hydration.
  return (
    <div
      data-listing-price-island
      aria-hidden="true"
      style={{ display: 'contents' }}
    >
      <span style={{ display: 'none' }} />
    </div>
  );
}
