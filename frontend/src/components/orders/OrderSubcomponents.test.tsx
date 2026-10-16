import React from 'react';
import { render, screen, cleanup, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OrderCountdownTimer } from './OrderCountdownTimer';
import { OrderTrackingHero } from './OrderTrackingHero';
import { OrderTrackingStepsSection } from './OrderTrackingStepsSection';
import { OrderDeliveryCard } from './OrderDeliveryCard';
import { OrderSummaryAside } from './OrderSummaryAside';
import { computeOrderTrackingSteps } from '../../lib/orders/tracking';
import type { components } from '../../generated/orders';

const mockOrder: components['schemas']['GuestOrder'] = {
  order_number: 'ORD-TEST1234',
  status: 'pending_payment',
  placed_at: '2026-10-15T10:00:00Z',
  reservation_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
  lines: [
    {
      variant_id: 'var-1',
      product_slug: 'finca-el-mirador',
      product_title: 'Finca El Mirador',
      variant_label: '500 g · Grano entero',
      sku: 'MTL-MIR-500',
      unit_price_amount: 3800000,
      quantity: 2,
      line_total_amount: 7600000,
      production_date: '2026-10-01',
    },
  ],
  shipping: {
    zone: 'national',
    method: 'standard',
    rate_amount: 950000,
  },
  subtotal_amount: 7600000,
  shipping_amount: 950000,
  tax_amount: 0,
  total_amount: 8550000,
  shipping_address: {
    recipient_name: 'Carlos Mendoza',
    recipient_phone: '3001234567',
    municipality_code: '11001',
    municipality_name: 'Bogotá, D.C.',
    department_name: 'Bogotá, D.C.',
    address_line1: 'Carrera 7 # 71-21',
    address_line2: 'Torre B, Apto 502',
    delivery_notes: 'Tocar timbre',
  },
  shipment: null,
};

