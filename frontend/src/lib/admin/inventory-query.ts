import type { ListAdminInventoryVariantsQuery } from './catalog';
import { PAGE_SIZES, type PageSize } from './orders-query';

// Filter state of the Inventario variant list and its mapping to the
// listAdminInventoryVariants query (contracts/openapi/catalog.yaml). The same shape is
// kept in the address bar: Producto links here with `?search=<SKU>`.

export type InventoryStatus = NonNullable<ListAdminInventoryVariantsQuery['status']>;

export interface InventoryFilters {
  search: string;
  /** Narrows the list to one product's variants. */
  productId: string;
  /** The contract's default is `all`, so a link from Producto finds archived variants too. */
  status: InventoryStatus;
  /** "Poco stock" chip (`stock=low_or_empty`). */
  lowStock: boolean;
  limit: PageSize;
}

export const INVENTORY_STATUSES: InventoryStatus[] = ['all', 'active', 'archived'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const DEFAULT_INVENTORY_FILTERS: InventoryFilters = { search: '', productId: '', status: 'all', lowStock: false, limit: 25 };

/** Whether "Limpiar filtros" applies; the search box has its own clear. */
export function hasActiveInventoryFilters(filters: InventoryFilters): boolean {
  return filters.productId !== '' || filters.status !== DEFAULT_INVENTORY_FILTERS.status || filters.lowStock;
}

export function toListQuery(filters: InventoryFilters, cursor?: string): ListAdminInventoryVariantsQuery {
  const search = filters.search.trim();
  return {
    ...(search ? { search } : {}),
    ...(filters.productId ? { product_id: filters.productId } : {}),
    ...(filters.status !== DEFAULT_INVENTORY_FILTERS.status ? { status: filters.status } : {}),
    ...(filters.lowStock ? { stock: 'low_or_empty' as const } : {}),
    limit: filters.limit,
    ...(cursor ? { cursor } : {}),
  };
}

/** Address-bar form of the filters, empty for the defaults. */
export function filtersToSearch(filters: InventoryFilters): string {
  const params = new URLSearchParams();
  const search = filters.search.trim();
  if (search) params.set('search', search);
  if (filters.productId) params.set('product_id', filters.productId);
  if (filters.status !== DEFAULT_INVENTORY_FILTERS.status) params.set('status', filters.status);
  if (filters.lowStock) params.set('stock', 'low_or_empty');
  if (filters.limit !== DEFAULT_INVENTORY_FILTERS.limit) params.set('limit', String(filters.limit));
  const text = params.toString();
  return text ? `?${text}` : '';
}

/** Reads filters from an address bar, ignoring anything the contract would reject. */
export function filtersFromSearch(search: string): InventoryFilters {
  const params = new URLSearchParams(search);
  const productId = params.get('product_id') ?? '';
  const status = params.get('status') as InventoryStatus | null;
  const limit = Number(params.get('limit'));
  return {
    search: params.get('search')?.trim() ?? '',
    productId: UUID.test(productId) ? productId : '',
    status: status && INVENTORY_STATUSES.includes(status) ? status : DEFAULT_INVENTORY_FILTERS.status,
    lowStock: params.get('stock') === 'low_or_empty',
    limit: (PAGE_SIZES as number[]).includes(limit) ? (limit as PageSize) : DEFAULT_INVENTORY_FILTERS.limit,
  };
}
