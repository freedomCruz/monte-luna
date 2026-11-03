import type { Page, Route } from '@playwright/test';
import { mockOrderMetrics, mockOrderPage, mockPaidOrder } from '../../src/mocks/admin-orders';
import type { AdminOrder, AdminOrderMetrics, AdminOrderPage } from '../../src/lib/admin/orders';

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

function problem(status: number, code: string) {
  return {
    status,
    contentType: 'application/problem+json',
    headers: JSON_HEADERS,
    body: JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code }),
  };
}

export interface AdminOrdersMock {
  /** Number of write requests received, by action segment. */
  writes: string[];
}

/**
 * Intercepts the admin orders API so screens run without a backend. Orders are held in
 * memory: writes check `If-Match` against the current version (412 `version_conflict`
 * on mismatch) and bump it, the same contract the real API follows.
 */
export async function mockAdminOrdersRoutes(
  page: Page,
  overrides: { page?: AdminOrderPage; metrics?: AdminOrderMetrics; order?: AdminOrder } = {}
): Promise<AdminOrdersMock> {
  const listPage = overrides.page ?? mockOrderPage;
  const metrics = overrides.metrics ?? mockOrderMetrics;
  let order = overrides.order ?? mockPaidOrder;
  const mock: AdminOrdersMock = { writes: [] };

  await page.route('**/api/v1/admin/orders**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/admin/orders', '');

    if (request.method() === 'GET' && (path === '' || path === '/')) {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: JSON_HEADERS, body: JSON.stringify(listPage) });
    }
    if (request.method() === 'GET' && path === '/metrics') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: JSON_HEADERS, body: JSON.stringify(metrics) });
    }
    const [, id, action] = path.split('/');
    if (id !== order.id) return route.fulfill(problem(404, 'order_not_found'));
    if (request.method() === 'GET') {
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...JSON_HEADERS, ETag: `"${order.version}"` }, body: JSON.stringify(order) });
    }
    mock.writes.push(action);
    if (request.headers()['if-match'] !== `"${order.version}"`) return route.fulfill(problem(412, 'version_conflict'));
    const body = request.postDataJSON() as Record<string, unknown>;
    const now = '2026-10-21T09:00:00Z';
    const move = (to: AdminOrder['status'], note: string | null = null, steps = 1): AdminOrder => ({
      ...order,
      status: to,
      version: order.version + steps,
      status_history: [
        ...order.status_history,
        { id: `01900000-0000-7000-8000-00000000${String(900 + order.status_history.length)}`, from_status: order.status, to_status: to, actor_type: 'admin', actor_id: '01900000-0000-7000-8000-000000000001', note, created_at: now },
      ],
    });
    const transition = (from: AdminOrder['status'][], to: AdminOrder['status'], note: string | null = null) => {
      if (!from.includes(order.status)) return null;
      order = move(to, note);
      return order;
    };
    const ok = (updated: AdminOrder) => route.fulfill({ status: 200, contentType: 'application/json', headers: { ...JSON_HEADERS, ETag: `"${updated.version}"` }, body: JSON.stringify(updated) });
    const conflict = () => route.fulfill(problem(409, 'invalid_order_transition'));

    if (action === 'to-preparing') {
      const updated = transition(['paid'], 'preparing');
      return updated ? ok(updated) : conflict();
    }
    if (action === 'deliver') {
      const updated = transition(['shipped'], 'delivered');
      return updated ? ok(updated) : conflict();
    }
    if (action === 'cancel') {
      const reason = typeof body.reason === 'string' && body.reason.trim() !== '' ? body.reason.trim() : null;
      const updated = transition(['paid', 'preparing'], 'cancelled', reason);
      return updated ? ok(updated) : conflict();
    }
    if (action === 'dispatch') {
      if (order.status !== 'paid' && order.status !== 'preparing') return conflict();
      const carrier = typeof body.carrier_name === 'string' ? body.carrier_name.trim() : '';
      if (carrier === '') return route.fulfill(problem(422, 'validation_failed'));
      const shipment = { ...(order.shipment ?? mockPaidOrder.shipment!), status: 'shipped' as const, carrier_name: carrier, tracking_number: (body.tracking_number as string | null | undefined) ?? null, tracking_url: (body.tracking_url as string | null | undefined) ?? null, shipped_at: now, version: (order.shipment?.version ?? 0) + 1 };
      // The real API projects the order asynchronously; the mock applies it at once.
      order = { ...move('shipped', null, order.status === 'paid' ? 2 : 1), shipment };
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { ...JSON_HEADERS, ETag: `"${shipment.version}"` }, body: JSON.stringify(shipment) });
    }
    return route.fulfill(problem(404, 'order_not_found'));
  });

  return mock;
}
