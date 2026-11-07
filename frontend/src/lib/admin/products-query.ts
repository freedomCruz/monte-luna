import type { AdminProductStatus, ListAdminProductsQuery } from './catalog';
import { PAGE_SIZES, type PageSize } from './orders-query';

// Filter state of the Productos screen and its mapping to the listAdminProducts query
// (contracts/openapi/catalog.yaml). The same shape is kept in the address bar so
// reloads and shared links restore the view.

export type ProductSort = NonNullable<ListAdminProductsQuery['sort']>;
export type SortColumn = 'title' | 'price_amount' | 'stock';

export interface ProductFilters {
  search: string;
  typeIds: string[];
  categoryIds: string[];
  status: AdminProductStatus[];
  /** "Stock: poco o agotado" (`stock=low_or_empty`). */
  lowStock: boolean;
  sort: ProductSort;
  limit: PageSize;
}

export const PRODUCT_STATUSES: AdminProductStatus[] = ['published', 'draft', 'archived'];
const SORTS: ProductSort[] = ['title', '-title', 'price_amount', '-price_amount', 'stock', '-stock'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_PRODUCT_FILTERS: ProductFilters = {
  search: '',
  typeIds: [],
  categoryIds: [],
  status: [],
  lowStock: false,
  sort: 'title',
  limit: 25,
};

/** Whether "Limpiar filtros" applies; the search box has its own clear and sorting is not a filter. */
export function hasActiveProductFilters(filters: ProductFilters): boolean {
  return filters.typeIds.length > 0 || filters.categoryIds.length > 0 || filters.status.length > 0 || filters.lowStock;
}

/** Ascending first on a new column, then flips direction on the same one. */
export function nextSort(current: ProductSort, column: SortColumn): ProductSort {
  return current === column ? (`-${column}` as ProductSort) : column;
}

export function toListQuery(filters: ProductFilters, cursor?: string): ListAdminProductsQuery {
  const search = filters.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.typeIds.length > 0 ? { product_type_id: filters.typeIds } : {}),
    ...(filters.categoryIds.length > 0 ? { category_id: filters.categoryIds } : {}),
    ...(filters.status.length > 0 ? { status: filters.status } : {}),
    ...(filters.lowStock ? { stock: 'low_or_empty' as const } : {}),
    sort: filters.sort,
    limit: filters.limit,
    ...(cursor ? { cursor } : {}),
  };
}

/** Address-bar form of the filters, empty for the defaults. */
export function filtersToSearch(filters: ProductFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set('search', search);
  filters.typeIds.forEach((value) => params.append('product_type_id', value));
  filters.categoryIds.forEach((value) => params.append('category_id', value));
  filters.status.forEach((value) => params.append('status', value));
  if (filters.lowStock) params.set('stock', 'low_or_empty');
  if (filters.sort !== DEFAULT_PRODUCT_FILTERS.sort) params.set('sort', filters.sort);
  if (filters.limit !== DEFAULT_PRODUCT_FILTERS.limit) params.set('limit', String(filters.limit));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads filters from an address bar, ignoring anything the contract would reject. */
export function filtersFromSearch(search: string): ProductFilters {
  const params = new URLSearchParams(search);
  const sort = params.get('sort');
  const limit = Number(params.get('limit'));
  return {
    search: params.get('search')?.trim() ?? '',
    typeIds: [...new Set(params.getAll('product_type_id').filter((value) => UUID.test(value)))],
    categoryIds: [...new Set(params.getAll('category_id').filter((value) => UUID.test(value)))],
    status: [...new Set(params.getAll('status'))].filter((value): value is AdminProductStatus => (PRODUCT_STATUSES as string[]).includes(value)),
    lowStock: params.get('stock') === 'low_or_empty',
    sort: (SORTS as string[]).includes(sort ?? '') ? (sort as ProductSort) : DEFAULT_PRODUCT_FILTERS.sort,
    limit: (PAGE_SIZES as number[]).includes(limit) ? (limit as PageSize) : DEFAULT_PRODUCT_FILTERS.limit,
  };
}
