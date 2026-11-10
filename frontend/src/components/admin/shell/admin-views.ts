import * as React from 'react';
import type { AdminViewKey } from '../../../lib/admin/routes';

type ViewModule = { default: React.ComponentType };

// Each section is its own chunk: the admin island loads the shell and the section being opened,
// not every screen of the panel, and the router fetches the next one when it is first visited.
const VIEW_LOADERS: Record<AdminViewKey, () => Promise<ViewModule>> = {
  home: () => import('../home/InicioView').then((module) => ({ default: module.InicioView })),
  products: () => import('../catalog/ProductsView').then((module) => ({ default: module.ProductsView })),
  product: () => import('../catalog/product/ProductView').then((module) => ({ default: module.ProductView })),
  inventory: () => import('../catalog/InventoryView').then((module) => ({ default: module.InventoryView })),
  orders: () => import('../orders/OrdersView').then((module) => ({ default: module.OrdersView })),
  order: () => import('../orders/detail/OrderDetailRoute').then((module) => ({ default: module.OrderDetailRoute })),
  account: () => import('../account/AccountView').then((module) => ({ default: module.AccountView })),
  admins: () => import('../administrators/AdministratorsView').then((module) => ({ default: module.AdministratorsView })),
  noAccess: () => import('./AdminNoAccess').then((module) => ({ default: module.AdminNoAccess })),
};

export const ADMIN_VIEWS = Object.fromEntries(
  Object.entries(VIEW_LOADERS).map(([key, load]) => [key, React.lazy(load)]),
) as Record<AdminViewKey, React.LazyExoticComponent<React.ComponentType>>;

/** Starts fetching a section's code ahead of rendering it (the lazy component reuses the request). */
export function preloadAdminView(view: AdminViewKey): void {
  // A failed prefetch is not an error: rendering the section requests its code again.
  VIEW_LOADERS[view]().catch(() => {});
}

/** Starts fetching every section's code, so a first visit to another section finds it loaded. */
export function preloadAdminViews(): void {
  for (const view of Object.keys(VIEW_LOADERS) as AdminViewKey[]) preloadAdminView(view);
}
