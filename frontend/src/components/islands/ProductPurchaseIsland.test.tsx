import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { ProductPurchaseIsland } from './ProductPurchaseIsland';
import type { Variant } from '../../lib/catalog';
import type { ProductAvailabilityPage } from '../../lib/availabilities-client';

describe('ProductPurchaseIsland', () => {
  const originalFetch = globalThis.fetch;

  const mockVariants: Variant[] = [
    {
      id: 'var-250-whole',
      sku: 'MIRADOR-250-WHOLE_BEAN',
      weight_grams: 250,
      options: [
        { key: 'presentation', label: 'Presentación', value: '250_g', display_value: '250 g' },
        { key: 'grind', label: 'Molienda', value: 'whole_bean', display_value: 'Grano entero' },
      ],
    },
    {
      id: 'var-250-fine',
      sku: 'MIRADOR-250-FINE',
      weight_grams: 250,
      options: [
        { key: 'presentation', label: 'Presentación', value: '250_g', display_value: '250 g' },
        { key: 'grind', label: 'Molienda', value: 'fine', display_value: 'Fina' },
      ],
    },
    {
      id: 'var-500-whole',
      sku: 'MIRADOR-500-WHOLE_BEAN',
      weight_grams: 500,
      options: [
        { key: 'presentation', label: 'Presentación', value: '500_g', display_value: '500 g' },
        { key: 'grind', label: 'Molienda', value: 'whole_bean', display_value: 'Grano entero' },
      ],
    },
    {
      id: 'var-500-fine',
      sku: 'MIRADOR-500-FINE',
      weight_grams: 500,
      options: [
        { key: 'presentation', label: 'Presentación', value: '500_g', display_value: '500 g' },
        { key: 'grind', label: 'Molienda', value: 'fine', display_value: 'Fina' },
      ],
    },
  ];

  const mockAvailabilityResponse: ProductAvailabilityPage = {
    items: [
      {
        product_slug: 'finca-el-mirador',
        variants: [
          {
            variant_id: 'var-250-whole',
            price_amount: 3800000,
            compare_at_price_amount: 4500000,
            availability: 'in_stock',
            production_date: '2026-10-02',
          },
          {
            variant_id: 'var-250-fine',
            price_amount: 3800000,
            compare_at_price_amount: null,
            availability: 'in_stock',
            production_date: '2026-10-08',
          },
          {
            variant_id: 'var-500-whole',
            price_amount: 7200000,
            compare_at_price_amount: null,
            availability: 'in_stock',
            production_date: '2026-10-02',
          },
          {
            variant_id: 'var-500-fine',
            price_amount: 7200000,
            compare_at_price_amount: null,
            availability: 'out_of_stock',
            production_date: null,
          },
        ],
      },
    ],
    next_cursor: null,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders loading state initially while live availability is being fetched', () => {
    globalThis.fetch = vi.fn().mockImplementation(() => new Promise(() => {})); // never resolves

    render(
      <ProductPurchaseIsland
        productSlug="finca-el-mirador"
        variants={mockVariants}
      />
    );

    expect(screen.getByText(/Cargando disponibilidad y precio/i)).toBeDefined();
  });

  it('renders price, compare-at price, discount pill, and roast date when in-stock variant is loaded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAvailabilityResponse,
    });

    render(
      <ProductPurchaseIsland
        productSlug="finca-el-mirador"
        variants={mockVariants}
      />
    );

    // Initial variant is 250g / Grano entero
    await waitFor(() => {
      expect(screen.getByText('$38.000')).toBeDefined();
    });

    expect(screen.getByText('$45.000')).toBeDefined();
    expect(screen.getByText(/Ahorras \$7\.000/i)).toBeDefined();
    expect(screen.getByText(/Tostado el 2 oct 2026/i)).toBeDefined();
  });

  it('renders out-of-stock combination with Agotado chip, dashed border, and no purchase suggestion', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAvailabilityResponse,
    });

    render(
      <ProductPurchaseIsland
        productSlug="finca-el-mirador"
        variants={mockVariants}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('$38.000')).toBeDefined();
    });

    // Select 500 g
    const opt500g = screen.getByRole('button', { name: /500 g/i });
    fireEvent.click(opt500g);

    // In 500 g, Fina is out_of_stock: the grind button for Fina should show Agotado
    const fineButton = screen.getByRole('button', { name: /Fina, agotado en esta combinación/i });
    expect(fineButton).toBeDefined();
    expect(fineButton.textContent).toContain('Agotado');

    // Click on the out-of-stock option combination (500g + Fina)
    fireEvent.click(fineButton);

    // Out of stock feedback appears
    expect(screen.getByText(/Sin existencias para 500 g · Fina/i)).toBeDefined();
  });

  it('renders an accessible error state with icon and retry/message when fetch fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ code: 'internal_error', title: 'Internal error' }),
    });

    render(
      <ProductPurchaseIsland
        productSlug="finca-el-mirador"
        variants={mockVariants}
      />
    );

    await waitFor(() => {
      expect(screen.getByText(/No fue posible cargar el precio o disponibilidad/i)).toBeDefined();
    });
  });

  it('never renders an add-to-cart or purchase button (S4 / Gate G2 invariant)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAvailabilityResponse,
    });

    render(
      <ProductPurchaseIsland
        productSlug="finca-el-mirador"
        variants={mockVariants}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('$38.000')).toBeDefined();
    });

    expect(screen.queryByRole('button', { name: /agregar al carrito/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /añadir al carrito/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /comprar/i })).toBeNull();
  });
});
