import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { CartPanel } from './CartPanel';
import { $cart, $isCartOpen, addItem, clearCart, openCart, closeCart } from '../../lib/cart-store';
import type { ProductAvailabilityPage } from '../../lib/availabilities-client';

describe('CartPanel', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    clearCart();
    closeCart();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
  });

  it('renders nothing or is hidden when $isCartOpen is false', () => {
    render(<CartPanel />);
    const dialog = screen.queryByRole('dialog');
    expect(dialog).toBeNull();
  });

  it('renders empty cart state when open and no items', () => {
    openCart();
    render(<CartPanel />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeDefined();
    expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    expect(screen.getByText(/Todavía/i)).toBeDefined();
    expect(screen.getByRole('link', { name: /Ir a la tienda/i })).toBeDefined();
  });

  it('closes cart when close button or backdrop is clicked or Escape key is pressed', () => {
    openCart();
    const { rerender } = render(<CartPanel />);
    const closeButtons = screen.getAllByRole('button', { name: 'Cerrar el carrito' });
    expect(closeButtons.length).toBeGreaterThan(0);
    // Click the X button inside panel header
    fireEvent.click(closeButtons[1]!);
    expect($isCartOpen.get()).toBe(false);

    // Reopen and re-render
    openCart();
    rerender(<CartPanel />);
    expect($isCartOpen.get()).toBe(true);

    // Test Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect($isCartOpen.get()).toBe(false);

    // Reopen and re-render
    openCart();
    rerender(<CartPanel />);
    const buttonsAfter = screen.getAllByRole('button', { name: 'Cerrar el carrito' });
    // Test backdrop click
    fireEvent.click(buttonsAfter[0]!);
    expect($isCartOpen.get()).toBe(false);
  });

  it('renders cart lines with live fetched prices and allows quantity modification', async () => {
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

    openCart();
    render(<CartPanel />);

    // Check item name and initial values
    expect(screen.getByText('Finca El Mirador')).toBeDefined();
    expect(screen.getByText('500 g · Grano entero')).toBeDefined();

    await waitFor(() => {
      const priceMatches = screen.getAllByText('$38.000');
      expect(priceMatches.length).toBeGreaterThan(0);
    });

    // Check quantity increment
    const incBtn = screen.getByRole('button', { name: 'Agregar una unidad' });
    fireEvent.click(incBtn);

    await waitFor(() => {
      expect($cart.get()['var-1']?.quantity).toBe(2);
      const updatedMatches = screen.getAllByText('$76.000');
      expect(updatedMatches.length).toBeGreaterThan(0);
    });

    // Check delete item
    const deleteBtn = screen.getByRole('button', { name: /Quitar Finca El Mirador del carrito/i });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect($cart.get()['var-1']).toBeUndefined();
      expect(screen.getByText('Tu carrito está vacío')).toBeDefined();
    });
  });
});
