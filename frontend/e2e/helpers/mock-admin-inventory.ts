import type { Page, Route } from '@playwright/test';
import {
  MOCK_GENERATED_AT,
  filterInventoryVariants,
  mockInventoryVariants,
  mockMovements,
  mockSelectedVariant,
  mockVariantLots,
} from '../../src/mocks/admin-inventory';
import type { AdminInventoryMovement, AdminVariantLot } from '../../src/lib/admin/catalog';

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

export interface AdminInventoryMock {
  /** Variant list reads, in order. */
  listRequests: URL[];
  /** Lot receipts received: variant id, If-Match and the JSON body. */
  receipts: { variantId: string; ifMatch: string | undefined; body: Record<string, unknown> }[];
  /** Makes the product look edited by someone else: the next receipt is 412 `version_conflict`. */
  makeStale: () => void;
}

/**
 * Intercepts the admin inventory API so the screen runs without a backend. The parent
 * product holds a version like the real API: a receipt needs `If-Match` (428 without
 * it), a stale one is 412 `version_conflict`, and an accepted one bumps the version and
 * returns the new ETag. Magic values: lot code `CONFLICTO` is 409 `lot_conflict` and a
 * quantity of 999999999 is 422 `validation_failed` on `quantity`. Only the first
 * variant has lots and movements; the others answer empty pages.
 */
export async function mockAdminInventoryRoutes(page: Page, overrides: { failList?: boolean } = {}): Promise<AdminInventoryMock> {
  let version = 3;
  let lots: AdminVariantLot[] = mockVariantLots;
  let movements: AdminInventoryMovement[] = mockMovements;
  let available = mockSelectedVariant.available_quantity;
  const mock: AdminInventoryMock = {
    listRequests: [],
    receipts: [],
    makeStale: () => { version += 1; },
  };
  const reply = (route: Route, body: unknown, headers: Record<string, string> = {}, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) });
  const problem = (route: Route, status: number, code: string, errors?: { field: string; code: string; message: string }[]) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code, ...(errors ? { errors } : {}) }),
    });
  const current = (variantId: string) => {
    const base = mockInventoryVariants.find((item) => item.variant_id === variantId);
    if (!base) return null;
    return variantId === mockSelectedVariant.variant_id ? { ...base, available_quantity: available, product_version: version } : { ...base, product_version: version };
  };

  await page.route('**/api/v1/admin/inventory/variants**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1/admin/inventory/variants', '');
    const method = request.method();

    if (path === '' || path === '/') {
      mock.listRequests.push(url);
      if (overrides.failList) return problem(route, 500, 'internal_error');
      const items = filterInventoryVariants({
        search: url.searchParams.get('search') ?? undefined,
        product_id: url.searchParams.get('product_id') ?? undefined,
        status: (url.searchParams.get('status') as 'active' | 'archived' | 'all' | null) ?? undefined,
        stock: (url.searchParams.get('stock') as 'all' | 'low_or_empty' | null) ?? undefined,
      }).map((item) => (item.variant_id === mockSelectedVariant.variant_id ? { ...item, available_quantity: available } : item));
      return reply(route, { items, next_cursor: null, total: items.length, generated_at: MOCK_GENERATED_AT });
    }

    const [, id, child] = path.split('/');
    const variant = current(id);
    if (!variant) return problem(route, 404, 'variant_not_found');
    const isSelected = id === mockSelectedVariant.variant_id;

    if (method === 'GET' && child === undefined) return reply(route, variant, { ETag: `"${version}"` });
    if (method === 'GET' && child === 'lots') {
      const items = isSelected ? lots : [];
      return reply(route, { items, next_cursor: null, total: items.length, generated_at: MOCK_GENERATED_AT });
    }
    if (method === 'GET' && child === 'movements') {
      const items = isSelected ? movements : [];
      return reply(route, { items, next_cursor: null, total: items.length, generated_at: MOCK_GENERATED_AT });
    }
    if (method === 'POST' && child === 'receive-lot') {
      const ifMatch = request.headers()['if-match'];
      const body = request.postDataJSON() as { lot_code: string; production_date: string; expiration_date?: string; quantity: number; note?: string };
      mock.receipts.push({ variantId: id, ifMatch, body });
      if (ifMatch === undefined) return problem(route, 428, 'precondition_required');
      if (ifMatch !== `"${version}"`) return problem(route, 412, 'version_conflict');
      if (body.lot_code === 'CONFLICTO') return problem(route, 409, 'lot_conflict');
      if (body.quantity === 999_999_999) return problem(route, 422, 'validation_failed', [{ field: 'quantity', code: 'out_of_range', message: 'out of range' }]);

      const lotId = `01900000-0000-7000-8000-00000000059${lots.length}`;
      const lot: AdminVariantLot = { id: lotId, product_id: variant.product_id, lot_code: body.lot_code, production_date: body.production_date, expiration_date: body.expiration_date ?? null, status: 'active', quantity: body.quantity, reserved_quantity: 0, old_roast: false, next_to_allocate: false, version: 1 };
      lots = [...lots, lot];
      movements = [{ id: `01900000-0000-7000-8000-00000000069${movements.length}`, variant_id: id, lot_id: lotId, lot_code: body.lot_code, quantity_delta: body.quantity, reason: 'receipt', display_kind: 'receipt', reference_id: null, order: null, actor_id: '01900000-0000-7000-8000-000000000002', actor_name: 'Andrés Peña', note: body.note ?? null, created_at: '2026-10-20T14:35:00Z' }, ...movements];
      if (isSelected) available += body.quantity;
      version += 1;
      return reply(route, { product_id: variant.product_id, product_version: version, variant_id: id, lot_id: lotId, lot_code: body.lot_code, lot_created: true, movement_id: movements[0].id, reason: 'receipt', quantity_received: body.quantity, quantity_after: body.quantity }, { ETag: `"${version}"` });
    }
    return problem(route, 404, 'not_found');
  });
  return mock;
}
