import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminApp } from './AdminApp';

const { getCurrentAdmin, listAdminOrders, listAdminInventoryVariants } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  listAdminOrders: vi.fn(),
  listAdminInventoryVariants: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/client')>()), getCurrentAdmin }));
vi.mock('../../../lib/admin/orders', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/orders')>()), listAdminOrders }));
vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()), listAdminInventoryVariants }));

vi.mock('../home/InicioView', () => ({ InicioView: () => <h1>Vista Inicio</h1> }));
vi.mock('../catalog/ProductsView', () => ({ ProductsView: () => <h1>Vista Productos</h1> }));
vi.mock('../catalog/product/ProductView', () => ({ ProductView: () => <h1>Vista Producto {new URLSearchParams(window.location.search).get('id')}</h1> }));
vi.mock('../catalog/InventoryView', () => ({ InventoryView: () => <h1>Vista Inventario</h1> }));
vi.mock('../orders/OrdersView', () => ({ OrdersView: () => <h1>Vista Pedidos</h1> }));
vi.mock('../orders/detail/OrderDetailView', () => ({ OrderDetailView: ({ id }: { id: string | null }) => <h1>Vista Pedido {id}</h1> }));
vi.mock('../account/AccountView', () => ({ AccountView: () => <h1>Vista Cuenta</h1> }));
vi.mock('../administrators/AdministratorsView', () => ({ AdministratorsView: () => <h1>Vista Administradores</h1> }));

const owner: AdminUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'laura@monteluna.co',
  display_name: 'Laura Ríos',
  role: 'owner',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};
const staff: AdminUser = { ...owner, role: 'staff', display_name: 'Andrés Peña' };

const session = (user: AdminUser) => ({ ok: true as const, data: user, etag: '"1"' });
const openAt = (address: string) => window.history.replaceState(null, '', address);

beforeEach(() => {
  getCurrentAdmin.mockResolvedValue(session(owner));
  listAdminOrders.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
  listAdminInventoryVariants.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  openAt('/');
});

describe('AdminApp direct load (admin-navigation-v1 T3: S2/L6)', () => {
  it.each([
    ['/admin/', 'Vista Inicio', 'Inicio'],
    ['/admin/productos/', 'Vista Productos', 'Productos'],
    ['/admin/inventario/', 'Vista Inventario', 'Inventario'],
    ['/admin/pedidos/', 'Vista Pedidos', 'Pedidos'],
    ['/admin/administradores/', 'Vista Administradores', 'Administradores'],
  ])('opens %s on its view with its sidebar entry current', async (address, heading, section) => {
    openAt(address);
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { level: 1, name: heading })).toBeTruthy();
    const sidebar = screen.getByRole('navigation', { name: 'Secciones del panel' });
    expect(within(sidebar).getByRole('link', { name: new RegExp(`^${section}`) }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps Productos current on the product screen and reads the product id from the address', async () => {
    openAt('/admin/producto/?id=abc-123');
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Producto abc-123' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Secciones del panel' })).getByRole('link', { name: 'Productos' }).getAttribute('aria-current')).toBe('page');
  });

  it('keeps Pedidos current on the order screen and reads the order id from the address', async () => {
    openAt('/admin/pedido/?id=ord-9');
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedido ord-9' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Secciones del panel' })).getByRole('link', { name: /^Pedidos/ }).getAttribute('aria-current')).toBe('page');
  });

  it('opens Mi cuenta and Sin acceso with no sidebar entry current', async () => {
    openAt('/admin/cuenta/');
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Cuenta' })).toBeTruthy();
    expect(within(screen.getByRole('navigation', { name: 'Secciones del panel' })).queryByRole('link', { current: 'page' })).toBeNull();
    cleanup();

    openAt('/admin/sin-acceso/');
    render(<AdminApp />);
    expect(await screen.findByRole('heading', { level: 1, name: 'No tienes acceso a esta sección' })).toBeTruthy();
  });

  it('does not render the owner-only screen to staff', async () => {
    getCurrentAdmin.mockResolvedValue(session(staff));
    openAt('/admin/administradores/');
    render(<AdminApp />);

    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeTruthy();
    expect(screen.queryByText('Vista Administradores')).toBeNull();
  });

  it('shows the 390 px catalog message instead of the catalog view', async () => {
    const width = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    openAt('/admin/productos/');
    render(<AdminApp />);

    expect(await screen.findByText('Revísalo desde un computador o una tablet')).toBeTruthy();
    expect(screen.queryByText('Vista Productos')).toBeNull();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  });

  it('keeps the session gate: skeleton first, no view and no private data until the backend answers', async () => {
    let resolveSession!: (value: ReturnType<typeof session>) => void;
    getCurrentAdmin.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
    openAt('/admin/pedidos/');
    render(<AdminApp />);

    expect(screen.getByRole('status', { name: 'Comprobando tu sesión' })).toBeTruthy();
    expect(screen.queryByText('Vista Pedidos')).toBeNull();
    expect(screen.queryByText('Laura Ríos')).toBeNull();
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    resolveSession(session(owner));
    expect(await screen.findByText('Vista Pedidos')).toBeTruthy();
  });
});
