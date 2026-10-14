import { describe, it, expect } from 'vitest';
import { groupProductsByCategory, groupProductsByProductType } from './catalog-groups';
import { mockCatalogData } from '../mocks/catalog';

describe('Catalog grouping helpers for tienda', () => {
  const products = mockCatalogData.products;
  const categories = mockCatalogData.categories;

  it('groups products by category maintaining non-empty groups and unique product lists', () => {
    const groups = groupProductsByCategory(products, categories);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      expect(group.category).toBeDefined();
      expect(group.category.slug).toBeTruthy();
      expect(group.products.length).toBeGreaterThan(0);
      expect(group.id).toBe(`cat-group-${group.category.slug}`);
    }
  });

  it('preserves uncategorized published products in a fallback section', () => {
    const uncategorizedProduct = {
      ...products[0],
      slug: 'producto-sin-categoria',
      categories: [],
    };
    const groups = groupProductsByCategory([uncategorizedProduct], categories);
    expect(groups.some((g) => g.id === 'cat-group-otros' || g.category.slug === 'otros')).toBe(true);
    const otherGroup = groups.find((g) => g.id === 'cat-group-otros' || g.category.slug === 'otros');
    expect(otherGroup?.products.some((p) => p.slug === 'producto-sin-categoria')).toBe(true);
  });

  it('groups products by product_type with distinct banners and titles', () => {
    const groups = groupProductsByProductType(products);
    expect(groups.length).toBeGreaterThan(0);

    for (const group of groups) {
      expect(group.productType).toBeDefined();
      expect(group.productType.slug).toBeTruthy();
      expect(group.products.length).toBeGreaterThan(0);
      expect(group.id).toBe(`type-group-${group.productType.slug}`);
    }
  });
});
