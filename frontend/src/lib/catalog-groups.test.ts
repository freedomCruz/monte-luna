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

    const cafeGroup = groups.find((g) => g.category.slug === 'cafe');
    expect(cafeGroup).toBeDefined();
    expect(cafeGroup?.products.some((p) => p.slug === 'finca-el-mirador-lavado')).toBe(true);

    const cacaoGroup = groups.find((g) => g.category.slug === 'cacao');
    expect(cacaoGroup).toBeDefined();
    expect(cacaoGroup?.products.some((p) => p.slug === 'chocolate-artesanal-70')).toBe(true);
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
