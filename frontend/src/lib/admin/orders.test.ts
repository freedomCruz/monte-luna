import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  cancelAdminOrder,
  deliverAdminOrder,
  dispatchAdminOrder,
  getAdminOrder,
  getAdminOrderMetrics,
  isVersionConflict,
  listAdminOrders,
  prepareAdminOrder,
} from './orders';

function json(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function problem(status: number, code: string): Response {
  return new Response(
    JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code }),
    { status, headers: { 'Content-Type': 'application/problem+json' } }
  );
}

const ORDER_ID = '01900000-0000-7000-8000-0000000000a1';

describe('Admin orders client (F1: S1, S8)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function lastCall(): { url: string; init: RequestInit } {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init };
  }

  describe('listAdminOrders', () => {
    it('sends no query string without filters', async () => {
      fetchMock.mockResolvedValue(json(200, { items: [], next_cursor: null, total: 0, pending_dispatch_count: 0 }));
      await listAdminOrders();
      expect(lastCall().url).toBe('/api/v1/admin/orders');
      expect(lastCall().init.method).toBe('GET');
    });

    it('repeats array filters and carries the scalar filters', async () => {
      fetchMock.mockResolvedValue(json(200, { items: [], next_cursor: null, total: 0, pending_dispatch_count: 0 }));
      await listAdminOrders({
        search: 'ORD-7K2',
        status: ['paid', 'preparing'],
        date_filter: 'range',
        from_date: '2026-10-01',
        to_date: '2026-10-20',
        payment_method_type: ['card', 'pse'],
        pending_dispatch: true,
        sort: 'placed_at',
        limit: 50,
        cursor: 'abc',
      });
      const query = new URL(lastCall().url, 'https://x.test').searchParams;
      expect(query.getAll('status')).toEqual(['paid', 'preparing']);
      expect(query.getAll('payment_method_type')).toEqual(['card', 'pse']);
      expect(query.get('search')).toBe('ORD-7K2');
      expect(query.get('date_filter')).toBe('range');
      expect(query.get('from_date')).toBe('2026-10-01');
      expect(query.get('to_date')).toBe('2026-10-20');
      expect(query.get('pending_dispatch')).toBe('true');
      expect(query.get('sort')).toBe('placed_at');
      expect(query.get('limit')).toBe('50');
      expect(query.get('cursor')).toBe('abc');
    });

    it('omits empty arrays and undefined values', async () => {
      fetchMock.mockResolvedValue(json(200, { items: [], next_cursor: null, total: 0, pending_dispatch_count: 0 }));
      await listAdminOrders({ status: [], search: undefined, pending_dispatch: false });
      const query = new URL(lastCall().url, 'https://x.test').searchParams;
      expect(query.has('status')).toBe(false);
      expect(query.has('search')).toBe(false);
      expect(query.get('pending_dispatch')).toBe('false');
    });
  });

  describe('getAdminOrder', () => {
    it('returns the order with its strong ETag verbatim', async () => {
      fetchMock.mockResolvedValue(json(200, { id: ORDER_ID, version: 4 }, { ETag: '"4"' }));
      const result = await getAdminOrder(ORDER_ID);
      expect(lastCall().url).toBe(`/api/v1/admin/orders/${ORDER_ID}`);
      expect(result.ok && result.etag).toBe('"4"');
    });

    it('maps 404 to its problem code', async () => {
      fetchMock.mockResolvedValue(problem(404, 'order_not_found'));
      const result = await getAdminOrder(ORDER_ID);
      expect(result).toMatchObject({ ok: false, status: 404, code: 'order_not_found' });
    });
  });

  describe('getAdminOrderMetrics', () => {
    it('sends the period and the range dates only when given', async () => {
      fetchMock.mockImplementation(async () => json(200, {}));
      await getAdminOrderMetrics({ period: 'range', from_date: '2026-10-01', to_date: '2026-10-20' });
      expect(lastCall().url).toBe('/api/v1/admin/orders/metrics?period=range&from_date=2026-10-01&to_date=2026-10-20');
      await getAdminOrderMetrics();
      expect(lastCall().url).toBe('/api/v1/admin/orders/metrics');
    });
  });

  describe('order actions', () => {
    it.each([
      ['prepareAdminOrder', prepareAdminOrder, 'to-preparing'],
      ['deliverAdminOrder', deliverAdminOrder, 'deliver'],
    ] as const)('%s posts an empty body with If-Match', async (_name, action, segment) => {
      fetchMock.mockResolvedValue(json(200, { id: ORDER_ID, version: 5 }, { ETag: '"5"' }));
      const result = await action(ORDER_ID, '"4"');
      const { url, init } = lastCall();
      expect(url).toBe(`/api/v1/admin/orders/${ORDER_ID}/${segment}`);
      expect(init.method).toBe('POST');
      expect(init.body).toBe('{}');
      expect(init.headers).toMatchObject({ 'If-Match': '"4"', 'Content-Type': 'application/json' });
      expect(result.ok && result.etag).toBe('"5"');
    });

    it('cancelAdminOrder sends the optional reason', async () => {
      fetchMock.mockResolvedValue(json(200, { id: ORDER_ID, version: 5 }, { ETag: '"5"' }));
      await cancelAdminOrder(ORDER_ID, '"4"', { reason: 'Cliente lo pidió' });
      const { url, init } = lastCall();
      expect(url).toBe(`/api/v1/admin/orders/${ORDER_ID}/cancel`);
      expect(JSON.parse(init.body as string)).toEqual({ reason: 'Cliente lo pidió' });
      expect(init.headers).toMatchObject({ 'If-Match': '"4"' });
    });

    it('cancelAdminOrder sends an empty body without a reason', async () => {
      fetchMock.mockResolvedValue(json(200, { id: ORDER_ID, version: 5 }, { ETag: '"5"' }));
      await cancelAdminOrder(ORDER_ID, '"4"');
      expect(lastCall().init.body).toBe('{}');
    });

    it('dispatchAdminOrder posts to the order id with the order ETag and shipment_version', async () => {
      fetchMock.mockResolvedValue(json(200, { id: 's1', version: 2 }, { ETag: '"2"' }));
      const body = { carrier_name: 'Servientrega', shipment_version: null, tracking_number: '123', tracking_url: 'https://t.test/123' };
      const result = await dispatchAdminOrder(ORDER_ID, '"4"', body);
      const { url, init } = lastCall();
      expect(url).toBe(`/api/v1/admin/orders/${ORDER_ID}/dispatch`);
      expect(JSON.parse(init.body as string)).toEqual(body);
      expect(init.headers).toMatchObject({ 'If-Match': '"4"' });
      // The returned ETag quotes the SHIPMENT version, not an order precondition.
      expect(result.ok && result.etag).toBe('"2"');
    });
  });

  describe('412 version_conflict', () => {
    it('is recognised from a failed action', async () => {
      fetchMock.mockResolvedValue(problem(412, 'version_conflict'));
      const result = await prepareAdminOrder(ORDER_ID, '"3"');
      expect(result).toMatchObject({ ok: false, status: 412, code: 'version_conflict' });
      expect(isVersionConflict(result)).toBe(true);
    });

    it('is not raised by other failures or successes', async () => {
      fetchMock.mockResolvedValue(problem(409, 'invalid_order_transition'));
      expect(isVersionConflict(await deliverAdminOrder(ORDER_ID, '"3"'))).toBe(false);
      fetchMock.mockResolvedValue(json(200, {}, { ETag: '"1"' }));
      expect(isVersionConflict(await getAdminOrder(ORDER_ID))).toBe(false);
    });

    it('treats a bare 412 without a problem body as a conflict', async () => {
      fetchMock.mockResolvedValue(new Response('', { status: 412 }));
      expect(isVersionConflict(await cancelAdminOrder(ORDER_ID, '"3"'))).toBe(true);
    });
  });

  it('reports a network failure without throwing', async () => {
    fetchMock.mockRejectedValue(new TypeError('offline'));
    expect(await getAdminOrder(ORDER_ID)).toEqual({ ok: false, code: 'network_error', status: 0 });
  });
});
