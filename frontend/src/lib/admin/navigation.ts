import type { AdminRole } from './client';

// Admin routes. The reset and invitation routes are fixed by docs/domain/identity.md;
// the rest follow the storefront's Spanish routes. Trailing slashes match Astro's
// static directory output.
export const ADMIN_ROUTES = {
  home: '/admin/',
  signIn: '/admin/ingresar/',
  secondFactor: '/admin/verificacion/',
  enrollSecondFactor: '/admin/activar-verificacion/',
  forgotPassword: '/admin/recuperar-contrasena/',
  resetPassword: '/admin/restablecer-contrasena/',
  invitation: '/admin/invitacion/',
  orders: '/admin/pedidos/',
  account: '/admin/cuenta/',
  admins: '/admin/administradores/',
} as const;

/** Where an authenticated administrator lands: the Inicio dashboard (admin-orders-v1 S1). */
export const ADMIN_LANDING = ADMIN_ROUTES.home;

export type AdminNavKey = 'home' | 'orders' | 'admins';

export interface AdminNavItem {
  key: AdminNavKey;
  title: string;
  href: string;
  /** Pending count shown as a badge; present only when positive. */
  count?: number;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

interface NavDefinition extends AdminNavItem {
  ownerOnly: boolean;
}

// Sidebar groups and order from the admin canvas (A-*.dc.html shell). Only entries
// whose screens exist are listed; each later stage adds its own (L11). The first
// group has no label, as in the canvas.
const GROUPS: { label: string; items: NavDefinition[] }[] = [
  {
    label: '',
    items: [{ key: 'home', title: 'Inicio', href: ADMIN_ROUTES.home, ownerOnly: false }],
  },
  {
    label: 'Ventas',
    items: [{ key: 'orders', title: 'Pedidos', href: ADMIN_ROUTES.orders, ownerOnly: false }],
  },
  {
    label: 'Configuración',
    items: [{ key: 'admins', title: 'Administradores', href: ADMIN_ROUTES.admins, ownerOnly: true }],
  },
];

export interface AdminNavCounts {
  /** Global paid and preparing orders awaiting dispatch (`pending_dispatch_count`). */
  pendingDispatchCount: number | null;
}

/** Sidebar entries visible to a role; options a role cannot use are not rendered. */
export function navigationFor(role: AdminRole, counts?: AdminNavCounts): AdminNavGroup[] {
  const pending = counts?.pendingDispatchCount ?? 0;
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => role === 'owner' || !item.ownerOnly)
      .map(({ key, title, href }): AdminNavItem => ({
        key,
        title,
        href,
        ...(key === 'orders' && pending > 0 ? { count: pending } : {}),
      })),
  })).filter((group) => group.items.length > 0);
}

/** Role names from the A-Admins legend ("Propietario", "Equipo"). */
export function roleLabel(role: AdminRole): string {
  return role === 'owner' ? 'Propietario' : 'Equipo';
}

/** Up to two initials for the avatar: first and last word. */
export function initialsOf(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0];
  const last = words.length > 1 ? words[words.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Order detail. The site is static, so the order id travels in the query string. */
export function orderDetailHref(id: string): string {
  return `/admin/pedido/?id=${encodeURIComponent(id)}`;
}
