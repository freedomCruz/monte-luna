import type { Page, Route } from '@playwright/test';
import { mockCategories, mockProductDetail, mockProductPage, mockProductTypes } from '../../src/mocks/admin-products';
import type { AdminProduct, AdminProductPage } from '../../src/lib/admin/catalog';

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

export interface AdminProductsMock {
  requests: URL[];
  /** Merge patches received by the product write, in order. */
  patches: { ifMatch: string | undefined; body: unknown }[];
  /** Makes the product look edited by someone else: the next write is 412 `version_conflict`. */
  makeStale: () => void;
}

/**
 * Intercepts the admin Productos list, product detail write and taxonomy reads so the
 * screen runs without a backend. The detail holds a version like the real API: a write
 * whose `If-Match` differs from the current ETag is 412 `version_conflict`.
 */
export async function mockAdminProductsRoutes(page: Page, overrides: { page?: AdminProductPage; fail?: boolean } = {}): Promise<AdminProductsMock> {
  let detail: AdminProduct = mockProductDetail;
  const mock: AdminProductsMock = {
    requests: [],
    patches: [],
    makeStale: () => { detail = { ...detail, version: detail.version + 1 }; },
  };
  const reply = (route: Route, body: unknown, headers: Record<string, string> = {}) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) });
  const problem = (route: Route, status: number, code: string) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code }),
    });

  await page.route('**/api/v1/admin/catalog/product-types**', (route) => reply(route, mockProductTypes));
  await page.route('**/api/v1/admin/catalog/categories**', (route) => reply(route, mockCategories));
  await page.route('**/api/v1/admin/products**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/admin/products', '');
    if (path === '' || path === '/') {
      mock.requests.push(new URL(request.url()));
      if (overrides.fail) return problem(route, 500, 'internal_error');
      return reply(route, overrides.page ?? mockProductPage);
    }
    if (path !== `/${detail.id}`) return problem(route, 404, 'product_not_found');
    if (request.method() === 'GET') return reply(route, detail, { ETag: `"${detail.version}"` });
    const ifMatch = request.headers()['if-match'];
    mock.patches.push({ ifMatch, body: request.postDataJSON() });
    if (ifMatch === undefined) return problem(route, 428, 'precondition_required');
    if (ifMatch !== `"${detail.version}"`) return problem(route, 412, 'version_conflict');
    detail = { ...detail, ...request.postDataJSON(), version: detail.version + 1 };
    return reply(route, detail, { ETag: `"${detail.version}"` });
  });
  return mock;
}
