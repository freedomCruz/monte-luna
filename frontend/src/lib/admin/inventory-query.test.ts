import { describe, expect, it } from 'vitest';
import {
  DEFAULT_INVENTORY_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  hasActiveInventoryFilters,
  toListQuery,
  type InventoryFilters,
} from './inventory-query';

const PRODUCT_ID = '01900000-0000-7000-8000-0000000002a1';

describe('Inventario query (F4: S4)', () => {
  it('sends only the limit for an untouched view', () => {
    expect(toListQuery(DEFAULT_INVENTORY_FILTERS)).toEqual({ limit: 25 });
  });

  it('maps every filter to the listAdminInventoryVariants parameters', () => {
    const filters: InventoryFilters = { search: '  ML-MIR ', productId: PRODUCT_ID, status: 'archived', lowStock: true, limit: 50 };
    expect(toListQuery(filters, 'abc')).toEqual({
      search: 'ML-MIR',
      product_id: PRODUCT_ID,
      status: 'archived',
      stock: 'low_or_empty',
      limit: 50,
      cursor: 'abc',
    });
  });

  it('keeps the address bar empty for the defaults and mirrors search and product_id otherwise', () => {
    expect(filtersToSearch(DEFAULT_INVENTORY_FILTERS)).toBe('');
    expect(filtersToSearch({ ...DEFAULT_INVENTORY_FILTERS, search: ' ML-MIR-250-GE ' })).toBe('?search=ML-MIR-250-GE');
    expect(filtersToSearch({ ...DEFAULT_INVENTORY_FILTERS, productId: PRODUCT_ID })).toBe(`?product_id=${PRODUCT_ID}`);
    expect(filtersToSearch({ search: 'ML', productId: PRODUCT_ID, status: 'active', lowStock: true, limit: 100 })).toBe(
      `?search=ML&product_id=${PRODUCT_ID}&status=active&stock=low_or_empty&limit=100`
    );
  });

  it('round-trips the address and reads the Producto link', () => {
    expect(filtersFromSearch('?search=ML-MIR-250-GE')).toEqual({ ...DEFAULT_INVENTORY_FILTERS, search: 'ML-MIR-250-GE' });
    const filters: InventoryFilters = { search: 'ML', productId: PRODUCT_ID, status: 'archived', lowStock: true, limit: 100 };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
  });

  it('ignores values the contract would reject', () => {
    expect(filtersFromSearch('?product_id=nope&status=gone&stock=all&limit=7')).toEqual(DEFAULT_INVENTORY_FILTERS);
  });

  it('counts status, stock and product as clearable filters but not the search box', () => {
    expect(hasActiveInventoryFilters(DEFAULT_INVENTORY_FILTERS)).toBe(false);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, search: 'x' })).toBe(false);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, lowStock: true })).toBe(true);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, status: 'active' })).toBe(true);
    expect(hasActiveInventoryFilters({ ...DEFAULT_INVENTORY_FILTERS, productId: PRODUCT_ID })).toBe(true);
  });
});
