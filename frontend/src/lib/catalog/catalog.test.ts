import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getCatalogProducts, getCatalogProductBySlug, getCatalogOrigins, getCatalogOriginBySlug, getCatalogCategories } from './catalog';
import { mockCatalogData, mockCoffeeProduct } from '../../mocks/catalog';

describe('Catalog Data Source', () => {
  const getGlobalEnv = () =>
    (typeof globalThis !== 'undefined' && 'process' in globalThis
      ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
      : {}) || {};
  const envRef = getGlobalEnv();
  const originalEnv = { ...envRef };

  beforeEach(() => {
    vi.resetModules();
    for (const key of Object.keys(envRef)) {
      delete envRef[key];
    }
    Object.assign(envRef, originalEnv);
    delete envRef.CATALOG_API_URL;
  });

  afterEach(() => {
    for (const key of Object.keys(envRef)) {
      delete envRef[key];
    }
    Object.assign(envRef, originalEnv);
    vi.restoreAllMocks();
  });

  describe('Mock Fixtures Mode (when CATALOG_API_URL is unset)', () => {
    it('returns all mock products with pagination and filter support', async () => {
      const result = await getCatalogProducts();
      expect(result.items).toHaveLength(mockCatalogData.products.length);
      expect(result.items.map((p) => p.slug)).toContain('finca-el-mirador');
      expect(result.items.map((p) => p.slug)).toContain('chocolate-85');
    });

    it('filters products by category slug', async () => {
      const result = await getCatalogProducts({ category: ['coffee'] });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.map((p) => p.slug)).toContain('finca-el-mirador');
    });

    it('filters products by product_type slug', async () => {
      const result = await getCatalogProducts({ product_type: ['cacao'] });
      expect(result.items.length).toBeGreaterThanOrEqual(1);
      expect(result.items.map((p) => p.slug)).toContain('chocolate-70');
    });

    it('retrieves single product by slug or returns null when not found', async () => {
      const product = await getCatalogProductBySlug('finca-el-mirador');
      expect(product).not.toBeNull();
      expect(product?.slug).toBe('finca-el-mirador');
      expect(product?.origin?.slug).toBe('finca-el-mirador');

      const notFound = await getCatalogProductBySlug('inexistente');
      expect(notFound).toBeNull();
    });

    it('retrieves all mock origins', async () => {
      const origins = await getCatalogOrigins();
      expect(origins.items).toHaveLength(2);
      expect(origins.items.map((o) => o.slug)).toContain('finca-el-mirador');
      expect(origins.items.map((o) => o.slug)).toContain('demo-cacao-origin');
    });

    it('retrieves single origin by slug', async () => {
      const origin = await getCatalogOriginBySlug('finca-el-mirador');
      expect(origin).not.toBeNull();
      expect(origin?.name).toBe('Finca El Mirador');
      expect(origin?.altitude_min_masl).toBe(1700);

      const notFound = await getCatalogOriginBySlug('inexistente');
      expect(notFound).toBeNull();
    });

    it('retrieves mock categories', async () => {
      const categories = await getCatalogCategories();
      expect(categories.items).toHaveLength(3);
      expect(categories.items.map((c) => c.slug)).toContain('coffee');
    });
  });

  describe('API Mode (when CATALOG_API_URL is configured)', () => {
    it('fetches products following next_cursor pagination until next_cursor is null', async () => {
      envRef.CATALOG_API_URL = 'https://api.monteluna.test';

      const page1 = {
        items: [mockCoffeeProduct],
        next_cursor: 'cursor_page_2',
      };
      const page2 = {
        items: [mockCatalogData.products[1]],
        next_cursor: null,
      };

      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page1,
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => page2,
        });

      (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

      const result = await getCatalogProducts();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenNthCalledWith(
        1,
        'https://api.monteluna.test/api/v1/products?limit=100',
        expect.any(Object)
      );
      expect(fetchMock).toHaveBeenNthCalledWith(
        2,
        'https://api.monteluna.test/api/v1/products?limit=100&cursor=cursor_page_2',
        expect.any(Object)
      );
      expect(result.items).toHaveLength(2);
      expect(result.next_cursor).toBeNull();
    });

    it('fetches single product by slug from API', async () => {
      envRef.CATALOG_API_URL = 'https://api.monteluna.test';

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockCoffeeProduct,
      });

      (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

      const product = await getCatalogProductBySlug('finca-el-mirador');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.monteluna.test/api/v1/products/finca-el-mirador',
        expect.any(Object)
      );
      expect(product?.slug).toBe('finca-el-mirador');
    });

    it('returns null on 404 from API', async () => {
      envRef.CATALOG_API_URL = 'https://api.monteluna.test';

      const fetchMock = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      (globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

      const product = await getCatalogProductBySlug('no-existe');
      expect(product).toBeNull();
    });
  });
});
