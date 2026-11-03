import type { AdminPaymentMethod, ListAdminOrdersQuery, OrderStatus } from './orders';

// Filter state of the Pedidos screen and its mapping to the listAdminOrders query
// (contracts/openapi/orders.yaml). The same shape is kept in the address bar so
// reloads and links such as "Por despachar" restore the view.

export type DateFilter = 'last_30_days' | 'all' | 'range';
export type OrderSort = 'placed_at' | '-placed_at';
export type PageSize = 25 | 50 | 100;
type PaymentMethodType = NonNullable<AdminPaymentMethod>;

export interface OrderFilters {
  search: string;
  status: OrderStatus[];
  dateFilter: DateFilter;
  fromDate: string;
  toDate: string;
  methods: PaymentMethodType[];
  pendingDispatch: boolean;
  sort: OrderSort;
  limit: PageSize;
}

export const ORDER_STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered', 'cancelled', 'expired'];
export const PAYMENT_METHODS: PaymentMethodType[] = ['card', 'pse', 'nequi', 'bancolombia_transfer'];
export const PAGE_SIZES: PageSize[] = [25, 50, 100];

export const DEFAULT_ORDER_FILTERS: OrderFilters = {
  search: '',
  status: [],
  dateFilter: 'last_30_days',
  fromDate: '',
  toDate: '',
  methods: [],
  pendingDispatch: false,
  sort: '-placed_at',
  limit: 25,
};

/** "Por despachar": paid and preparing orders of any date, every other filter cleared (L6 d). */
export function pendingDispatchFilters(): OrderFilters {
  return { ...DEFAULT_ORDER_FILTERS, pendingDispatch: true, dateFilter: 'all' };
}

/** Whether "Limpiar filtros" applies; the search box has its own clear and the default window is not a filter. */
export function hasActiveFilters(filters: OrderFilters): boolean {
  return filters.status.length > 0 || filters.methods.length > 0 || filters.pendingDispatch || filters.dateFilter !== 'last_30_days';
}

export function isValidRange(from: string, to: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to;
}

export function toListQuery(filters: OrderFilters, cursor?: string): ListAdminOrdersQuery {
  const search = filters.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.status.length > 0 ? { status: filters.status } : {}),
    date_filter: filters.dateFilter,
    ...(filters.dateFilter === 'range' ? { from_date: filters.fromDate, to_date: filters.toDate } : {}),
    ...(filters.methods.length > 0 ? { payment_method_type: filters.methods } : {}),
    ...(filters.pendingDispatch ? { pending_dispatch: true } : {}),
    sort: filters.sort,
    limit: filters.limit,
    ...(cursor ? { cursor } : {}),
  };
}

/** Address-bar form of the filters, empty for the defaults. */
export function filtersToSearch(filters: OrderFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set('search', search);
  filters.status.forEach((value) => params.append('status', value));
  if (filters.dateFilter !== (filters.pendingDispatch ? 'all' : DEFAULT_ORDER_FILTERS.dateFilter)) params.set('date_filter', filters.dateFilter);
  if (filters.dateFilter === 'range') {
    params.set('from_date', filters.fromDate);
    params.set('to_date', filters.toDate);
  }
  filters.methods.forEach((value) => params.append('payment_method_type', value));
  if (filters.pendingDispatch) params.set('pending_dispatch', 'true');
  if (filters.sort !== DEFAULT_ORDER_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.limit !== DEFAULT_ORDER_FILTERS.limit) params.set('limit', String(filters.limit));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads filters from an address bar, ignoring anything the contract would reject. */
export function filtersFromSearch(search: string): OrderFilters {
  const params = new URLSearchParams(search);
  const filters: OrderFilters = { ...DEFAULT_ORDER_FILTERS };
  filters.search = params.get('search')?.trim() ?? '';
  filters.status = params.getAll('status').filter((value): value is OrderStatus => (ORDER_STATUSES as string[]).includes(value));
  filters.methods = params.getAll('payment_method_type').filter((value): value is PaymentMethodType => (PAYMENT_METHODS as string[]).includes(value));
  filters.pendingDispatch = params.get('pending_dispatch') === 'true';
  const dateFilter = params.get('date_filter') ?? (filters.pendingDispatch ? 'all' : null);
  if (dateFilter === 'all') filters.dateFilter = 'all';
  if (dateFilter === 'range') {
    const from = params.get('from_date') ?? '';
    const to = params.get('to_date') ?? '';
    if (isValidRange(from, to)) Object.assign(filters, { dateFilter: 'range', fromDate: from, toDate: to });
  }
  if (params.get('sort') === 'placed_at') filters.sort = 'placed_at';
  const limit = Number(params.get('limit'));
  if ((PAGE_SIZES as number[]).includes(limit)) filters.limit = limit as PageSize;
  return filters;
}
