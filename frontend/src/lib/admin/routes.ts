import type { AdminRole } from './client';
import { ADMIN_ROUTES, type AdminNavKey } from './navigation';

/** Screens the protected admin app swaps inside its one mounted shell. */
export type AdminViewKey = 'home' | 'products' | 'product' | 'inventory' | 'orders' | 'order' | 'account' | 'admins' | 'noAccess';

export interface AdminRoute {
  view: AdminViewKey;
  path: string;
  /** Page title without the product suffix; the same text the Astro page used. */
  title: string;
  /** Sidebar entry marked current; detail screens stay under their section. */
  active?: AdminNavKey;
  requiredRole?: AdminRole;
  /** Not managed at 390 px: `true` is settings, `'catalog'` is the catalog. */
  desktopOnly?: boolean | 'catalog';
}

/**
 * Protected admin pages (every one of them mounts AdminApp). Access pages (sign-in, second
 * factor, recovery, invitation) are not listed on purpose: they keep full document loads.
 */
export const ADMIN_APP_ROUTES: readonly AdminRoute[] = [
  { view: 'home', path: ADMIN_ROUTES.home, title: 'Inicio', active: 'home' },
  { view: 'products', path: ADMIN_ROUTES.products, title: 'Productos', active: 'products', desktopOnly: 'catalog' },
  { view: 'product', path: ADMIN_ROUTES.product, title: 'Producto', active: 'products', desktopOnly: 'catalog' },
  { view: 'inventory', path: ADMIN_ROUTES.inventory, title: 'Inventario', active: 'inventory', desktopOnly: 'catalog' },
  { view: 'orders', path: ADMIN_ROUTES.orders, title: 'Pedidos', active: 'orders' },
  { view: 'order', path: '/admin/pedido/', title: 'Pedido', active: 'orders' },
  { view: 'account', path: ADMIN_ROUTES.account, title: 'Mi cuenta', desktopOnly: true },
  { view: 'admins', path: ADMIN_ROUTES.admins, title: 'Administradores', active: 'admins', requiredRole: 'owner', desktopOnly: true },
  { view: 'noAccess', path: ADMIN_ROUTES.noAccess, title: 'Sin acceso' },
];

/** Static pages are directories, so the canonical path ends with a slash. */
export function normalizeAdminPath(pathname: string): string {
  return pathname.endsWith('/') ? pathname : `${pathname}/`;
}

export function resolveAdminRoute(pathname: string): AdminRoute | null {
  const path = normalizeAdminPath(pathname);
  return ADMIN_APP_ROUTES.find((route) => route.path === path) ?? null;
}

/** `<title>` of a route, identical to the one the Astro page renders on a document load. */
export function adminDocumentTitle(route: AdminRoute): string {
  return `${route.title} · Admin Monteluna`;
}

/** The Astro page of a view reads its `<title>` here, so pages and client navigations cannot drift apart. */
export function adminPageTitle(view: AdminViewKey): string {
  const route = ADMIN_APP_ROUTES.find((item) => item.view === view);
  if (!route) throw new Error(`No admin route for view ${view}`);
  return adminDocumentTitle(route);
}

/**
 * The address a click should navigate to inside the admin app, or null when the browser must
 * handle it: modified or non-primary clicks, new-tab, download and external links, other origins,
 * paths outside the protected admin routes, and in-page hash jumps.
 */
export function adminLinkTarget(event: MouseEvent, current: URL): URL | null {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  if (!(event.target instanceof Element)) return null;
  const anchor = event.target.closest('a[href]');
  if (!anchor) return null;
  const target = anchor.getAttribute('target');
  if (target !== null && target !== '' && target !== '_self') return null;
  if (anchor.hasAttribute('download')) return null;
  if (anchor.getAttribute('rel')?.split(/\s+/).includes('external')) return null;

  const url = new URL(anchor.getAttribute('href') ?? '', current);
  if (url.origin !== current.origin || resolveAdminRoute(url.pathname) === null) return null;
  if (url.hash !== '' && url.pathname === current.pathname && url.search === current.search) return null;
  return url;
}
