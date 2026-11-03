import { describe, expect, it } from 'vitest';
import { orderStatusPresentation, paymentMethodLabel, paymentStatusPresentation } from './order-status';

describe('Admin order status presentation (F1: S1, S8)', () => {
  it.each([
    ['pending_payment', 'Pendiente de pago', 'neutral'],
    ['paid', 'Pagado', 'action'],
    ['preparing', 'En preparación', 'progress'],
    ['shipped', 'Enviado', 'progress'],
    ['delivered', 'Entregado', 'done'],
    ['cancelled', 'Cancelado', 'problem'],
    ['expired', 'Vencido', 'neutral'],
  ] as const)('order %s reads %s with the %s tone (A-Pedidos canvas)', (status, label, tone) => {
    expect(orderStatusPresentation(status)).toEqual({ label, tone });
  });

  it.each([
    ['approved', 'Aprobado', 'done'],
    ['pending', 'Pendiente', 'progress'],
    ['declined', 'Rechazado', 'problem'],
    ['voided', 'Anulado', 'neutral'],
    ['error', 'Error', 'problem'],
    ['expired', 'Vencido', 'neutral'],
    ['created', 'Creado', 'neutral'],
    ['duplicate_approved', 'Pago duplicado', 'action'],
  ] as const)('payment %s reads %s with the %s tone', (status, label, tone) => {
    expect(paymentStatusPresentation(status)).toEqual({ label, tone });
  });

  it('tolerates statuses added later by showing them neutrally', () => {
    expect(orderStatusPresentation('refunded' as never)).toEqual({ label: 'refunded', tone: 'neutral' });
    expect(paymentStatusPresentation('chargeback' as never)).toEqual({ label: 'chargeback', tone: 'neutral' });
  });

  it.each([
    ['card', 'Tarjeta'],
    ['pse', 'PSE'],
    ['nequi', 'Nequi'],
    ['bancolombia_transfer', 'Bancolombia'],
    [null, '—'],
  ] as const)('method %s reads %s', (method, label) => {
    expect(paymentMethodLabel(method)).toBe(label);
  });
});
