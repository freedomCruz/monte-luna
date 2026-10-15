import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { CartPage } from './CartPage';
import { $cart, addItem, clearCart } from '../../lib/cart-store';
import type { ProductAvailabilityPage } from '../../lib/availabilities-client';

describe('CartPage', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearCart();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders empty cart view when there are no items', () => {
    render(<CartPage />);
    expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Ir a la tienda' })).toBeDefined();
  });

  it('renders items, updates totals on live fetch, and handles removals', async () => {
    const mockAvail: ProductAvailabilityPage = {
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
      ],
      next_cursor: null,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockAvail,
    });

    addItem({
      variant_id: 'var-1',
      quantity: 1,
      product_slug: 'finca-el-mirador',
      product_name: 'Finca El Mirador',
      variant_label: '500 g · Grano entero',
      image_url: '/images/packaging-finca-el-mirador.webp',
      origin_slug: 'finca-el-mirador',
      origin_name: 'Finca El Mirador, Huila',
      product_type: 'coffee',
    });

    render(<CartPage />);

    expect(screen.getByText('Finca El Mirador')).toBeDefined();
    expect(screen.getByText('500 g · Grano entero')).toBeDefined();

    await waitFor(() => {
      const priceMatches = screen.getAllByText('$38.000');
      expect(priceMatches.length).toBeGreaterThan(0);
      expect(screen.getByText('Ahorras en ofertas')).toBeDefined();
    });

    // Delete item
    const deleteBtn = screen.getByRole('button', { name: /Quitar Finca El Mirador del carrito/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    });
  });
});
