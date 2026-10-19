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
      const restartLink = screen.getByText(/Armar el pedido de nuevo/i);
      expect(restartLink).toBeDefined();
      expect(restartLink.className).toContain('bg-[#C1272D]');
      expect(restartLink.className).toContain('text-white');
    });

    it('renders cancelled status with Cancelado seal, approved copy, and restart link (S7)', () => {
      const cancelledOrder = { ...mockOrder, status: 'cancelled' as const };
      render(<OrderTrackingHero order={cancelledOrder} />);

      expect(screen.getByText('Tu pago llegó cuando el café ya no estaba disponible.')).toBeDefined();
      expect(
        screen.getByText(
          'Recibimos tu pago después de que se venció la reserva y ya no había inventario. No vamos a despachar este pedido y te devolveremos el dinero completo.'
        )
      ).toBeDefined();
      expect(screen.getAllByText('Pedido').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText('Cancelado')).toBeDefined();
      expect(screen.getByText('Reembolso')).toBeDefined();
      const restartLink = screen.getByText(/Armar el pedido de nuevo/i);
      expect(restartLink).toBeDefined();
      expect(restartLink.className).toContain('bg-[#C1272D]');
      expect(restartLink.className).toContain('text-white');
      expect(screen.getByText(/Ir a la tienda/i)).toBeDefined();
      // Must NOT render Rechazado or payment retry
      expect(screen.queryByText('Rechazado')).toBeNull();
      expect(screen.queryByText(/Intentar el pago de nuevo/i)).toBeNull();
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
      const retryLink = screen.getByText(/Intentar el pago de nuevo/i);
      expect(retryLink).toBeDefined();
      expect(retryLink.className).toContain('bg-[#C1272D]');
      expect(retryLink.className).toContain('text-white');
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

    it('renders no payment method note when paid with null or unknown method (never Pagado con Wompi)', () => {
      const { unmount } = render(
        <OrderSummaryAside
          lines={mockOrder.lines}
          subtotalAmount={mockOrder.subtotal_amount}
          shippingAmount={mockOrder.shipping_amount}
          totalAmount={mockOrder.total_amount}
          status="paid"
          payment={{
            latest_attempt_status: 'approved',
            payment_method_type: null,
          }}
        />
      );

      expect(screen.getByText('Total pagado')).toBeDefined();
      expect(screen.queryByText(/Pagado con/i)).toBeNull();
      unmount();

      render(
        <OrderSummaryAside
          lines={mockOrder.lines}
          subtotalAmount={mockOrder.subtotal_amount}
          shippingAmount={mockOrder.shipping_amount}
          totalAmount={mockOrder.total_amount}
          status="paid"
          payment={{
            latest_attempt_status: 'approved',
            payment_method_type: 'unknown_method' as any,
          }}
        />
      );

      expect(screen.getByText('Total pagado')).toBeDefined();
      expect(screen.queryByText(/Pagado con/i)).toBeNull();
    });

    it('renders Total pagado and refund note for cancelled order (S7)', () => {
      render(
        <OrderSummaryAside
          lines={mockOrder.lines}
          subtotalAmount={mockOrder.subtotal_amount}
          shippingAmount={mockOrder.shipping_amount}
          totalAmount={mockOrder.total_amount}
          status="cancelled"
          payment={{
            latest_attempt_status: 'approved',
            payment_method_type: 'card',
          }}
        />
      );

      expect(screen.getByText('Total pagado')).toBeDefined();
      expect(screen.getByText('Te lo devolvemos completo')).toBeDefined();
    });
  });

  describe('computeOrderTrackingSteps', () => {
    it('computes correct step states and high-contrast styles for shipped status', () => {
      const steps = computeOrderTrackingSteps('shipped');
      expect(steps.length).toBe(4);
      expect(steps[0].marca).toBe('✓'); // Pago recibido (hecho)
      expect(steps[0].bg).toBe('bg-[#1E6B45]');
      expect(steps[0].fg).toBe('text-white');
      expect(steps[0].bc).toBe('border-[#1E6B45]');

      expect(steps[1].marca).toBe('✓'); // Preparando (hecho)
      expect(steps[1].bg).toBe('bg-[#1E6B45]');
      expect(steps[1].fg).toBe('text-white');

      expect(steps[2].actual).toBe(true); // Enviado (actual)
      expect(steps[2].bg).toBe('bg-[#1B1510]');
      expect(steps[2].fg).toBe('text-[#FAF3E3]');
      expect(steps[2].bc).toBe('border-[#1B1510]');

      expect(steps[3].actual).toBe(false); // Entregado (pendiente)
      expect(steps[3].bg).toBe('bg-white');
      expect(steps[3].fg).toBe('text-[#5F554A]');
      expect(steps[3].bc).toBe('border-[#A8997C]');
    });

    it('returns empty steps for expired or cancelled status', () => {
      expect(computeOrderTrackingSteps('expired')).toEqual([]);
      expect(computeOrderTrackingSteps('cancelled')).toEqual([]);
    });
  });
});
