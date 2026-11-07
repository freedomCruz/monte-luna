import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PRODUCT_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  hasActiveProductFilters,
  nextSort,
  toListQuery,
  type ProductFilters,
} from './products-query';

const TYPE_ID = '01900000-0000-7000-8000-0000000000a1';
const CATEGORY_ID = '01900000-0000-7000-8000-0000000000b2';

describe('Productos query (F2: S2)', () => {
  it('sends only the defaults the contract needs for an untouched view', () => {
    expect(toListQuery(DEFAULT_PRODUCT_FILTERS)).toEqual({ sort: 'title', limit: 25 });
  });

  it('maps every filter to the listAdminProducts parameters', () => {
    const filters: ProductFilters = {
      search: '  Huila ',
      typeIds: [TYPE_ID],
      categoryIds: [CATEGORY_ID],
      status: ['draft', 'archived'],
      lowStock: true,
      sort: '-stock',
      limit: 50,
    };
    expect(toListQuery(filters, 'abc')).toEqual({
      search: 'Huila',
      product_type_id: [TYPE_ID],
      category_id: [CATEGORY_ID],
      status: ['draft', 'archived'],
      stock: 'low_or_empty',
      sort: '-stock',
      limit: 50,
      cursor: 'abc',
    });
  });

  it('keeps an empty address bar for the defaults', () => {
    expect(filtersToSearch(DEFAULT_PRODUCT_FILTERS)).toBe('');
  });

  it('mirrors the filters in the address bar and restores them', () => {
    const filters: ProductFilters = {
      search: 'Huila',
      typeIds: [TYPE_ID],
      categoryIds: [CATEGORY_ID],
      status: ['published'],
      lowStock: true,
      sort: 'price_amount',
      limit: 100,
    };
    const search = filtersToSearch(filters);
    const params = new URLSearchParams(search);
    expect(params.get('search')).toBe('Huila');
    expect(params.getAll('product_type_id')).toEqual([TYPE_ID]);
    expect(params.get('stock')).toBe('low_or_empty');
    expect(filtersFromSearch(search)).toEqual(filters);
  });

  it('ignores address values the contract would reject', () => {
    const restored = filtersFromSearch(
      '?status=bogus&status=draft&product_type_id=not-a-uuid&category_id=also-not&sort=color&limit=7&stock=all'
    );
    expect(restored).toEqual({ ...DEFAULT_PRODUCT_FILTERS, status: ['draft'] });
  });

  it('flags only real filters as active, not search or sort', () => {
    expect(hasActiveProductFilters(DEFAULT_PRODUCT_FILTERS)).toBe(false);
    expect(hasActiveProductFilters({ ...DEFAULT_PRODUCT_FILTERS, search: 'x', sort: '-title' })).toBe(false);
    expect(hasActiveProductFilters({ ...DEFAULT_PRODUCT_FILTERS, lowStock: true })).toBe(true);
    expect(hasActiveProductFilters({ ...DEFAULT_PRODUCT_FILTERS, status: ['draft'] })).toBe(true);
  });

  it('toggles ascending to descending on the same column and starts a new one ascending', () => {
    expect(nextSort('title', 'title')).toBe('-title');
    expect(nextSort('-title', 'title')).toBe('title');
    expect(nextSort('title', 'price_amount')).toBe('price_amount');
    expect(nextSort('-price_amount', 'stock')).toBe('stock');
  });
});
