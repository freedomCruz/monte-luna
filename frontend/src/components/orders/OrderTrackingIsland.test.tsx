import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OrderTrackingIsland } from './OrderTrackingIsland';
import type { components } from '../../generated/orders';

const mockGuestOrder: components['schemas']['GuestOrder'] = {
  order_number: 'ORD-7K2M9Q4X',
  status: 'pending_payment',
  placed_at: '2026-10-15T15:00:00Z',
  reservation_expires_at: '2026-10-15T15:30:00Z',
  lines: [
    {
      variant_id: '01928374-abcd-7000-8000-000000000001',
      product_slug: 'finca-el-mirador',
      product_title: 'Finca El Mirador',
      variant_label: '500 g · Grano entero',
      sku: 'MTL-MIR-500-GR',
      unit_price_amount: 3800000,
      quantity: 1,
      line_total_amount: 3800000,
      production_date: '2026-10-02',
    },
  ],
  shipping: {
    zone: 'national',
    method: 'standard',
    rate_amount: 950000,
    free_shipping_threshold_amount: 15000000,
    amount_to_free_shipping: 11200000,
  },
  subtotal_amount: 3800000,
  shipping_amount: 950000,
  tax_amount: 0,
  total_amount: 4750000,
  shipping_address: {
    recipient_name: 'María Gómez',
    recipient_phone: '3105550142',
    municipality_code: '41551',
    municipality_name: 'Pitalito',
    department_name: 'Huila',
    address_line1: 'Calle 5 # 12-34',
    address_line2: 'Apto 302',
    delivery_notes: 'Dejar en portería',
  },
  shipment: null,
};

describe('OrderTrackingIsland (S4, S5)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders loading spinner and then displays order data when token is valid', async () => {
    globalThis.fetch = vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('/api/v1/orders/track')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: async () => mockGuestOrder,
        });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });

    render(<OrderTrackingIsland initialToken="tok_valid123" />);

    expect(screen.getByText(/Cargando estado del pedido…/i)).toBeDefined();

    await waitFor(() => {
      expect(screen.getByText('ORD-7K2M9Q4X')).toBeDefined();
      expect(screen.getByText('Estamos confirmando tu pago.')).toBeDefined();
      expect(screen.getByText('Calle 5 # 12-34, Apto 302')).toBeDefined();
      expect(screen.getByText(/Pitalito, Huila/i)).toBeDefined();
      expect(screen.getByText(/Recibe María Gómez · 3105550142/i)).toBeDefined();
      expect(screen.getByText('Finca El Mirador')).toBeDefined();
      expect(screen.getByText('$47.500')).toBeDefined();
      expect(screen.getByText('Tu pedido sigue apartado')).toBeDefined();
    });
  });

  it('renders 404 not found message when token does not exist', async () => {
    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: false,
        status: 404,
        json: async () => ({
          type: 'https://monteluna.co/problems/not-found',
          title: 'Not Found',
          status: 404,
          code: 'order_not_found',
          detail: 'No order matches the provided tracking token.',
        }),
      });
    });

    render(<OrderTrackingIsland initialToken="tok_invalid" />);

    await waitFor(() => {
      expect(screen.getByText('Pedido no encontrado')).toBeDefined();
      expect(
        screen.getByText(/No encontramos ningún pedido asociado a este enlace/i)
      ).toBeDefined();
      expect(screen.getByRole('link', { name: /Ir a la tienda/i })).toBeDefined();
    });
  });

  it('renders error message when no token is present', async () => {
    render(<OrderTrackingIsland initialToken="" />);

    await waitFor(() => {
      expect(screen.getByText('Enlace no válido')).toBeDefined();
      expect(
        screen.getByText(/No se proporcionó un token de seguimiento/i)
      ).toBeDefined();
    });
  });

  it('renders paid status with tracking steps and approved badge', async () => {
    const paidOrder: components['schemas']['GuestOrder'] = {
      ...mockGuestOrder,
      status: 'paid',
    };

    globalThis.fetch = vi.fn().mockImplementation(() => {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => paidOrder,
      });
    });

    render(<OrderTrackingIsland initialToken="tok_paid" />);

    await waitFor(() => {
      expect(screen.getAllByText('¡Gracias! Tu café ya es tuyo.').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Aprobado').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Así va tu pedido').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Pago recibido').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Preparando').length).toBeGreaterThan(0);
    });
  });
});
