import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  startPayment,
  verifyPayment,
  loadWompiWidgetScript,
  openWompiWidget,
  WOMPI_WIDGET_SCRIPT_URL,
} from './client';
import type { PaymentCheckout } from './client';

describe('Payments client (S1, S3, S7)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
    document.querySelectorAll(`script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`).forEach((s) => s.remove());
    delete (window as any).WidgetCheckout;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    document.querySelectorAll(`script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`).forEach((s) => s.remove());
    delete (window as any).WidgetCheckout;
  });

  const mockCheckout: PaymentCheckout = {
    public_key: 'pub_test_123',
    currency: 'COP',
    amount_in_cents: 6890000,
    reference: 'REF-123456',
    integrity_signature: 'abc123integritysignaturehex',
    expires_at: '2026-10-16T15:30:00Z',
    redirect_url: 'http://localhost:4321/pedido?token=tok_test123',
  };

  describe('startPayment', () => {
    it('calls POST /api/v1/payments with tracking_token and Idempotency-Key', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => mockCheckout,
      });

      const res = await startPayment('tok_test123', 'idem-uuid-1');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.checkout).toEqual(mockCheckout);
      }

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/payments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/problem+json',
          'Idempotency-Key': 'idem-uuid-1',
        },
        body: JSON.stringify({ tracking_token: 'tok_test123' }),
      });
    });

    it('returns problem code when startPayment returns error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({
          type: 'https://monteluna.co/problems/order-not-payable',
          title: 'Conflict',
          status: 409,
          code: 'order_not_payable',
          detail: 'Order reservation expired',
        }),
      });

      const res = await startPayment('tok_test123', 'idem-uuid-2');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.status).toBe(409);
        expect(res.code).toBe('order_not_payable');
        expect(res.problem?.detail).toBe('Order reservation expired');
      }
    });

    it('handles network failure gracefully', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

      const res = await startPayment('tok_test123', 'idem-uuid-3');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.code).toBe('network_error');
        expect(res.problem?.detail).toBe('Network error');
      }
    });
  });

  describe('verifyPayment', () => {
    it('calls POST /api/v1/payments/verify with tracking_token and transaction_id hint', async () => {
      const mockVerification = {
        payment: {
          latest_attempt_status: 'approved' as const,
          payment_method_type: 'nequi' as const,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => mockVerification,
      });

      const res = await verifyPayment('tok_test123', 'trx_wompi_999');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.verification).toEqual(mockVerification);
      }

      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/problem+json',
        },
        body: JSON.stringify({
          tracking_token: 'tok_test123',
          transaction_id: 'trx_wompi_999',
        }),
      });
    });

    it('sends null transaction_id when hint is null', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ payment: null }),
      });

      const res = await verifyPayment('tok_test123', null);
      expect(res.ok).toBe(true);
      expect(globalThis.fetch).toHaveBeenCalledWith('/api/v1/payments/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, application/problem+json',
        },
        body: JSON.stringify({
          tracking_token: 'tok_test123',
          transaction_id: null,
        }),
      });
    });
  });

  describe('loadWompiWidgetScript and openWompiWidget', () => {
    it('injects script tag only once', async () => {
      expect(document.querySelector(`script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`)).toBeNull();

      const promise = loadWompiWidgetScript();
      const script = document.querySelector(`script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`) as HTMLScriptElement;
      expect(script).not.toBeNull();
      expect(script.src).toBe(WOMPI_WIDGET_SCRIPT_URL);

      // Simulate script load
      (window as any).WidgetCheckout = vi.fn();
      script.dispatchEvent(new Event('load'));

      await promise;

      // Calling loadWompiWidgetScript again does not create a second script tag
      await loadWompiWidgetScript();
      expect(document.querySelectorAll(`script[src="${WOMPI_WIDGET_SCRIPT_URL}"]`).length).toBe(1);
    });

    it('opens WidgetCheckout mapping snake_case fields one to one', () => {
      const openMock = vi.fn();
      const constructorMock = vi.fn(function (this: any, args: any) {
        return { open: openMock };
      });
      (window as any).WidgetCheckout = constructorMock;

      const callback = vi.fn();
      openWompiWidget(mockCheckout, callback);

      expect(constructorMock).toHaveBeenCalledWith({
        currency: 'COP',
        amountInCents: 6890000,
        reference: 'REF-123456',
        publicKey: 'pub_test_123',
        signature: {
          integrity: 'abc123integritysignaturehex',
        },
        expirationTime: '2026-10-16T15:30:00Z',
        redirectUrl: 'http://localhost:4321/pedido?token=tok_test123',
      });
      expect(openMock).toHaveBeenCalledWith(callback);
    });
  });
});
