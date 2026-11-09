import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAdminProduct,
  createAdminVariant,
  getAdminInventoryVariant,
  getAdminProduct,
  getAdminProductImage,
  getAdminVariant,
  listAdminCatalogBrands,
  listAdminCatalogCategories,
  listAdminCatalogOrigins,
  listAdminCatalogProductTypes,
  listAdminInventoryMovements,
  listAdminInventoryVariants,
  listAdminProducts,
  listAdminVariantLots,
  receiveAdminVariantLot,
  updateAdminProduct,
  updateAdminVariant,
  uploadAdminProductImage,
} from './catalog';
import { isVersionConflict } from './orders';

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

const PRODUCT_ID = '01900000-0000-7000-8000-0000000000a1';
const VARIANT_ID = '01900000-0000-7000-8000-0000000000b2';
const IMAGE_ID = '01900000-0000-7000-8000-0000000000c3';
const PAGE = { items: [], next_cursor: null };

describe('Admin catalog client (F1: S1, S6)', () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function lastCall(): { url: string; init: RequestInit; headers: Record<string, string> } {
    const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
    return { url, init, headers: init.headers as Record<string, string> };
  }

  describe('reads', () => {
    it('lists products without a query string by default, no-store and same-origin', async () => {
      fetchMock.mockImplementation(async () => json(200, PAGE));
      await listAdminProducts();
      expect(lastCall().url).toBe('/api/v1/admin/products');
      expect(lastCall().init.method).toBe('GET');
      expect(lastCall().init.cache).toBe('no-store');
      expect(lastCall().init.credentials).toBe('same-origin');
    });

    it('repeats array filters and carries the scalar filters of the product list', async () => {
      fetchMock.mockImplementation(async () => json(200, PAGE));
      await listAdminProducts({
        search: 'Huila',
        category_id: [PRODUCT_ID],
        status: ['draft', 'published'],
        stock: 'low_or_empty',
        sort: '-stock',
        limit: 50,
        cursor: 'abc',
      });
      const query = new URL(lastCall().url, 'https://x.test').searchParams;
      expect(query.getAll('status')).toEqual(['draft', 'published']);
      expect(query.getAll('category_id')).toEqual([PRODUCT_ID]);
      expect(query.get('stock')).toBe('low_or_empty');
      expect(query.get('sort')).toBe('-stock');
      expect(query.get('limit')).toBe('50');
      expect(query.get('cursor')).toBe('abc');
    });

    it('reads a product with its ETag and encodes the id', async () => {
      fetchMock.mockImplementation(async () => json(200, { id: PRODUCT_ID }, { ETag: '"4"' }));
      const result = await getAdminProduct('a/b');
      expect(lastCall().url).toBe('/api/v1/admin/products/a%2Fb');
      expect(result).toMatchObject({ ok: true, etag: '"4"' });
    });

    it('reads a variant and an image under their product', async () => {
      fetchMock.mockImplementation(async () => json(200, {}, { ETag: '"4"' }));
      await getAdminVariant(PRODUCT_ID, VARIANT_ID);
      expect(lastCall().url).toBe(`/api/v1/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`);
      await getAdminProductImage(PRODUCT_ID, IMAGE_ID);
      expect(lastCall().url).toBe(`/api/v1/admin/products/${PRODUCT_ID}/images/${IMAGE_ID}`);
    });

    it.each([
      ['categories', listAdminCatalogCategories, '/api/v1/admin/catalog/categories'],
      ['origins', listAdminCatalogOrigins, '/api/v1/admin/catalog/origins'],
      ['brands', listAdminCatalogBrands, '/api/v1/admin/catalog/brands'],
      ['product types', listAdminCatalogProductTypes, '/api/v1/admin/catalog/product-types'],
    ] as const)('lists read-only %s', async (_name, list, path) => {
      fetchMock.mockImplementation(async () => json(200, PAGE));
      await list();
      expect(lastCall().url).toBe(path);
      expect(lastCall().init.method).toBe('GET');
    });

    it('filters taxonomy by status and searches origins', async () => {
      fetchMock.mockImplementation(async () => json(200, PAGE));
      await listAdminCatalogOrigins({ search: 'Pitalito', status: 'all', limit: 100 });
      const query = new URL(lastCall().url, 'https://x.test').searchParams;
      expect(query.get('search')).toBe('Pitalito');
      expect(query.get('status')).toBe('all');
      expect(query.get('limit')).toBe('100');
    });

    it('lists inventory variants, lots and movements', async () => {
      fetchMock.mockImplementation(async () => json(200, PAGE));
      await listAdminInventoryVariants({ search: 'CAF', product_id: PRODUCT_ID, stock: 'low_or_empty', status: 'active' });
      const query = new URL(lastCall().url, 'https://x.test').searchParams;
      expect(lastCall().url.startsWith('/api/v1/admin/inventory/variants?')).toBe(true);
      expect(query.get('product_id')).toBe(PRODUCT_ID);
      expect(query.get('stock')).toBe('low_or_empty');

      await listAdminVariantLots(VARIANT_ID, { limit: 25 });
      expect(lastCall().url).toBe(`/api/v1/admin/inventory/variants/${VARIANT_ID}/lots?limit=25`);

      await listAdminInventoryMovements(VARIANT_ID, { lot_id: IMAGE_ID, cursor: 'c' });
      expect(new URL(lastCall().url, 'https://x.test').searchParams.get('lot_id')).toBe(IMAGE_ID);
      expect(lastCall().url.startsWith(`/api/v1/admin/inventory/variants/${VARIANT_ID}/movements?`)).toBe(true);
    });

    it('reads the inventory summary with the parent product ETag', async () => {
      fetchMock.mockImplementation(async () => json(200, { variant_id: VARIANT_ID }, { ETag: '"9"' }));
      const result = await getAdminInventoryVariant(VARIANT_ID);
      expect(lastCall().url).toBe(`/api/v1/admin/inventory/variants/${VARIANT_ID}`);
      expect(result).toMatchObject({ ok: true, etag: '"9"' });
    });
  });

  describe('writes', () => {
    const newProduct = { title: 'Huila', slug: 'huila' } as unknown as Parameters<typeof createAdminProduct>[0];

    it('creates a product with POST and without If-Match', async () => {
      fetchMock.mockImplementation(async () => json(201, { id: PRODUCT_ID }, { ETag: '"1"' }));
      const result = await createAdminProduct(newProduct);
      expect(lastCall().url).toBe('/api/v1/admin/products');
      expect(lastCall().init.method).toBe('POST');
      expect(lastCall().headers['If-Match']).toBeUndefined();
      expect(lastCall().headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(lastCall().init.body as string)).toEqual(newProduct);
      expect(result).toMatchObject({ ok: true, etag: '"1"' });
    });

    it('updates a product with a merge patch guarded by the product ETag', async () => {
      fetchMock.mockImplementation(async () => json(200, { id: PRODUCT_ID }, { ETag: '"5"' }));
      await updateAdminProduct(PRODUCT_ID, '"4"', { subtitle: null } as never);
      expect(lastCall().url).toBe(`/api/v1/admin/products/${PRODUCT_ID}`);
      expect(lastCall().init.method).toBe('PATCH');
      expect(lastCall().headers['If-Match']).toBe('"4"');
      expect(lastCall().headers['Content-Type']).toBe('application/merge-patch+json');
      expect(JSON.parse(lastCall().init.body as string)).toEqual({ subtitle: null });
    });

    it('creates and updates variants with the parent product ETag', async () => {
      fetchMock.mockImplementation(async () => json(201, {}, { ETag: '"5"' }));
      await createAdminVariant(PRODUCT_ID, '"4"', { sku: 'A' } as never);
      expect(lastCall().url).toBe(`/api/v1/admin/products/${PRODUCT_ID}/variants`);
      expect(lastCall().init.method).toBe('POST');
      expect(lastCall().headers['If-Match']).toBe('"4"');
      expect(lastCall().headers['Content-Type']).toBe('application/json');

      await updateAdminVariant(PRODUCT_ID, VARIANT_ID, '"5"', { barcode: null } as never);
      expect(lastCall().url).toBe(`/api/v1/admin/products/${PRODUCT_ID}/variants/${VARIANT_ID}`);
      expect(lastCall().init.method).toBe('PATCH');
      expect(lastCall().headers['If-Match']).toBe('"5"');
      expect(lastCall().headers['Content-Type']).toBe('application/merge-patch+json');
    });

    it('uploads an image as multipart without forcing a JSON content type', async () => {
      fetchMock.mockImplementation(async () => json(201, { id: IMAGE_ID }, { ETag: '"6"' }));
      const file = new File([new Uint8Array([1, 2, 3])], 'taza.png', { type: 'image/png' });
      const result = await uploadAdminProductImage(PRODUCT_ID, '"5"', {
        file,
        alt_text: 'Taza de café',
        variant_id: VARIANT_ID,
        position: 2,
      });
      const { url, init, headers } = lastCall();
      expect(url).toBe(`/api/v1/admin/products/${PRODUCT_ID}/images`);
      expect(init.method).toBe('POST');
      expect(headers['If-Match']).toBe('"5"');
      expect(headers['Content-Type']).toBeUndefined();
      const form = init.body as FormData;
      expect(form).toBeInstanceOf(FormData);
      expect((form.get('file') as File).name).toBe('taza.png');
      expect(form.get('alt_text')).toBe('Taza de café');
      expect(form.get('variant_id')).toBe(VARIANT_ID);
      expect(form.get('position')).toBe('2');
      expect(result).toMatchObject({ ok: true, etag: '"6"' });
    });

    it('omits optional upload fields that were not provided', async () => {
      fetchMock.mockImplementation(async () => json(201, {}));
      await uploadAdminProductImage(PRODUCT_ID, '"5"', { file: new File(['x'], 'a.webp', { type: 'image/webp' }), alt_text: 'A' });
      const form = lastCall().init.body as FormData;
      expect(form.has('variant_id')).toBe(false);
      expect(form.has('position')).toBe(false);
    });

    it('receives a lot through a variant with the parent product ETag', async () => {
      fetchMock.mockImplementation(async () => json(200, {}, { ETag: '"10"' }));
      const body = { lot_code: 'L-1', quantity: 12, production_date: '2026-10-01' } as never;
      await receiveAdminVariantLot(VARIANT_ID, '"9"', body);
      expect(lastCall().url).toBe(`/api/v1/admin/inventory/variants/${VARIANT_ID}/receive-lot`);
      expect(lastCall().init.method).toBe('POST');
      expect(lastCall().headers['If-Match']).toBe('"9"');
      expect(JSON.parse(lastCall().init.body as string)).toEqual(body);
    });
  });

  describe('problems', () => {
    it.each([
      [412, 'version_conflict'],
      [428, 'precondition_required'],
      [409, 'slug_conflict'],
      [413, 'image_too_large'],
      [415, 'unsupported_image_type'],
      [503, 'media_unavailable'],
    ])('exposes %i %s by its problem code', async (status, code) => {
      fetchMock.mockResolvedValue(problem(status, code));
      const result = await updateAdminProduct(PRODUCT_ID, '"1"', {} as never);
      expect(result).toMatchObject({ ok: false, status, code });
    });

    it('recognises a stale version', async () => {
      fetchMock.mockResolvedValue(problem(412, 'version_conflict'));
      expect(isVersionConflict(await updateAdminProduct(PRODUCT_ID, '"1"', {} as never))).toBe(true);
    });

    it('reports a network failure as network_error', async () => {
      fetchMock.mockRejectedValue(new TypeError('offline'));
      expect(await listAdminProducts()).toEqual({ ok: false, code: 'network_error', status: 0 });
    });
  });
});