describe('Order Subcomponents Unit Tests', () => {
  beforeEach(() => {
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  describe('OrderCountdownTimer', () => {
    it('renders time remaining and triggers onExpire when reaches 0', () => {
      vi.useFakeTimers();
      const expiresAt = new Date(Date.now() + 5000).toISOString();
      const onExpire = vi.fn();

      render(<OrderCountdownTimer expiresAt={expiresAt} onExpire={onExpire} />);

      expect(screen.getByText('Tu pedido sigue apartado')).toBeDefined();
      expect(screen.getByText(/00:05/i)).toBeDefined();

      act(() => {
        vi.advanceTimersByTime(6000);
      });

      expect(screen.getByText(/00:00/i)).toBeDefined();
      expect(onExpire).toHaveBeenCalled();
    });
  });

  describe('OrderTrackingHero', () => {
    it('renders pending status with timer and confirmation text', () => {
      render(<OrderTrackingHero order={mockOrder} />);

      expect(screen.getByText('ORD-TEST1234')).toBeDefined();
      expect(screen.getByText('Estamos confirmando tu pago.')).toBeDefined();
      expect(screen.getByText('En curso')).toBeDefined();
      expect(screen.getByText('Un momento')).toBeDefined();
    });

    it('renders expired status with vencida badge and restart link', () => {
      const expiredOrder = { ...mockOrder, status: 'expired' as const };
      render(<OrderTrackingHero order={expiredOrder} />);

      expect(screen.getByText('Se acabó el tiempo de este pedido.')).toBeDefined();
      expect(screen.getByText('Vencida')).toBeDefined();
      expect(screen.getByText(/Armar el pedido de nuevo/i)).toBeDefined();
    });

    it('renders cancelled status with rejected badge and payment retry link', () => {
      const cancelledOrder = { ...mockOrder, status: 'cancelled' as const };
      render(<OrderTrackingHero order={cancelledOrder} />);

      expect(screen.getByText('El pago no pasó.')).toBeDefined();
      expect(screen.getByText('Rechazado')).toBeDefined();
      expect(screen.getByText(/Intentar el pago de nuevo/i)).toBeDefined();
    });

    it('renders rejected variant when order is pending_payment with declined payment attempt', () => {
      const rejectedPendingOrder: components['schemas']['GuestOrder'] = {
        ...mockOrder,
        status: 'pending_payment',
        payment: {
          latest_attempt_status: 'declined',
          payment_method_type: 'card',
        },
      };
      render(<OrderTrackingHero order={rejectedPendingOrder} />);

      expect(screen.getByText('El pago no pasó.')).toBeDefined();
      expect(screen.getByText('Rechazado')).toBeDefined();
      expect(screen.getByText(/Intentar el pago de nuevo/i)).toBeDefined();
    });
  });

  describe('OrderDeliveryCard', () => {
    it('renders recipient, address, and notes', () => {
      render(
        <OrderDeliveryCard
          shippingAddress={mockOrder.shipping_address}
          status="pending_payment"
          shipment={null}
        />
      );

      expect(screen.getByText('Entrega')).toBeDefined();
      expect(screen.getByText('Carrera 7 # 71-21, Torre B, Apto 502')).toBeDefined();
      expect(screen.getByText(/Bogotá, D.C., Bogotá, D.C./i)).toBeDefined();
      expect(screen.getByText(/Recibe Carlos Mendoza · 3001234567/i)).toBeDefined();
      expect(screen.getByText(/Tocar timbre/i)).toBeDefined();
    });

    it('renders tracking number and carrier when shipped', () => {
      render(
        <OrderDeliveryCard
          shippingAddress={mockOrder.shipping_address}
          status="shipped"
          shipment={{
            carrier_name: 'Coordinadora',
            tracking_number: 'GUIA-998877',
            tracking_url: 'https://coordinadora.com/rastreo?guia=GUIA-998877',
            shipped_at: '2026-10-15T14:00:00Z',
            delivered_at: null,
          }}
        />
      );

      expect(screen.getByText(/GUIA-998877/i)).toBeDefined();
      expect(screen.getByText(/Coordinadora/i)).toBeDefined();
      expect(screen.getByRole('link', { name: /Rastrear envío →/i })).toBeDefined();
    });
  });

  describe('OrderSummaryAside', () => {
    it('renders lines with formatted prices, subtotal, shipping, and total', () => {
      render(
        <OrderSummaryAside
          lines={mockOrder.lines}
          subtotalAmount={mockOrder.subtotal_amount}
          shippingAmount={mockOrder.shipping_amount}
          totalAmount={mockOrder.total_amount}
          status="pending_payment"
        />
      );

      expect(screen.getByText('Resumen')).toBeDefined();
      expect(screen.getByText('Finca El Mirador')).toBeDefined();
      expect(screen.getByText('500 g · Grano entero')).toBeDefined();
      expect(screen.getByText('2')).toBeDefined();
      expect(screen.getByText(/2026-10-01/i)).toBeDefined();
      expect(screen.getAllByText('$76.000').length).toBeGreaterThan(0);
      expect(screen.getByText('$9.500')).toBeDefined();
      expect(screen.getByText('$85.500')).toBeDefined();
    });

    it('renders custom payment method label (e.g. Pagado con Nequi) when paid', () => {
      render(
        <OrderSummaryAside
          lines={mockOrder.lines}
          subtotalAmount={mockOrder.subtotal_amount}
          shippingAmount={mockOrder.shipping_amount}
          totalAmount={mockOrder.total_amount}
          status="paid"
          payment={{
            latest_attempt_status: 'approved',
            payment_method_type: 'nequi',
          }}
        />
      );

      expect(screen.getByText('Total pagado')).toBeDefined();
      expect(screen.getByText('Pagado con Nequi')).toBeDefined();
    });
  });

  describe('computeOrderTrackingSteps', () => {
    it('computes correct step states for shipped status', () => {
      const steps = computeOrderTrackingSteps('shipped');
      expect(steps.length).toBe(4);
      expect(steps[0].marca).toBe('✓'); // Pago recibido
      expect(steps[1].marca).toBe('✓'); // Preparando
      expect(steps[2].actual).toBe(true); // Enviado
      expect(steps[3].actual).toBe(false); // Entregado
    });

    it('returns empty steps for expired or cancelled status', () => {
      expect(computeOrderTrackingSteps('expired')).toEqual([]);
      expect(computeOrderTrackingSteps('cancelled')).toEqual([]);
    });
  });
});
