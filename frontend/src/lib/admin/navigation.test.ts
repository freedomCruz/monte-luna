import { describe, expect, it } from 'vitest';
import { ADMIN_LANDING, ADMIN_ROUTES, navigationFor, roleLabel, initialsOf } from './navigation';

const INICIO = { key: 'home', title: 'Inicio', href: '/admin/' };
const PEDIDOS = { key: 'orders', title: 'Pedidos', href: '/admin/pedidos/' };
const ADMINS = { key: 'admins', title: 'Administradores', href: '/admin/administradores/' };

describe('Admin navigation (T2, T8: S3, S4; F1: S1)', () => {
  it('uses the routes fixed by identity.md for one-time links', () => {
    expect(ADMIN_ROUTES.resetPassword).toBe('/admin/restablecer-contrasena/');
    expect(ADMIN_ROUTES.invitation).toBe('/admin/invitacion/');
  });

  it('lands an authenticated administrator on Inicio instead of Mi cuenta (S1)', () => {
    expect(ADMIN_LANDING).toBe('/admin/');
    expect(ADMIN_ROUTES.orders).toBe('/admin/pedidos/');
  });

  it('shows Inicio, Pedidos under Ventas and Administradores under Configuración to an owner', () => {
    expect(navigationFor('owner')).toEqual([
      { label: '', items: [INICIO] },
      { label: 'Ventas', items: [PEDIDOS] },
      { label: 'Configuración', items: [ADMINS] },
    ]);
  });

  it('hides owner-only entries from staff and drops empty groups', () => {
    expect(navigationFor('staff')).toEqual([
      { label: '', items: [INICIO] },
      { label: 'Ventas', items: [PEDIDOS] },
    ]);
  });

  it('adds the pending dispatch count to Pedidos only when it is positive', () => {
    const pedidos = (counts?: { pendingDispatchCount: number | null }) =>
      navigationFor('staff', counts).flatMap((group) => group.items).find((item) => item.key === 'orders');
    expect(pedidos({ pendingDispatchCount: 6 })).toEqual({ ...PEDIDOS, count: 6 });
    expect(pedidos({ pendingDispatchCount: 0 })).toEqual(PEDIDOS);
    expect(pedidos({ pendingDispatchCount: null })).toEqual(PEDIDOS);
    expect(pedidos()).toEqual(PEDIDOS);
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
