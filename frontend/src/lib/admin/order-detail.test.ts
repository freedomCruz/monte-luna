import { describe, expect, it } from 'vitest';
import { mockPaidOrder } from '../../mocks/admin-orders';
import {
  buildTimeline,
  deliveryRateNote,
  firstName,
  formatPhone,
  headerOrderBadge,
  orderActions,
  paidAgo,
  shippingLineLabel,
  unitsLabel,
} from './order-detail';

const shipping = mockPaidOrder.summary.shipping;

describe('Order detail rules (F3: S4)', () => {
  it.each([
    ['paid', { prepare: true, dispatch: true, deliver: false, cancel: true }],
    ['preparing', { prepare: false, dispatch: true, deliver: false, cancel: true }],
    ['shipped', { prepare: false, dispatch: false, deliver: true, cancel: false }],
    ['pending_payment', { prepare: false, dispatch: false, deliver: false, cancel: false }],
    ['delivered', { prepare: false, dispatch: false, deliver: false, cancel: false }],
    ['cancelled', { prepare: false, dispatch: false, deliver: false, cancel: false }],
    ['expired', { prepare: false, dispatch: false, deliver: false, cancel: false }],
  ] as const)('%s allows %j', (status, expected) => {
    expect(orderActions(status)).toEqual(expected);
  });

  it('shows zone and weight band on the shipping line only when present', () => {
    const full = { ...shipping, zone_name: 'Antioquia', min_weight_grams: 0, max_weight_grams: 1000 };
    expect(shippingLineLabel(full)).toBe('Envío · Antioquia, 0 a 1.000 g');
    expect(shippingLineLabel({ ...full, zone_name: null })).toBe('Envío · 0 a 1.000 g');
    expect(shippingLineLabel({ ...full, min_weight_grams: null, max_weight_grams: null })).toBe('Envío · Antioquia');
    expect(shippingLineLabel({ ...full, max_weight_grams: null, min_weight_grams: 5000 })).toBe('Envío · Antioquia, 5.000 g o más');
    expect(shippingLineLabel({ ...full, zone_name: null, min_weight_grams: null, max_weight_grams: null })).toBe('Envío');
  });

  it('describes the rate and the delivery estimate', () => {
    expect(deliveryRateNote({ ...shipping, rate_name: 'Antioquia', min_weight_grams: 0, max_weight_grams: 1000, estimated_days_min: 2, estimated_days_max: 4 }))
      .toBe('Tarifa Antioquia · 0 a 1.000 g · llega en 2 a 4 días hábiles después del despacho.');
    expect(deliveryRateNote({ ...shipping, rate_name: 'Bogotá', min_weight_grams: null, max_weight_grams: null, estimated_days_min: 1, estimated_days_max: 1 }))
      .toBe('Tarifa Bogotá · llega en 1 día hábil después del despacho.');
  });

  it('labels the header badge: paid orders read "Pagado · por despachar"', () => {
    expect(headerOrderBadge('paid')).toEqual({ label: 'Pagado · por despachar', tone: 'action' });
    expect(headerOrderBadge('shipped')).toEqual({ label: 'Enviado', tone: 'progress' });
  });

  it('formats phones, first names, units and elapsed time', () => {
    expect(formatPhone('3005550187')).toBe('300 555 0187');
    expect(formatPhone('+57 300')).toBe('+57 300');
    expect(firstName('María Fernanda Ruiz')).toBe('María');
    expect(unitsLabel(1)).toBe('1 unidad');
    expect(unitsLabel(3)).toBe('3 unidades');
    const paid = '2026-10-17T15:00:00Z';
    expect(paidAgo(paid, new Date('2026-10-20T15:30:00Z'))).toBe('hace 3 días');
    expect(paidAgo(paid, new Date('2026-10-18T15:30:00Z'))).toBe('hace 1 día');
    expect(paidAgo(paid, new Date('2026-10-17T19:00:00Z'))).toBe('hace 4 horas');
    expect(paidAgo(paid, new Date('2026-10-17T15:20:00Z'))).toBe('hace menos de una hora');
  });
});

describe('Order timeline (F3: S4)', () => {
  it('lists the recorded history and the pending steps still ahead (A-Pedido)', () => {
    const timeline = buildTimeline(mockPaidOrder);
    expect(timeline.map((entry) => [entry.title, entry.state])).toEqual([
      ['Pendiente de pago', 'done'],
      ['Pagado', 'done'],
      ['En preparación', 'pending'],
      ['Enviado', 'pending'],
      ['Entregado', 'pending'],
    ]);
    expect(timeline[0].detail).toBe('20 oct, 9:12 a. m. · Cliente creó el pedido');
    expect(timeline[1].detail).toBe('20 oct, 9:13 a. m. · Sistema (pago aprobado)');
    expect(timeline[2].detail).toBe('Pendiente');
    expect(timeline[3].detail).toBe('Pendiente · al registrar el despacho');
    expect(timeline[4].detail).toBe('Pendiente · lo marca una persona del equipo');
  });

  it('shows the actor and the cancellation reason, with no pending steps after a cancellation', () => {
    const order = {
      ...mockPaidOrder,
      status: 'cancelled' as const,
      status_history: [
        ...mockPaidOrder.status_history,
        { id: 'h3', from_status: 'paid' as const, to_status: 'cancelled' as const, actor_type: 'admin' as const, actor_id: 'a1', note: 'Cliente lo pidió', created_at: '2026-10-21T14:00:00Z' },
      ],
    };
    const timeline = buildTimeline(order);
    expect(timeline.map((entry) => entry.title)).toEqual(['Pendiente de pago', 'Pagado', 'Cancelado']);
    expect(timeline.at(-1)!.detail).toBe('21 oct, 9:00 a. m. · Equipo · Cliente lo pidió');
    expect(timeline.every((entry) => entry.state === 'done')).toBe(true);
  });

  it('marks only the last entry as last', () => {
    const timeline = buildTimeline(mockPaidOrder);
    expect(timeline.map((entry) => entry.last)).toEqual([false, false, false, false, true]);
  });
});
