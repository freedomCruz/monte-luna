import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  resolveOriginCardTitle,
  fetchOrderOrigin,
} from './order-origin';
import { mockOriginCoffee, mockCoffeeProduct } from '../../mocks/catalog';

describe('order-origin lib (S5 of cart-and-orders, F1c)', () => {
  describe('resolveOriginCardTitle (M-Pedido canvas titles per state)', () => {
    it('returns "Mientras llega, conoce de dónde viene tu café." for Pagado, Confirmando, and Rechazado', () => {
      expect(resolveOriginCardTitle('Pagado')).toBe(
        'Mientras llega, conoce de dónde viene tu café.'
      );
      expect(resolveOriginCardTitle('Confirmando')).toBe(
        'Mientras llega, conoce de dónde viene tu café.'
      );
      expect(resolveOriginCardTitle('Rechazado')).toBe(
        'Mientras llega, conoce de dónde viene tu café.'
      );
    });

    it('returns "Mientras decides, conoce de dónde viene tu café." for Vencido and Cancelado', () => {
      expect(resolveOriginCardTitle('Vencido')).toBe(
        'Mientras decides, conoce de dónde viene tu café.'
      );
      expect(resolveOriginCardTitle('Cancelado')).toBe(
        'Mientras decides, conoce de dónde viene tu café.'
      );
    });
  });

  describe('fetchOrderOrigin', () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      vi.restoreAllMocks();
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('returns null when lines are empty', async () => {
      const result = await fetchOrderOrigin([]);
      expect(result).toBeNull();
    });

    it('returns origin data when product has an origin via API', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/products/finca-el-mirador')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'finca-el-mirador',
              origin: {
                slug: 'finca-el-mirador',
                name: 'Finca El Mirador',
                producer_name: 'María Gómez',
              },
            }),
          });
        }
        if (typeof url === 'string' && url.includes('/api/v1/origins/finca-el-mirador')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'finca-el-mirador',
              name: 'Finca El Mirador',
              producer_name: 'María Gómez',
              department: 'Huila',
              story: 'María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m.',
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await fetchOrderOrigin([{ product_slug: 'finca-el-mirador' }]);

      expect(result).not.toBeNull();
      expect(result?.originSlug).toBe('finca-el-mirador');
      expect(result?.department).toBe('Huila');
      expect(result?.producerName).toBe('María Gómez');
      expect(result?.story).toContain('María Gómez cultiva en Finca El Mirador');
    });

    it('returns null when product has origin: null (origin absent)', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/products/chocolate-85')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'chocolate-85',
              title: 'Chocolate 85%',
              origin: null,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await fetchOrderOrigin([{ product_slug: 'chocolate-85' }]);
      expect(result).toBeNull();
    });

    it('skips line without origin and finds origin in second line', async () => {
      globalThis.fetch = vi.fn().mockImplementation((url: string) => {
        if (typeof url === 'string' && url.includes('/api/v1/products/chocolate-85')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'chocolate-85',
              origin: null,
            }),
          });
        }
        if (typeof url === 'string' && url.includes('/api/v1/products/finca-el-mirador')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'finca-el-mirador',
              origin: {
                slug: 'finca-el-mirador',
                name: 'Finca El Mirador',
                producer_name: 'María Gómez',
              },
            }),
          });
        }
        if (typeof url === 'string' && url.includes('/api/v1/origins/finca-el-mirador')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: async () => ({
              slug: 'finca-el-mirador',
              department: 'Huila',
              story: null,
            }),
          });
        }
        return Promise.resolve({ ok: false, status: 404 });
      });

      const result = await fetchOrderOrigin([
        { product_slug: 'chocolate-85' },
        { product_slug: 'finca-el-mirador' },
      ]);

      expect(result).not.toBeNull();
      expect(result?.originSlug).toBe('finca-el-mirador');
      expect(result?.department).toBe('Huila');
    });

    it('falls back to local catalog data when backend route returns 404', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 });

      const result = await fetchOrderOrigin([{ product_slug: 'finca-el-mirador' }]);

      expect(result).not.toBeNull();
      expect(result?.originSlug).toBe(mockOriginCoffee.slug);
      expect(result?.department).toBe('Huila');
    });
  });
});
