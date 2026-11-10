/**
 * Replaces the query string of the current history entry (filters, search, page size) without
 * touching its state: the admin router keeps the entry's position there, and a view that wiped it
 * would break back/forward handling.
 */
export function replaceAddressSearch(search: string): void {
  window.history.replaceState(window.history.state, '', `${window.location.pathname}${search}`);
}
