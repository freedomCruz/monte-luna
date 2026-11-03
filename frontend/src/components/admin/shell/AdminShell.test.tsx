import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminShell, sessionDestination, useAdminSession, useReportPendingDispatchCount } from './AdminShell';

const { getCurrentAdmin, logout, listAdminOrders } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  logout: vi.fn(),
  listAdminOrders: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, getCurrentAdmin, logout };
});

vi.mock('../../../lib/admin/orders', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/orders')>();
  return { ...original, listAdminOrders };
});

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

function SessionProbe() {
  const { user } = useAdminSession();
  return <p>Contenido privado de {user.display_name}</p>;
}

function pendingCount(count: number) {
  return { ok: true, etag: null, data: { items: [], next_cursor: null, total: 0, pending_dispatch_count: count } };
}

function PendingReporter({ count }: { count: number }) {
  const report = useReportPendingDispatchCount();
  return <button type="button" onClick={() => report(count)}>Reportar</button>;
}

beforeEach(() => {
  listAdminOrders.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminShell session guard (T2/T8: S3, S4)', () => {
  it('maps an absent session to sign-in and a forbidden response to no-access', () => {
    expect(sessionDestination({ ok: false, status: 401, code: 'unauthorized' })).toBe('/admin/ingresar/');
    expect(sessionDestination({ ok: false, status: 403, code: 'forbidden' })).toBe('/admin/sin-acceso/');
    expect(sessionDestination({ ok: false, status: 0, code: 'network_error' })).toBeNull();
  });

  it('does not render private content until the current session succeeds', async () => {
    let resolveSession!: (value: Awaited<ReturnType<typeof getCurrentAdmin>>) => void;
    getCurrentAdmin.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));

    render(<AdminShell active="admins"><SessionProbe /></AdminShell>);
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Comprobando tu sesión');

    resolveSession({ ok: true, data: owner, etag: '"1"' });
    expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Administradores' }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('does not render an owner-only page to staff', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: { ...owner, role: 'staff' }, etag: '"2"' });
    render(<AdminShell requiredRole="owner"><SessionProbe /></AdminShell>);

    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeTruthy();
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Administradores' })).toBeNull();
  });

  it('shows the user menu and signs out through the API', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    logout.mockResolvedValue({ ok: true, data: null, etag: null });
    render(<AdminShell><SessionProbe /></AdminShell>);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Menú de Laura Ríos' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText(/laura@monteluna\.co/)).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });

  it('does not render settings controls in the 390 px read-only mode', async () => {
    const originalWidth = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });

    render(<AdminShell desktopOnly><SessionProbe /></AdminShell>);
    expect(await screen.findByText('Revísalo desde un computador o una tablet')).toBeTruthy();
    expect(screen.queryByText(/Contenido privado/)).toBeNull();

    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
  });

  it('offers retry without leaking content when the session check cannot reach the API', async () => {
    getCurrentAdmin
      .mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' })
      .mockResolvedValueOnce({ ok: true, data: owner, etag: '"1"' });
    render(<AdminShell><SessionProbe /></AdminShell>);

    expect(await screen.findByText('No pudimos comprobar tu sesión.')).toBeTruthy();
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
  });

  it('lists Inicio and Pedidos for staff and links the logo to Inicio (F1: S1)', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: { ...owner, role: 'staff' }, etag: '"2"' });
    render(<AdminShell active="orders"><SessionProbe /></AdminShell>);
    await screen.findByText('Contenido privado de Laura Ríos');

    const sidebar = screen.getByRole('navigation', { name: 'Secciones del panel' });
    expect(within(sidebar).getByRole('link', { name: 'Inicio' }).getAttribute('href')).toBe('/admin/');
    const orders = within(sidebar).getByRole('link', { name: 'Pedidos' });
    expect(orders.getAttribute('href')).toBe('/admin/pedidos/');
    expect(orders.getAttribute('aria-current')).toBe('page');
    expect(screen.getByRole('link', { name: 'Monteluna Admin, inicio' }).getAttribute('href')).toBe('/admin/');
    expect(within(screen.getByRole('navigation', { name: 'Secciones' })).getAllByRole('link').map((link) => link.textContent)).toEqual(['Inicio', 'Pedidos', 'Cuenta']);
  });

  it('shows the global pending dispatch count on Pedidos in the sidebar and the mobile bar (F1: L6 f)', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminOrders.mockResolvedValue(pendingCount(6));
    render(<AdminShell><SessionProbe /></AdminShell>);

    expect(await screen.findByRole('link', { name: 'Pedidos, 6 pendientes' })).toBeTruthy();
    expect(screen.getByText('Pedidos · 6')).toBeTruthy();
    expect(listAdminOrders).toHaveBeenCalledWith(expect.objectContaining({ pending_dispatch: true, date_filter: 'all', limit: 25 }));
  });

  it('renders no count when nothing awaits dispatch or the count cannot be read', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminOrders.mockResolvedValue(pendingCount(0));
    render(<AdminShell><SessionProbe /></AdminShell>);
    await screen.findByText('Contenido privado de Laura Ríos');
    await waitFor(() => expect(listAdminOrders).toHaveBeenCalled());
    expect(screen.queryByText(/pendientes/)).toBeNull();
    expect(screen.queryByText(/Pedidos · /)).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Pedidos' }).length).toBeGreaterThan(0);
  });

  it('lets a screen report a fresher count after loading its own data', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminOrders.mockResolvedValue(pendingCount(6));
    render(<AdminShell><PendingReporter count={2} /></AdminShell>);

    await screen.findByRole('link', { name: 'Pedidos, 6 pendientes' });
    fireEvent.click(screen.getByRole('button', { name: 'Reportar' }));
    expect(await screen.findByRole('link', { name: 'Pedidos, 2 pendientes' })).toBeTruthy();
  });
});
