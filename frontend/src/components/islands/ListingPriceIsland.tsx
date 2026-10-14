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
          const slots = document.querySelectorAll(`[data-live-price-slot="${slug}"]`);
          if (slots.length === 0) continue;

          const item = productMap.get(slug);

          if (!item || !item.variants || item.variants.length === 0) {
            slots.forEach((slot) => {
              slot.innerHTML = `<span class="text-xs font-medium text-foreground/50 italic">Precio no disponible</span>`;
            });
            continue;
          }

          const inStockVariants = item.variants.filter(
            (v: VariantAvailability) => v.availability === 'in_stock'
          );

          if (inStockVariants.length === 0) {
            // All variants are out of stock
            slots.forEach((slot) => {
              slot.innerHTML = `
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-background border border-destructive/40 text-destructive text-xs font-bold uppercase tracking-wider">
                  <span class="w-2 h-2 rounded-full bg-destructive"></span>
                  Agotado
                </span>
              `;
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

          slots.forEach((slot) => {
            let html = '';
            if (hasMultiplePrices) {
              html = `
                <div class="flex flex-col">
                  <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider leading-none">Desde</span>
                  <span class="text-lg font-black text-foreground leading-tight">${formatMoneyCop(minPrice)}</span>
                </div>
              `;
            } else if (compareAt && compareAt > minPrice) {
              html = `
                <div class="flex items-baseline gap-2">
                  <span class="text-lg font-black text-foreground">${formatMoneyCop(minPrice)}</span>
                  <s class="text-xs font-medium text-muted-foreground" aria-label="Precio anterior: ${formatMoneyCop(compareAt)}">${formatMoneyCop(compareAt)}</s>
                </div>
              `;
            } else {
              html = `<span class="text-lg font-black text-foreground">${formatMoneyCop(minPrice)}</span>`;
            }
            slot.innerHTML = html;
          });
        }
      } catch (_err) {
        if (cancelled) return;
        // On network or API error, gracefully show unobtrusive error status in price slots
        for (const slug of productSlugs) {
          const slots = document.querySelectorAll(`[data-live-price-slot="${slug}"]`);
          slots.forEach((slot) => {
            slot.innerHTML = `<span class="text-xs font-medium text-destructive/70 italic">Precio no disponible</span>`;
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
