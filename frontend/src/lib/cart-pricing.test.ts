import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchCartAvailabilities, computeCartTotals } from './cart-pricing';
import type { CartItem } from './cart-store';
import type { ProductAvailabilityPage } from './availabilities-client';

describe('cart-pricing', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const item1: CartItem = {
    variant_id: 'var-1',
    quantity: 2,
    product_slug: 'finca-el-mirador',
    product_name: 'Finca El Mirador',
    variant_label: '500 g · Grano entero',
  };

  const item2: CartItem = {
    variant_id: 'var-2',
    quantity: 1,
    product_slug: 'chocolate-65',
    product_name: 'Chocolate 65 %',
    variant_label: '80 g',
  };

  it('fetches availabilities for all distinct product slugs in cart', async () => {
    const mockPage: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-el-mirador',
          variants: [
            {
              variant_id: 'var-1',
              price_amount: 3800000,
              compare_at_price_amount: 4500000,
              availability: 'in_stock',
              production_date: '2026-10-02',
            },
          ],
        },
        {
          product_slug: 'chocolate-65',
          variants: [
            {
              variant_id: 'var-2',
              price_amount: 1400000,
              compare_at_price_amount: null,
              availability: 'in_stock',
              production_date: null,
            },
          ],
        },
      ],
      next_cursor: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockPage,
    });

    const pricesMap = await fetchCartAvailabilities([item1, item2]);
    expect(pricesMap.size).toBe(2);
    expect(pricesMap.get('var-1')?.price_amount).toBe(3800000);
    expect(pricesMap.get('var-2')?.price_amount).toBe(1400000);
  });

  it('returns empty map when items list is empty without calling fetch', async () => {
    const fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    const res = await fetchCartAvailabilities([]);
    expect(res.size).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('computes cart totals accurately based on live prices', () => {
    const pricesMap = new Map([
      [
        'var-1',
        {
          variant_id: 'var-1',
          price_amount: 3800000,
          compare_at_price_amount: 4500000,
          availability: 'in_stock' as const,
          production_date: '2026-10-02',
        },
      ],
      [
        'var-2',
        {
          variant_id: 'var-2',
          price_amount: 1400000,
          compare_at_price_amount: null,
          availability: 'in_stock' as const,
          production_date: null,
        },
      ],
    ]);

    const totals = computeCartTotals([item1, item2], pricesMap);

    // item1: 2 * 3800000 = 7600000, regular: 2 * 4500000 = 9000000
    // item2: 1 * 1400000 = 1400000, regular: 1 * 1400000 = 1400000
    // subtotal = 7600000 + 1400000 = 9000000 ($90.000)
    // regularTotal = 9000000 + 1400000 = 10400000 ($104.000)
    // savings = 10400000 - 9000000 = 1400000 ($14.000)
    expect(totals.subtotalMinor).toBe(9000000);
    expect(totals.regularTotalMinor).toBe(10400000);
    expect(totals.savingsMinor).toBe(1400000);
    expect(totals.hasSavings).toBe(true);
    expect(totals.subtotalFormatted).toBe('$90.000');
    expect(totals.regularTotalFormatted).toBe('$104.000');
    expect(totals.savingsFormatted).toBe('$14.000');
  });
});
