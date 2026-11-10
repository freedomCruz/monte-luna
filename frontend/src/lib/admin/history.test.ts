import { afterEach, describe, expect, it } from 'vitest';
import { replaceAddressSearch } from './history';

afterEach(() => window.history.replaceState(null, '', '/'));

describe('replaceAddressSearch (admin-navigation-v1 T3: S2)', () => {
  it('rewrites the query string of the current entry without adding one', () => {
    window.history.replaceState(null, '', '/admin/productos/?q=a');
    const entries = window.history.length;
    replaceAddressSearch('?q=b&limit=50');
    expect(window.location.pathname + window.location.search).toBe('/admin/productos/?q=b&limit=50');
    expect(window.history.length).toBe(entries);
  });

  it('clears the query string with an empty search', () => {
    window.history.replaceState(null, '', '/admin/productos/?q=a');
    replaceAddressSearch('');
    expect(window.location.pathname + window.location.search).toBe('/admin/productos/');
  });

  it('keeps the history state, where the admin router stores the position of the entry', () => {
    window.history.replaceState({ adminNav: 3 }, '', '/admin/productos/');
    replaceAddressSearch('?q=b');
    expect(window.history.state).toEqual({ adminNav: 3 });
  });
});
