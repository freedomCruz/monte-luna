import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import React from 'react';
import { CheckoutIsland } from './CheckoutIsland';
import { clearCart, addItem } from '../../lib/cart/store';

describe('CheckoutIsland Payment Integration (Task F1 / Spec S7)', () => {
  const originalFetch = globalThis.fetch;
  const originalWindowWidgetCheckout = (globalThis as any).WidgetCheckout;

  beforeEach(() => {
    sessionStorage.clear();
    clearCart();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    (globalThis as any).WidgetCheckout = originalWindowWidgetCheckout;
  });

  const mockItem = {
    variant_id: '01912345-6789-7abc-def0-123456789abc',
    product_slug: 'finca-el-mirador',
    product_name: 'Finca El Mirador',
    variant_label: '500 g / Grano entero',
    origin_name: 'Huila',
    quantity: 1,
    product_type: 'coffee' as const,
  };

  const seedPlacedOrder = (expiresAt = new Date(Date.now() + 1800000).toISOString()) => {
    sessionStorage.setItem(
      'monteluna:placed-order',
      JSON.stringify({
        order_id: '01928374-abcd-7000-8000-123456789abc',
        order_number: 'ORD-7K2M9Q4X',
        status: 'pending_payment',
        total_amount: 4750000,
        reservation_expires_at: expiresAt,
        tracking_token: 'tok_abc123def456',
      })
    );
  };

  it('clicking "Pagar" loads Wompi script dynamically, calls startPayment and opens widget', async () => {
    seedPlacedOrder();

    let widgetOpened = false;
    let widgetCallback: any = null;

    // Mock WidgetCheckout constructor
    (globalThis as any).WidgetCheckout = vi.fn().mockImplementation(function (this: any, config: any) {
      this.config = config;
      this.open = vi.fn().mockImplementation((cb: any) => {
        widgetOpened = true;
        widgetCallback = cb;
      });
    });

    globalThis.fetch = vi.fn().mockImplementation((url: string, options?: any) => {
      if (typeof url === 'string' && url.includes('/api/v1/payments') && options?.method === 'POST') {
        // startPayment
        if (!url.includes('/verify')) {
          return Promise.resolve({
            ok: true,
            status: 201,
            json: async () => ({
              public_key: 'pub_test_123',
              currency: 'COP',
              amount_in_cents: 4750000,
              reference: 'ORD-7K2M9Q4X-1',
              integrity_signature: 'sig_integrity_hash',
              expires_at: new Date(Date.now() + 1800000).toISOString(),
              redirect_url: 'http://localhost:4321/pedido?token=tok_abc123def456',
            }),
          });
        }
        // verifyPayment
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => ({
            order_id: '01928374-abcd-7000-8000-123456789abc',
            order_number: 'ORD-7K2M9Q4X',
            status: 'paid',
            status_text: 'Pago aprobado',
            payment: {
              transaction_id: 'wompi_tx_999',
              status: 'APPROVED',
              method: 'nequi',
              method_label: 'Nequi',
              amount_in_cents: 4750000,
              currency: 'COP',
              finalized_at: new Date().toISOString(),
            },
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    expect(screen.getByText('Paso 3 de 3')).toBeDefined();
    const payBtn = screen.getAllByRole('button', { name: /Pagar \$47\.500/i })[0];
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(widgetOpened).toBe(true);
      expect((globalThis as any).WidgetCheckout).toHaveBeenCalled();
    });

    // Simulate widget completion callback
    widgetCallback({
      transaction: {
        id: 'wompi_tx_999',
        status: 'APPROVED',
      },
    });

    await waitFor(() => {
      // Verify payment call was dispatched
      expect(globalThis.fetch).toHaveBeenCalledWith(
        '/api/v1/payments/verify',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            tracking_token: 'tok_abc123def456',
            transaction_id: 'wompi_tx_999',
          }),
        })
      );
    });
  });

  it('displays payment error when startPayment fails (e.g. reservation expired)', async () => {
    seedPlacedOrder();

    (globalThis as any).WidgetCheckout = vi.fn();

    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/payments')) {
        return Promise.resolve({
          ok: false,
          status: 409,
          json: async () => ({
            type: 'https://monteluna.co/problems/reservation_expired',
            title: 'Reserva expirada',
            status: 409,
            code: 'reservation_expired',
            detail: 'El tiempo de reserva de este pedido ha expirado.',
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<CheckoutIsland />);

    const payBtn = screen.getAllByRole('button', { name: /Pagar \$47\.500/i })[0];
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(screen.getByText('El tiempo de reserva de este pedido ha expirado.')).toBeDefined();
    });
  });
});
