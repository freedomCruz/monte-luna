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
  account: '/admin/cuenta/',
  admins: '/admin/administradores/',
} as const;

/** Where an authenticated administrator lands until the stage 2 dashboard exists (L11). */
export const ADMIN_LANDING = ADMIN_ROUTES.account;

export type AdminNavKey = 'admins';

export interface AdminNavItem {
  key: AdminNavKey;
  title: string;
  href: string;
}

export interface AdminNavGroup {
  label: string;
  items: AdminNavItem[];
}

interface NavDefinition extends AdminNavItem {
  ownerOnly: boolean;
}

// Sidebar groups and order from the admin canvas (A-*.dc.html shell). Only entries
// whose screens exist are listed; each later stage adds its own (L11).
const GROUPS: { label: string; items: NavDefinition[] }[] = [
  {
    label: 'Configuración',
    items: [{ key: 'admins', title: 'Administradores', href: ADMIN_ROUTES.admins, ownerOnly: true }],
  },
];

/** Sidebar entries visible to a role; options a role cannot use are not rendered. */
export function navigationFor(role: AdminRole): AdminNavGroup[] {
  return GROUPS.map((group) => ({
    label: group.label,
    items: group.items
      .filter((item) => role === 'owner' || !item.ownerOnly)
      .map(({ key, title, href }) => ({ key, title, href })),
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
