import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { fetchProductAvailabilities } from './availabilities-client';
import type { ProductAvailabilityPage } from './catalog';

describe('fetchProductAvailabilities', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('fetches a single product slug and returns variant availability data', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-el-mirador',
          variants: [
            {
              variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e6f',
              price_amount: 3800000,
              compare_at_price_amount: 4500000,
              availability: 'in_stock',
              production_date: '2026-10-01',
            },
          ],
        },
      ],
      next_cursor: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    });

    const result = await fetchProductAvailabilities(['finca-el-mirador']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/product-availabilities?product_slug=finca-el-mirador&limit=100',
      {
        headers: { Accept: 'application/json' },
      }
    );
    expect(result.items).toHaveLength(1);
    expect(result.items[0].product_slug).toBe('finca-el-mirador');
    expect(result.items[0].variants[0].price_amount).toBe(3800000);
  });

  it('deduplicates requested product slugs before fetching', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ items: [], next_cursor: null }),
    });

    await fetchProductAvailabilities(['finca-el-mirador', 'chocolate-70', 'finca-el-mirador']);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      '/api/v1/product-availabilities?product_slug=finca-el-mirador&product_slug=chocolate-70&limit=100',
      {
        headers: { Accept: 'application/json' },
      }
    );
  });

  it('returns empty items immediately without network request when slug list is empty', async () => {
    globalThis.fetch = vi.fn();
    const result = await fetchProductAvailabilities([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(result.items).toEqual([]);
  });

  it('follows next_cursor pagination when there are more pages in a batch', async () => {
    const page1: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'prod-1',
          variants: [
            {
              variant_id: 'v1',
              price_amount: 3000000,
              compare_at_price_amount: null,
              availability: 'in_stock',
              production_date: '2026-10-01',
            },
          ],
        },
      ],
      next_cursor: 'cursor-page-2',
    };

    const page2: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'prod-2',
          variants: [
            {
              variant_id: 'v2',
              price_amount: 4000000,
              compare_at_price_amount: null,
              availability: 'out_of_stock',
              production_date: null,
            },
          ],
        },
      ],
      next_cursor: null,
    };

    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page1,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page2,
      });

    const result = await fetchProductAvailabilities(['prod-1', 'prod-2']);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0].product_slug).toBe('prod-1');
    expect(result.items[1].product_slug).toBe('prod-2');
  });

  it('chunks requests exceeding 100 distinct slugs into bounded batches of 100', async () => {
    const slugs = Array.from({ length: 150 }, (_, i) => `product-${i}`);

    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      return {
        ok: true,
        status: 200,
        json: async () => ({ items: [], next_cursor: null }),
      };
    });

    await fetchProductAvailabilities(slugs);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('throws an error with machine code when response is not ok', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({
        code: 'internal_error',
        title: 'Internal Server Error',
        status: 500,
      }),
    });

    await expect(fetchProductAvailabilities(['finca-el-mirador'])).rejects.toThrow(
      'internal_error'
    );
  });
});
