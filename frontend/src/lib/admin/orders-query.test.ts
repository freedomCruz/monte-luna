import { describe, expect, it } from 'vitest';
import {
  DEFAULT_ORDER_FILTERS,
  filtersFromSearch,
  filtersToSearch,
  hasActiveFilters,
  pendingDispatchFilters,
  toListQuery,
} from './orders-query';

describe('Orders list query (F2: S3)', () => {
  it('defaults to the last 30 days, newest first, 25 per page', () => {
    expect(toListQuery(DEFAULT_ORDER_FILTERS)).toEqual({ date_filter: 'last_30_days', sort: '-placed_at', limit: 25 });
  });

  it('maps every filter to the contract query and trims the search', () => {
    expect(toListQuery({
      search: '  ORD-7K2  ',
      status: ['paid', 'preparing'],
      dateFilter: 'range',
      fromDate: '2026-10-01',
      toDate: '2026-10-20',
      methods: ['card'],
      pendingDispatch: false,
      sort: 'placed_at',
      limit: 50,
    }, 'abc')).toEqual({
      search: 'ORD-7K2',
      status: ['paid', 'preparing'],
      date_filter: 'range',
      from_date: '2026-10-01',
      to_date: '2026-10-20',
      payment_method_type: ['card'],
      sort: 'placed_at',
      limit: 50,
      cursor: 'abc',
    });
  });

  it('drops a blank search, empty lists and the bounds of non-range dates', () => {
    const query = toListQuery({ ...DEFAULT_ORDER_FILTERS, search: '   ', fromDate: '2026-10-01', toDate: '2026-10-02' });
    expect(query).not.toHaveProperty('search');
    expect(query).not.toHaveProperty('status');
    expect(query).not.toHaveProperty('payment_method_type');
    expect(query).not.toHaveProperty('from_date');
  });

  it('applies the pending dispatch view with all dates and no other filter (L6 d)', () => {
    const view = pendingDispatchFilters();
    expect(view).toEqual({ ...DEFAULT_ORDER_FILTERS, pendingDispatch: true, dateFilter: 'all' });
    expect(toListQuery(view)).toEqual({ date_filter: 'all', pending_dispatch: true, sort: '-placed_at', limit: 25 });
  });

  it('reports active filters, ignoring search and the default date window', () => {
    expect(hasActiveFilters(DEFAULT_ORDER_FILTERS)).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_ORDER_FILTERS, search: 'x' })).toBe(false);
    expect(hasActiveFilters({ ...DEFAULT_ORDER_FILTERS, status: ['paid'] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_ORDER_FILTERS, methods: ['pse'] })).toBe(true);
    expect(hasActiveFilters({ ...DEFAULT_ORDER_FILTERS, dateFilter: 'all' })).toBe(true);
    expect(hasActiveFilters(pendingDispatchFilters())).toBe(true);
  });

  it('round-trips through the address bar and ignores invalid values', () => {
    const filters = { ...DEFAULT_ORDER_FILTERS, status: ['paid' as const], methods: ['nequi' as const], search: 'maría', limit: 100 as const };
    expect(filtersFromSearch(filtersToSearch(filters))).toEqual(filters);
    expect(filtersToSearch(DEFAULT_ORDER_FILTERS)).toBe('');
    expect(filtersFromSearch('?pending_dispatch=true')).toEqual(pendingDispatchFilters());
    expect(filtersFromSearch('?status=bogus&limit=7&date_filter=range&from_date=2026-10-05&to_date=2026-10-01')).toEqual(DEFAULT_ORDER_FILTERS);
  });
});
