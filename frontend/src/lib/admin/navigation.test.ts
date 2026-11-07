import { describe, expect, it } from 'vitest';
import { ADMIN_LANDING, ADMIN_ROUTES, navigationFor, orderDetailHref, productDetailHref, roleLabel, initialsOf } from './navigation';

const INICIO = { key: 'home', title: 'Inicio', href: '/admin/' };
const PRODUCTOS = { key: 'products', title: 'Productos', href: '/admin/productos/' };
const INVENTARIO = { key: 'inventory', title: 'Inventario', href: '/admin/inventario/' };
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

  it('shows Inicio, Catálogo, Ventas and Configuración to an owner, in the canvas order (S1)', () => {
    expect(navigationFor('owner')).toEqual([
      { label: '', items: [INICIO] },
      { label: 'Catálogo', items: [PRODUCTOS, INVENTARIO] },
      { label: 'Ventas', items: [PEDIDOS] },
      { label: 'Configuración', items: [ADMINS] },
    ]);
  });

  it('hides owner-only entries from staff and drops empty groups', () => {
    expect(navigationFor('staff')).toEqual([
      { label: '', items: [INICIO] },
      { label: 'Catálogo', items: [PRODUCTOS, INVENTARIO] },
      { label: 'Ventas', items: [PEDIDOS] },
    ]);
  });

  it('adds the low-stock count to Inventario only when it is positive (F4: L11)', () => {
    const inventario = (counts?: { pendingDispatchCount: number | null; lowStockCount?: number | null }) =>
      navigationFor('staff', counts).flatMap((group) => group.items).find((item) => item.key === 'inventory');
    expect(inventario({ pendingDispatchCount: null, lowStockCount: 4 })).toEqual({ ...INVENTARIO, count: 4 });
    expect(inventario({ pendingDispatchCount: 6, lowStockCount: 0 })).toEqual(INVENTARIO);
    expect(inventario({ pendingDispatchCount: null, lowStockCount: null })).toEqual(INVENTARIO);
    expect(inventario({ pendingDispatchCount: null })).toEqual(INVENTARIO);
  });

  it('adds the pending dispatch count to Pedidos only when it is positive', () => {
    const pedidos = (counts?: { pendingDispatchCount: number | null }) =>
      navigationFor('staff', counts).flatMap((group) => group.items).find((item) => item.key === 'orders');
    expect(pedidos({ pendingDispatchCount: 6 })).toEqual({ ...PEDIDOS, count: 6 });
    expect(pedidos({ pendingDispatchCount: 0 })).toEqual(PEDIDOS);
    expect(pedidos({ pendingDispatchCount: null })).toEqual(PEDIDOS);
    expect(pedidos()).toEqual(PEDIDOS);
  });

  it('links an order to its detail screen through the query string', () => {
    expect(orderDetailHref('01900000-0000-7000-8000-0000000001a1')).toBe('/admin/pedido/?id=01900000-0000-7000-8000-0000000001a1');
  });

  it('lists only the catalog screens this stage delivers and links Producto through the query string (S1)', () => {
    expect(ADMIN_ROUTES.products).toBe('/admin/productos/');
    expect(ADMIN_ROUTES.inventory).toBe('/admin/inventario/');
    expect(ADMIN_ROUTES.product).toBe('/admin/producto/');
    const catalog = navigationFor('staff').find((group) => group.label === 'Catálogo');
    expect(catalog?.items.map((item) => item.title)).toEqual(['Productos', 'Inventario']);
    expect(productDetailHref('01900000-0000-7000-8000-0000000000a1')).toBe('/admin/producto/?id=01900000-0000-7000-8000-0000000000a1');
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
