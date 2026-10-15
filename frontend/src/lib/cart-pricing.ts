import {
  fetchProductAvailabilities,
  type VariantAvailability,
} from './availabilities-client';
import type { CartItem } from './cart-store';
import { formatMoneyCop } from './formatters';

export interface CartTotals {
  subtotalMinor: number;
  regularTotalMinor: number;
  savingsMinor: number;
  hasSavings: boolean;
  subtotalFormatted: string;
  regularTotalFormatted: string;
  savingsFormatted: string;
}

/**
 * Fetches live availability and prices for every distinct product_slug present in cart items.
 * Returns a map of variant_id -> VariantAvailability.
 */
export async function fetchCartAvailabilities(
  items: CartItem[]
): Promise<Map<string, VariantAvailability>> {
  const map = new Map<string, VariantAvailability>();
  if (items.length === 0) return map;

  const distinctSlugs = Array.from(new Set(items.map((i) => i.product_slug).filter(Boolean)));
  if (distinctSlugs.length === 0) return map;

  const page = await fetchProductAvailabilities(distinctSlugs);
  for (const item of page.items) {
    if (Array.isArray(item.variants)) {
      for (const variant of item.variants) {
        map.set(variant.variant_id, variant);
      }
    }
  }

  return map;
}

/**
 * Computes subtotal, regular price total (summing compare_at_price if available, else unit price),
 * and savings for the cart items based on the provided live prices map.
 */
export function computeCartTotals(
  items: CartItem[],
  prices: Map<string, VariantAvailability>
): CartTotals {
  let subtotalMinor = 0;
  let regularTotalMinor = 0;

  for (const item of items) {
    const qty = item.quantity || 0;
    const availability = prices.get(item.variant_id);
    const unitPrice = availability?.price_amount ?? 0;
    const compareAt = availability?.compare_at_price_amount ?? unitPrice;

    subtotalMinor += qty * unitPrice;
    regularTotalMinor += qty * compareAt;
  }

  const savingsMinor = Math.max(0, regularTotalMinor - subtotalMinor);

  return {
    subtotalMinor,
    regularTotalMinor,
    savingsMinor,
    hasSavings: savingsMinor > 0,
    subtotalFormatted: formatMoneyCop(subtotalMinor),
    regularTotalFormatted: formatMoneyCop(regularTotalMinor),
    savingsFormatted: formatMoneyCop(savingsMinor),
  };
}
