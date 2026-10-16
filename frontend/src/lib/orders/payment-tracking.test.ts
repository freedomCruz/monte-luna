import { describe, it, expect } from 'vitest';
import { formatPaymentMethodLabel, resolveTrackingViewState } from './payment-tracking';

describe('payment-tracking helpers (Task F2 / Spec S7)', () => {
  describe('formatPaymentMethodLabel', () => {
    it('formats nequi as Pagado con Nequi', () => {
      expect(formatPaymentMethodLabel('nequi')).toBe('Pagado con Nequi');
    });

    it('formats pse as Pagado con PSE', () => {
      expect(formatPaymentMethodLabel('pse')).toBe('Pagado con PSE');
    });

    it('formats card as Pagado con tarjeta', () => {
      expect(formatPaymentMethodLabel('card')).toBe('Pagado con tarjeta');
    });

    it('formats bancolombia_transfer as Pagado con Bancolombia', () => {
      expect(formatPaymentMethodLabel('bancolombia_transfer')).toBe('Pagado con Bancolombia');
    });

    it('returns null when null or undefined (no default fallback to Pagado con Wompi)', () => {
      expect(formatPaymentMethodLabel(null)).toBeNull();
      expect(formatPaymentMethodLabel(undefined)).toBeNull();
    });

    it('returns null for unknown payment methods', () => {
      expect(formatPaymentMethodLabel('unknown_provider' as any)).toBeNull();
      expect(formatPaymentMethodLabel('crypto' as any)).toBeNull();
    });
  });

  describe('resolveTrackingViewState', () => {
    it('returns Pagado for paid, preparing, shipped, delivered statuses regardless of payment', () => {
      expect(resolveTrackingViewState('paid', null)).toBe('Pagado');
      expect(resolveTrackingViewState('preparing', { latest_attempt_status: 'approved', payment_method_type: 'nequi' })).toBe('Pagado');
      expect(resolveTrackingViewState('shipped', null)).toBe('Pagado');
      expect(resolveTrackingViewState('delivered', null)).toBe('Pagado');
    });

    it('returns Vencido for expired orders', () => {
      expect(resolveTrackingViewState('expired', null)).toBe('Vencido');
      expect(resolveTrackingViewState('expired', { latest_attempt_status: 'expired', payment_method_type: null })).toBe('Vencido');
    });

    it('returns Cancelado for cancelled orders (reusing Vencido layout with cancelled copy, S7)', () => {
      expect(resolveTrackingViewState('cancelled', null)).toBe('Cancelado');
      expect(resolveTrackingViewState('cancelled', { latest_attempt_status: 'approved', payment_method_type: 'card' })).toBe('Cancelado');
    });

    it('returns Rechazado for pending_payment when latest attempt is declined or error', () => {
      expect(resolveTrackingViewState('pending_payment', { latest_attempt_status: 'declined', payment_method_type: 'card' })).toBe('Rechazado');
      expect(resolveTrackingViewState('pending_payment', { latest_attempt_status: 'error', payment_method_type: null })).toBe('Rechazado');
    });

    it('returns Confirmando for pending_payment when latest attempt is pending, created, or absent', () => {
      expect(resolveTrackingViewState('pending_payment', null)).toBe('Confirmando');
      expect(resolveTrackingViewState('pending_payment', { latest_attempt_status: 'created', payment_method_type: null })).toBe('Confirmando');
      expect(resolveTrackingViewState('pending_payment', { latest_attempt_status: 'pending', payment_method_type: 'pse' })).toBe('Confirmando');
    });
  });
});
