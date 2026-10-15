import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { requestOrderQuote } from './orders-client';
import type { OrderQuote } from './orders-client';

describe('Orders client (POST /api/v1/orders/quote - S3)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validQuote: OrderQuote = {
    lines: [
      {
        variant_id: '01912345-6789-7abc-def0-123456789abc',
        product_slug: 'finca-el-mirador',
        product_title: 'Finca El Mirador',
        variant_label: '500 g / Grano entero',
        sku: 'MTL-MIR-500-GR',
        unit_price_amount: 38000,
        quantity: 1,
        line_total_amount: 38000,
      },
    ],
    shipping: {
      rate_name: 'Huila estándar',
      shipping_amount: 9500,
      is_free_shipping: false,
      estimated_days_min: 3,
      estimated_days_max: 5,
    },
    subtotal_amount: 38000,
    shipping_amount: 9500,
    tax_amount: 0,
    total_amount: 47500,
  };

  it('successfully returns quote on 200 response', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => validQuote,
    });

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 1 }],
      municipality_code: '41551',
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.quote.shipping_amount).toBe(9500);
      expect(result.quote.total_amount).toBe(47500);
      expect(result.quote.shipping.estimated_days_min).toBe(3);
    }
  });

  it('handles 422 unsupported_destination with problem details', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/unsupported_destination',
        title: 'Unsupported destination',
        status: 422,
        code: 'unsupported_destination',
        detail: 'No shipping rate covers the given destination and weight band',
      }),
    });

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 1 }],
      municipality_code: '88001',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unsupported_destination');
      expect(result.status).toBe(422);
    }
  });

  it('handles 409 insufficient_stock', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/insufficient_stock',
        title: 'Insufficient stock',
        status: 409,
        code: 'insufficient_stock',
        detail: 'Requested quantity exceeds available stock',
      }),
    });

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 10 }],
      municipality_code: '11001',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('insufficient_stock');
      expect(result.status).toBe(409);
    }
  });

  it('handles network failure gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 1 }],
      municipality_code: '11001',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network_error');
    }
  });
});
