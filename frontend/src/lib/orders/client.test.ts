import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import { requestOrderQuote, placeOrder, getGuestOrder } from './client';
import type { OrderQuote, PlaceOrderRequest, PlacedOrder, GuestOrder } from './client';

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
      municipality_code: '88564', // Providencia
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('unsupported_destination');
      expect(result.status).toBe(422);
      expect(result.problem?.detail).toContain('No shipping rate');
    }
  });

  it('handles 422 insufficient_stock problem', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/insufficient_stock',
        title: 'Insufficient stock',
        status: 422,
        code: 'insufficient_stock',
        detail: 'One or more items in the cart are out of stock or have insufficient available stock',
      }),
    });

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 50 }],
      municipality_code: '41551',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('insufficient_stock');
    }
  });

  it('handles network error gracefully', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Connection failed'));

    const result = await requestOrderQuote({
      items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 1 }],
      municipality_code: '41551',
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('network_error');
      expect(result.problem?.title).toBe('Error de conexión');
    }
  });
});

describe('Orders client (POST /api/v1/orders - S4)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validPlaceRequest: PlaceOrderRequest = {
    items: [{ variant_id: '01912345-6789-7abc-def0-123456789abc', quantity: 1 }],
    customer: {
      email: 'maria@correo.com',
      full_name: 'María Gómez',
      phone: '3105550142',
    },
    shipping_address: {
      recipient_name: 'María Gómez',
      recipient_phone: '3105550142',
      municipality_code: '41551',
      address_line1: 'Calle 5 # 12-34',
      address_line2: 'Apto 302',
      postal_code: '417030',
      delivery_notes: 'Dejar en portería',
    },
    fiscal_data: null,
    accepts_data_policy: true,
  };

  const validPlacedOrder: PlacedOrder = {
    order_id: '01923456-789a-7bcd-ef01-23456789abcd',
    order_number: 'ORD-7K2M9Q4X',
    status: 'pending_payment',
    total_amount: 47500,
    reservation_expires_at: '2026-10-15T15:30:00Z',
    tracking_token: 'abc123_-xyz456_7890123456789012345678901234',
  };

  it('successfully places an order with idempotency key', async () => {
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: string | undefined;

    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedHeaders = options?.headers;
      capturedBody = options?.body;
      return {
        ok: true,
        status: 201,
        json: async () => validPlacedOrder,
      };
    });

    const idempotencyKey = '01923456-789a-7bcd-ef01-234567890000';
    const result = await placeOrder(validPlaceRequest, idempotencyKey);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.order_number).toBe('ORD-7K2M9Q4X');
      expect(result.order.status).toBe('pending_payment');
      expect(result.order.tracking_token).toBe('abc123_-xyz456_7890123456789012345678901234');
    }

    expect(capturedHeaders).toMatchObject({
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    });
    expect(JSON.parse(capturedBody || '{}')).toEqual(validPlaceRequest);
  });

  it('handles 409 insufficient_stock on order placement', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/insufficient_stock',
        title: 'Insufficient stock',
        status: 409,
        code: 'insufficient_stock',
        detail: 'Stock could not be reserved because inventory was depleted',
      }),
    });

    const result = await placeOrder(validPlaceRequest, 'some-key');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('insufficient_stock');
      expect(result.status).toBe(409);
    }
  });

  it('handles 422 idempotency_key_reused error', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/idempotency_key_reused',
        title: 'Idempotency key reused',
        status: 422,
        code: 'idempotency_key_reused',
        detail: 'The provided Idempotency-Key was already used with a different request payload',
      }),
    });

    const result = await placeOrder(validPlaceRequest, 'reused-key');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('idempotency_key_reused');
      expect(result.status).toBe(422);
    }
  });
});

describe('Orders client (GET /api/v1/orders/track?token=... - S4/S5)', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const validGuestOrder: GuestOrder = {
    order_number: 'ORD-7K2M9Q4X',
    status: 'pending_payment',
    placed_at: '2026-10-15T15:00:00Z',
    reservation_expires_at: '2026-10-15T15:30:00Z',
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
        production_date: '2026-10-02',
      },
    ],
    shipping: {
      rate_name: 'Huila estándar',
      shipping_amount: 9500,
      is_free_shipping: false,
      estimated_days_min: 2,
      estimated_days_max: 4,
    },
    subtotal_amount: 38000,
    shipping_amount: 9500,
    tax_amount: 0,
    total_amount: 47500,
    shipping_address: {
      recipient_name: 'María Gómez',
      recipient_phone: '310 555 0142',
      municipality_code: '41551',
      municipality_name: 'Pitalito',
      department_name: 'Huila',
      address_line1: 'Calle 5 # 12-34',
      address_line2: 'Apto 302',
      delivery_notes: null,
    },
    shipment: null,
  };

  it('successfully fetches guest order by token', async () => {
    let capturedUrl = '';
    globalThis.fetch = vi.fn().mockImplementation(async (url) => {
      capturedUrl = String(url);
      return {
        ok: true,
        status: 200,
        json: async () => validGuestOrder,
      };
    });

    const token = 'abc123_-xyz456_7890123456789012345678901234';
    const result = await getGuestOrder(token);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.order.order_number).toBe('ORD-7K2M9Q4X');
      expect(result.order.status).toBe('pending_payment');
      expect(result.order.shipping_address.municipality_name).toBe('Pitalito');
    }
    expect(capturedUrl).toBe(`/api/v1/orders/track?token=${encodeURIComponent(token)}`);
  });

  it('handles 404 order_not_found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({
        type: 'https://api.monteluna.co/problems/order_not_found',
        title: 'Order not found',
        status: 404,
        code: 'order_not_found',
        detail: 'No order was found matching the provided tracking token',
      }),
    });

    const result = await getGuestOrder('invalid-token');

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe('order_not_found');
      expect(result.status).toBe(404);
    }
  });
});

