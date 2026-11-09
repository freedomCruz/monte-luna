import type { Page, Route } from '@playwright/test';
import { mockBrands, mockCategories, mockOrigins, mockProductDetail, mockProductPage, mockProductTypes } from '../../src/mocks/admin-products';
import type { AdminProduct, AdminProductPage } from '../../src/lib/admin/catalog';

const JSON_HEADERS = { 'Cache-Control': 'no-store' };

export interface AdminProductsMock {
  requests: URL[];
  /** Writes received, in order: method, path after /products, If-Match and the JSON body when there is one. */
  writes: { method: string; path: string; ifMatch: string | undefined; body: unknown }[];
  /** Makes the product look edited by someone else: the next write is 412 `version_conflict`. */
  makeStale: () => void;
}

/**
 * Intercepts the admin catalog API so screens run without a backend. The product holds
 * a version like the real API: every write needs `If-Match` (428 without it) and a stale
 * one is 412 `version_conflict`; every accepted write bumps the version and returns the
 * new ETag. Magic values: slug `duplicado` is 409 `slug_conflict`, SKU `DUP` is 409
 * `sku_conflict`, and an upload whose file is named `storage-down.png` is 503
 * `media_unavailable`.
 */
export async function mockAdminProductsRoutes(page: Page, overrides: { page?: AdminProductPage; fail?: boolean } = {}): Promise<AdminProductsMock> {
  let detail: AdminProduct = mockProductDetail;
  const mock: AdminProductsMock = {
    requests: [],
    writes: [],
    makeStale: () => { detail = { ...detail, version: detail.version + 1 }; },
  };
  const reply = (route: Route, body: unknown, headers: Record<string, string> = {}, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { ...JSON_HEADERS, ...headers }, body: JSON.stringify(body) });
  const problem = (route: Route, status: number, code: string) =>
    route.fulfill({
      status,
      contentType: 'application/problem+json',
      headers: JSON_HEADERS,
      body: JSON.stringify({ type: `https://monteluna.co/problems/${code}`, title: code, status, code }),
    });
  const etag = () => ({ ETag: `"${detail.version}"` });

  await page.route('**/api/v1/admin/catalog/product-types**', (route) => reply(route, mockProductTypes));
  await page.route('**/api/v1/admin/catalog/categories**', (route) => reply(route, mockCategories));
  await page.route('**/api/v1/admin/catalog/brands**', (route) => reply(route, mockBrands));
  await page.route('**/api/v1/admin/catalog/origins**', (route) => reply(route, mockOrigins));
  await page.route('**/api/v1/admin/products**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace('/api/v1/admin/products', '');
    const method = request.method();

    if (path === '' || path === '/') {
      if (method === 'POST') {
        const body = request.postDataJSON();
        mock.writes.push({ method, path: '', ifMatch: request.headers()['if-match'], body });
        if (body.slug === 'duplicado') return problem(route, 409, 'slug_conflict');
        detail = { ...detail, id: '01900000-0000-7000-8000-0000000002ff', title: body.title, slug: body.slug, status: body.status, variants: [], images: [], version: 1 };
        return reply(route, detail, { ...etag(), Location: `/api/v1/admin/products/${detail.id}` }, 201);
      }
      mock.requests.push(new URL(request.url()));
      if (overrides.fail) return problem(route, 500, 'internal_error');
      return reply(route, overrides.page ?? mockProductPage);
    }

    const [, id, child, childId] = path.split('/');
    if (id !== detail.id) return problem(route, 404, 'product_not_found');
    if (method === 'GET') return reply(route, detail, etag());

    const ifMatch = request.headers()['if-match'];
    const isMultipart = (request.headers()['content-type'] ?? '').startsWith('multipart/');
    const body = isMultipart ? { multipart: request.postDataBuffer()?.toString('latin1') ?? '' } : request.postDataJSON();
    mock.writes.push({ method, path, ifMatch, body: isMultipart ? { upload: true } : body });
    if (ifMatch === undefined) return problem(route, 428, 'precondition_required');
    if (ifMatch !== `"${detail.version}"`) return problem(route, 412, 'version_conflict');

    if (child === 'images') {
      const raw = (body as { multipart: string }).multipart;
      if (raw.includes('storage-down.png')) return problem(route, 503, 'media_unavailable');
      const image = { id: `img-${detail.images.length + 1}`, product_id: detail.id, variant_id: null, url: '/images/packaging-finca-la-maria.webp', alt_text: /name="alt_text"\r\n\r\n([^\r]*)/.exec(raw)?.[1] ?? '', position: detail.images.length, version: 1 };
      detail = { ...detail, images: [...detail.images, image], version: detail.version + 1 };
      return reply(route, image, etag(), 201);
    }
    if (child === 'variants' && method === 'POST') {
      const input = body as { sku: string };
      if (input.sku === 'DUP') return problem(route, 409, 'sku_conflict');
      const variant = { ...detail.variants[0], ...input, id: `new-${detail.variants.length}`, available_quantity: 0, low_stock: true, version: 1 };
      detail = { ...detail, variants: [...detail.variants, variant], version: detail.version + 1 };
      return reply(route, variant, etag(), 201);
    }
    if (child === 'variants' && method === 'PATCH') {
      const input = body as { sku?: string };
      if (input.sku === 'DUP') return problem(route, 409, 'sku_conflict');
      const current = detail.variants.find((variant) => variant.id === childId);
      if (!current) return problem(route, 404, 'variant_not_found');
      const variant = { ...current, ...input, version: current.version + 1 };
      detail = { ...detail, variants: detail.variants.map((item) => (item.id === childId ? variant : item)), version: detail.version + 1 };
      return reply(route, variant, etag());
    }
    // Product merge patch.
    const patch = body as Partial<AdminProduct> & { slug?: string };
    if (patch.slug === 'duplicado') return problem(route, 409, 'slug_conflict');
    detail = { ...detail, ...patch, version: detail.version + 1 } as AdminProduct;
    return reply(route, detail, etag());
  });
  return mock;
}
