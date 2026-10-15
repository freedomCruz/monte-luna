import { cleanup, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ListingPriceIsland } from './ListingPriceIsland';
import type { ProductAvailabilityPage } from '../../lib/catalog/availabilities';

describe('ListingPriceIsland', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = `
      <article id="product-card-mirador">
        <div data-live-savings-slot="finca-el-mirador"></div>
        <div data-live-price-slot="finca-el-mirador">
          <span class="static-placeholder">Consultando precio...</span>
        </div>
      </article>
      <article id="product-card-maria">
        <div data-live-savings-slot="finca-la-maria"></div>
        <div data-live-price-slot="finca-la-maria">
          <span class="static-placeholder">Consultando precio...</span>
        </div>
      </article>
      <article id="product-card-cacao">
        <div data-live-savings-slot="chocolate-70"></div>
        <div data-live-price-slot="chocolate-70">
          <span class="static-placeholder">Consultando precio...</span>
        </div>
      </article>
    `;
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    document.body.innerHTML = '';
  });

  it('updates product cards with Desde formatted price when multiple variants exist', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-el-mirador',
          variants: [
            {
              variant_id: 'var-1',
              price_amount: 3800000,
              compare_at_price_amount: null,
              availability: 'in_stock',
              production_date: null,
            },
            {
              variant_id: 'var-2',
              price_amount: 7200000,
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['finca-el-mirador']} />);

    await waitFor(() => {
      const slot = document.querySelector('[data-live-price-slot="finca-el-mirador"]');
      expect(slot?.textContent).toContain('Desde');
      expect(slot?.textContent).toContain('$38.000');
    });
  });

  it('updates product card with compare-at price and exact price when single price exists', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'chocolate-70',
          variants: [
            {
              variant_id: 'var-cacao-1',
              price_amount: 2400000,
              compare_at_price_amount: 2800000,
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['chocolate-70']} />);

    await waitFor(() => {
      const slot = document.querySelector('[data-live-price-slot="chocolate-70"]');
      expect(slot?.textContent).toContain('$24.000');
      expect(slot?.textContent).toContain('$28.000');
    });
  });

  it('populates savings badge slot with "Ahorras $X.000" when compare-at is greater than price', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-el-mirador',
          variants: [
            {
              variant_id: 'var-1',
              price_amount: 3800000,
              compare_at_price_amount: 4500000,
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['finca-el-mirador']} />);

    await waitFor(() => {
      const savingsSlot = document.querySelector('[data-live-savings-slot="finca-el-mirador"]');
      expect(savingsSlot?.textContent).toContain('Ahorras $7.000');
      expect(savingsSlot?.firstElementChild).not.toBeNull();
    });
  });

  it('keeps savings badge slot empty when no compare_at price exists or compare_at <= price', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-la-maria',
          variants: [
            {
              variant_id: 'var-1',
              price_amount: 4200000,
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['finca-la-maria']} />);

    await waitFor(() => {
      const priceSlot = document.querySelector('[data-live-price-slot="finca-la-maria"]');
      expect(priceSlot?.textContent).toContain('$42.000');
      const savingsSlot = document.querySelector('[data-live-savings-slot="finca-la-maria"]');
      expect(savingsSlot?.innerHTML).toBe('');
    });
  });

  it('clears or keeps savings badge empty when product is out of stock', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-la-maria',
          variants: [
            {
              variant_id: 'var-1',
              price_amount: 4200000,
              compare_at_price_amount: 5000000,
              availability: 'out_of_stock',
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['finca-la-maria']} />);

    await waitFor(() => {
      const priceSlot = document.querySelector('[data-live-price-slot="finca-la-maria"]');
      expect(priceSlot?.textContent).toContain('Agotado');
      const savingsSlot = document.querySelector('[data-live-savings-slot="finca-la-maria"]');
      expect(savingsSlot?.innerHTML).toBe('');
    });
  });

  it('renders an observable DOM element so Astro client:visible observes a child element', () => {
    const { container } = render(<ListingPriceIsland productSlugs={['finca-el-mirador']} />);
    // Astro's visible directive observes el.children:
    // for (const child of el.children) { io.observe(child); }
    // If the island renders null or no element, el.children is empty and the island never hydrates.
    expect(container.firstElementChild).not.toBeNull();
    expect(container.querySelector('[data-listing-price-island]')).not.toBeNull();
  });

  it('renders Agotado badge when all variants for a product are out_of_stock', async () => {
    const mockResponse: ProductAvailabilityPage = {
      items: [
        {
          product_slug: 'finca-la-maria',
          variants: [
            {
              variant_id: 'var-maria-1',
              price_amount: 4200000,
              compare_at_price_amount: null,
              availability: 'out_of_stock',
              production_date: null,
            },
            {
              variant_id: 'var-maria-2',
              price_amount: 8000000,
              compare_at_price_amount: null,
              availability: 'out_of_stock',
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
      json: async () => mockResponse,
    });

    render(<ListingPriceIsland productSlugs={['finca-la-maria']} />);

    await waitFor(() => {
      const slot = document.querySelector('[data-live-price-slot="finca-la-maria"]');
      expect(slot?.textContent).toContain('Agotado');
    });
  });

  it('renders error indicator if API fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ code: 'internal_error' }),
    });

    render(<ListingPriceIsland productSlugs={['finca-el-mirador']} />);

    await waitFor(() => {
      const slot = document.querySelector('[data-live-price-slot="finca-el-mirador"]');
      expect(slot?.textContent).toContain('Precio no disponible');
    });
  });
});
