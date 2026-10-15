import { describe, it, expect } from 'vitest';
import { getCatalogProductsByOrigin } from './catalog';
import { mockOriginCoffee, mockOriginCacao } from '../../mocks/catalog';

describe('getCatalogProductsByOrigin', () => {
  it('returns products belonging to a specific origin in mock mode', async () => {
    const coffeeProducts = await getCatalogProductsByOrigin(mockOriginCoffee.slug);
    expect(coffeeProducts.length).toBeGreaterThan(0);
    expect(coffeeProducts.every((p) => p.origin?.slug === mockOriginCoffee.slug)).toBe(true);

    const cacaoProducts = await getCatalogProductsByOrigin(mockOriginCacao.slug);
    expect(cacaoProducts.length).toBeGreaterThan(0);
    expect(cacaoProducts.every((p) => p.origin?.slug === mockOriginCacao.slug)).toBe(true);
  });

  it('returns empty array when origin has no products or does not exist', async () => {
    const empty = await getCatalogProductsByOrigin('origen-sin-productos');
    expect(empty).toEqual([]);
  });
});
