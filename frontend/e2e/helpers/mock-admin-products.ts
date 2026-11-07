import type { Page, Route } from '@playwright/test';
import { mockCategories, mockProductPage, mockProductTypes } from '../../src/mocks/admin-products';
import type { AdminProductPage } from '../../src/lib/admin/catalog';

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

/** Intercepts the admin Productos list and taxonomy reads so the screen runs without a backend. */
export async function mockAdminProductsRoutes(page: Page, overrides: { page?: AdminProductPage; fail?: boolean } = {}) {
  const requests: URL[] = [];
  const reply = (route: Route, body: unknown) =>
    route.fulfill({ status: 200, contentType: 'application/json', headers: JSON_HEADERS, body: JSON.stringify(body) });

  await page.route('**/api/v1/admin/catalog/product-types**', (route) => reply(route, mockProductTypes));
  await page.route('**/api/v1/admin/catalog/categories**', (route) => reply(route, mockCategories));
  await page.route('**/api/v1/admin/products**', (route) => {
    requests.push(new URL(route.request().url()));
    if (overrides.fail) {
      return route.fulfill({
        status: 500,
        contentType: 'application/problem+json',
        headers: JSON_HEADERS,
        body: JSON.stringify({ type: 'https://monteluna.co/problems/internal_error', title: 'internal_error', status: 500, code: 'internal_error' }),
      });
    }
    return reply(route, overrides.page ?? mockProductPage);
  });
  return { requests };
}
