import { describe, expect, it } from 'vitest';
import { ADMIN_ROUTES, navigationFor, roleLabel, initialsOf } from './navigation';

describe('Admin navigation (T2, T8: S3, S4)', () => {
  it('uses the routes fixed by identity.md for one-time links', () => {
    expect(ADMIN_ROUTES.resetPassword).toBe('/admin/restablecer-contrasena/');
    expect(ADMIN_ROUTES.invitation).toBe('/admin/invitacion/');
  });

  it('shows Administradores under Configuración to an owner (stage 1 entries only)', () => {
    expect(navigationFor('owner')).toEqual([
      {
        label: 'Configuración',
        items: [{ key: 'admins', title: 'Administradores', href: '/admin/administradores/' }],
      },
    ]);
  });

  it('hides owner-only entries from staff and drops empty groups', () => {
    expect(navigationFor('staff')).toEqual([]);
  });

  it('labels roles with the A-Admins legend', () => {
    expect(roleLabel('owner')).toBe('Propietario');
    expect(roleLabel('staff')).toBe('Equipo');
  });

  it.each([
    ['Laura Ríos', 'LR'],
    ['laura', 'L'],
    ['  Ana   María  Pérez ', 'AP'],
    ['', '?'],
  ])('initials of %j are %s', (name, expected) => {
    expect(initialsOf(name)).toBe(expected);
  });
});
