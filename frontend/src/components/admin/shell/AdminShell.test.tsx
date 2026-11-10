import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminShell, sessionDestination, useAdminSession, useMobileDetailHeader, useRefreshLowStockCount, useReportPendingDispatchCount } from './AdminShell';

const { getCurrentAdmin, logout, listAdminOrders, listAdminInventoryVariants } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  logout: vi.fn(),
  listAdminOrders: vi.fn(),
  listAdminInventoryVariants: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, getCurrentAdmin, logout };
});

vi.mock('../../../lib/admin/orders', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/orders')>();
  return { ...original, listAdminOrders };
});

vi.mock('../../../lib/admin/catalog', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/catalog')>();
  return { ...original, listAdminInventoryVariants };
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

function lowStockTotal(total: number) {
  return { ok: true, etag: null, data: { items: [], next_cursor: null, total, generated_at: '2026-10-20T14:30:00Z' } };
}

function LowStockRefresher() {
  const refresh = useRefreshLowStockCount();
  return <button type="button" onClick={refresh}>Refrescar</button>;
}

beforeEach(() => {
  listAdminOrders.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
  listAdminInventoryVariants.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
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
    expect(screen.getByRole('status', { name: 'Comprobando tu sesión' })).toBeTruthy();

    resolveSession({ ok: true, data: owner, etag: '"1"' });
    expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Administradores' }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  describe('admin-shaped skeleton while the session is checked (admin-navigation-v1 T1: S1)', () => {
    function pendingSession() {
      let resolveSession!: (value: Awaited<ReturnType<typeof getCurrentAdmin>>) => void;
      getCurrentAdmin.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));
      return (value: Awaited<ReturnType<typeof getCurrentAdmin>>) => resolveSession(value);
    }

    it('shows a busy, labelled skeleton instead of a lone message', () => {
      pendingSession();
      render(<AdminShell active="orders"><SessionProbe /></AdminShell>);

      const skeleton = screen.getByRole('status', { name: 'Comprobando tu sesión' });
      expect(skeleton.getAttribute('aria-busy')).toBe('true');
      // Sidebar, top bar and content rows are drawn, all decorative.
      expect(skeleton.querySelectorAll('[data-skeleton][aria-hidden="true"]')).toHaveLength(4);
      // A-Sistema `brillo` shimmer, only when the user allows motion.
      expect(skeleton.querySelectorAll('.motion-safe\\:animate-brillo').length).toBeGreaterThan(0);
      expect(skeleton.querySelectorAll('.motion-safe\\:animate-pulse')).toHaveLength(0);
      expect(skeleton.querySelector('[data-skeleton="sidebar"]')).not.toBeNull();
      expect(skeleton.querySelector('[data-skeleton="topbar"]')).not.toBeNull();
      expect(skeleton.querySelector('[data-skeleton="content"]')).not.toBeNull();
      // No visible copy beyond the one hidden label: the lone message is gone.
      expect(skeleton.textContent?.trim()).toBe('Comprobando tu sesión…');
      expect(skeleton.querySelector('.sr-only')?.textContent).toBe('Comprobando tu sesión…');
    });

    it('draws the sidebar placeholders at 25 % of the on-dark foreground so they read against the dark rail', () => {
      pendingSession();
      render(<AdminShell active="orders"><SessionProbe /></AdminShell>);

      const sidebar = screen.getByRole('status', { name: 'Comprobando tu sesión' }).querySelector('[data-skeleton="sidebar"]')!;
      expect(sidebar.querySelectorAll('[class~="bg-primary-foreground/25"]').length).toBeGreaterThan(0);
      expect(sidebar.querySelectorAll('[class~="bg-primary-foreground/15"]')).toHaveLength(0);
    });

    it('renders no navigation, menu label, user name or children before the session is confirmed', () => {
      pendingSession();
      render(<AdminShell active="orders"><SessionProbe /></AdminShell>);

      expect(screen.queryAllByRole('link')).toHaveLength(0);
      expect(screen.queryAllByRole('navigation')).toHaveLength(0);
      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.queryAllByRole('heading')).toHaveLength(0);
      for (const label of ['Inicio', 'Pedidos', 'Productos', 'Inventario', 'Administradores', 'Cuenta', 'Monteluna', 'Laura Ríos', 'Colapsar menú']) {
        expect(screen.queryByText(label)).toBeNull();
      }
      expect(screen.queryByText(/Contenido privado/)).toBeNull();
      expect(listAdminOrders).not.toHaveBeenCalled();
      expect(listAdminInventoryVariants).not.toHaveBeenCalled();
    });

    it('replaces the skeleton with the real shell and children once the session resolves', async () => {
      const resolveSession = pendingSession();
      render(<AdminShell active="orders"><SessionProbe /></AdminShell>);
      expect(screen.getByRole('status', { name: 'Comprobando tu sesión' })).toBeTruthy();

      resolveSession({ ok: true, data: owner, etag: '"1"' });
      expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
      expect(screen.queryByRole('status', { name: 'Comprobando tu sesión' })).toBeNull();
      expect(screen.getByRole('navigation', { name: 'Secciones del panel' })).toBeTruthy();
    });

    it('drops the skeleton for the retry alert when the check fails and returns to it while retrying', async () => {
      let resolveRetry!: (value: Awaited<ReturnType<typeof getCurrentAdmin>>) => void;
      getCurrentAdmin
        .mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' })
        .mockReturnValueOnce(new Promise((resolve) => { resolveRetry = resolve; }));
      render(<AdminShell><SessionProbe /></AdminShell>);

      expect(await screen.findByRole('alert')).toBeTruthy();
      expect(screen.queryByRole('status', { name: 'Comprobando tu sesión' })).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('status', { name: 'Comprobando tu sesión' })).toBeTruthy();
      expect(screen.queryByText(/Contenido privado/)).toBeNull();
      resolveRetry({ ok: true, data: owner, etag: '"1"' });
      expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
    });
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

  describe('catalog tablet-and-up gate (F1: S7)', () => {
    const originalWidth = window.innerWidth;
    afterEach(() => Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth }));

    it('shows the use-a-computer-or-tablet message instead of any catalog layout at 390 px', async () => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
      getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });

      render(<AdminShell active="products" desktopOnly="catalog"><SessionProbe /></AdminShell>);
      expect(await screen.findByText('Revísalo desde un computador o una tablet')).toBeTruthy();
      expect(screen.getByText(/El catálogo se administra en una pantalla más grande/)).toBeTruthy();
      expect(screen.queryByText(/Contenido privado/)).toBeNull();
    });

    it.each([768, 1024, 1440])('renders the catalog page normally at %i px', async (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });

      render(<AdminShell active="products" desktopOnly="catalog"><SessionProbe /></AdminShell>);
      expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
      expect(screen.queryByText('Revísalo desde un computador o una tablet')).toBeNull();
    });

    it('keeps the catalog out of the phone bottom bar and lists it in the sidebar', async () => {
      getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
      render(<AdminShell active="products"><SessionProbe /></AdminShell>);
      await screen.findByText('Contenido privado de Laura Ríos');
      const sidebar = screen.getByRole('navigation', { name: 'Secciones del panel' });
      expect(within(sidebar).getByRole('link', { name: 'Productos' }).getAttribute('aria-current')).toBe('page');
      expect(within(sidebar).getByRole('link', { name: 'Inventario' })).toBeTruthy();
      const phoneBar = screen.getByRole('navigation', { name: 'Secciones' });
      expect(within(phoneBar).queryByRole('link', { name: 'Productos' })).toBeNull();
      expect(within(phoneBar).queryByRole('link', { name: 'Inventario' })).toBeNull();
    });
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

  it('shows the active low or empty stock total on Inventario from one cheap list read (F4: L11)', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminInventoryVariants.mockResolvedValue(lowStockTotal(4));
    render(<AdminShell><SessionProbe /></AdminShell>);

    expect(await screen.findByRole('link', { name: 'Inventario, 4 pendientes' })).toBeTruthy();
    expect(listAdminInventoryVariants).toHaveBeenCalledTimes(1);
    expect(listAdminInventoryVariants).toHaveBeenCalledWith({ stock: 'low_or_empty', status: 'active', limit: 25 });
  });

  it('renders no Inventario count at zero or when the read fails', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminInventoryVariants.mockResolvedValue(lowStockTotal(0));
    render(<AdminShell><SessionProbe /></AdminShell>);
    await screen.findByText('Contenido privado de Laura Ríos');
    await waitFor(() => expect(listAdminInventoryVariants).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: /Inventario, / })).toBeNull();
  });

  it('lets a screen ask for the Inventario count to be read again after a stock write', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminInventoryVariants.mockResolvedValueOnce(lowStockTotal(4)).mockResolvedValueOnce(lowStockTotal(3));
    render(<AdminShell><LowStockRefresher /></AdminShell>);

    await screen.findByRole('link', { name: 'Inventario, 4 pendientes' });
    fireEvent.click(screen.getByRole('button', { name: 'Refrescar' }));
    expect(await screen.findByRole('link', { name: 'Inventario, 3 pendientes' })).toBeTruthy();
  });

  it('lets a screen report a fresher count after loading its own data', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    listAdminOrders.mockResolvedValue(pendingCount(6));
    render(<AdminShell><PendingReporter count={2} /></AdminShell>);

    await screen.findByRole('link', { name: 'Pedidos, 6 pendientes' });
    fireEvent.click(screen.getByRole('button', { name: 'Reportar' }));
    expect(await screen.findByRole('link', { name: 'Pedidos, 2 pendientes' })).toBeTruthy();
  });

  it('swaps the 390 px header for a back link and title and hides the section bar on detail screens (A-Pedido-390)', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    function Detail() {
      useMobileDetailHeader({ title: 'ORD-7K2M9Q4X', backHref: '/admin/pedidos/', backLabel: 'Volver a pedidos' });
      return <p>Detalle</p>;
    }
    const { unmount } = render(<AdminShell active="orders"><Detail /></AdminShell>);
    await screen.findByText('Detalle');
    expect(screen.getByRole('link', { name: 'Volver a pedidos' }).getAttribute('href')).toBe('/admin/pedidos/');
    expect(screen.getByText('ORD-7K2M9Q4X')).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Secciones' })).toBeNull();
    unmount();
  });

  it('keeps the standard mobile header and section bar when no screen asks for the detail header', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    render(<AdminShell><SessionProbe /></AdminShell>);
    await screen.findByText('Contenido privado de Laura Ríos');
    expect(screen.getByRole('navigation', { name: 'Secciones' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Volver a pedidos' })).toBeNull();
  });
});
