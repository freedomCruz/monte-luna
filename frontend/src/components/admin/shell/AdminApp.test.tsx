import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminApp } from './AdminApp';

const { getCurrentAdmin, listAdminOrders, listAdminInventoryVariants, assign, probe } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  listAdminOrders: vi.fn(),
  listAdminInventoryVariants: vi.fn(),
  assign: vi.fn(),
  // Counters and switches the mocked sections read, so a test can see a remount or set unsaved edits.
  probe: { productsMounts: 0, dirty: false },
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/client')>()), getCurrentAdmin }));
vi.mock('../../../lib/admin/orders', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/orders')>()), listAdminOrders }));
vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()), listAdminInventoryVariants }));

vi.mock('../home/InicioView', () => ({
  InicioView: () => (
    <>
      <h1>Vista Inicio</h1>
      <a href="/admin/ingresar/">Ir a ingresar</a>
      <a href="/productos/finca/">Ver la tienda</a>
    </>
  ),
}));
vi.mock('../catalog/ProductsView', () => ({
  ProductsView: () => {
    const [mount] = React.useState(() => ++probe.productsMounts);
    return (
      <>
        <h1>Vista Productos</h1>
        <p data-testid="mount">{mount}</p>
        <a href="/admin/productos/?q=cafe">Buscar café</a>
        <button type="button" onClick={() => window.history.replaceState(window.history.state, '', '/admin/productos/?q=filtrado')}>Filtrar</button>
      </>
    );
  },
}));
vi.mock('../catalog/product/ProductView', async () => {
  const { useUnsavedChangesGuard } = await import('../shared/unsaved-changes');
  const { useAdminNavigate } = await import('./admin-router');
  return {
    ProductView: () => {
      useUnsavedChangesGuard(probe.dirty, 'Café de origen');
      const navigate = useAdminNavigate();
      // Like the real screen, the id is read once when the screen mounts.
      const [id] = React.useState(() => new URLSearchParams(window.location.search).get('id'));
      return (
        <>
          <h1>Vista Producto {id}</h1>
          <a href="/admin/productos/">Volver a Productos</a>
          <button type="button" onClick={() => navigate('/admin/pedidos/', { discardChanges: true })}>Salir ya</button>
        </>
      );
    },
  };
});
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
const currentAddress = () => window.location.pathname + window.location.search;
const sidebar = () => screen.getByRole('navigation', { name: 'Secciones del panel' });
const sidebarLink = (name: string | RegExp) => within(sidebar()).getByRole('link', { name });

// jsdom cannot navigate, so document loads are observed through a location whose assign is a spy.
function stubDocumentLoads() {
  const real = window.location;
  vi.stubGlobal('location', new Proxy({}, {
    get(_target, property) {
      if (property === 'assign') return assign;
      const value = Reflect.get(real, property, real);
      return typeof value === 'function' ? value.bind(real) : value;
    },
  }));
}

beforeEach(() => {
  probe.productsMounts = 0;
  probe.dirty = false;
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
  stubDocumentLoads();
  getCurrentAdmin.mockResolvedValue(session(owner));
  listAdminOrders.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
  listAdminInventoryVariants.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  openAt('/');
  document.title = '';
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


async function openInicio() {
  openAt('/admin/');
  render(<AdminApp />);
  await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' });
}

describe('AdminApp client navigation (admin-navigation-v1 T3: S2)', () => {
  it('swaps the section on a sidebar click without a document load and keeps the shell mounted', async () => {
    await openInicio();
    const navBefore = sidebar();
    const menuBefore = screen.getByRole('button', { name: 'Menú de Laura Ríos' });

    fireEvent.click(sidebarLink(/^Pedidos/));

    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
    expect(currentAddress()).toBe('/admin/pedidos/');
    expect(screen.queryByText('Vista Inicio')).toBeNull();
    expect(sidebar()).toBe(navBefore);
    expect(screen.getByRole('button', { name: 'Menú de Laura Ríos' })).toBe(menuBefore);
    expect(sidebarLink(/^Pedidos/).getAttribute('aria-current')).toBe('page');
    expect(sidebarLink('Inicio').getAttribute('aria-current')).toBeNull();
    expect(assign).not.toHaveBeenCalled();
    // No second session skeleton: the shell never went back to the gate.
    expect(screen.queryByRole('status', { name: 'Comprobando tu sesión' })).toBeNull();
  });

  it('keeps the badge counts across sections instead of fetching them again', async () => {
    listAdminOrders.mockResolvedValue({ ok: true, etag: null, data: { items: [], next_cursor: null, total: 0, pending_dispatch_count: 6 } });
    await openInicio();
    await screen.findByRole('link', { name: 'Pedidos, 6 pendientes' });

    fireEvent.click(sidebarLink(/^Productos/));
    await screen.findByRole('heading', { level: 1, name: 'Vista Productos' });
    expect(screen.getByRole('link', { name: 'Pedidos, 6 pendientes' })).toBeTruthy();
    expect(listAdminOrders).toHaveBeenCalledTimes(1);
  });

  it('scrolls to the top on a push', async () => {
    await openInicio();
    fireEvent.click(sidebarLink(/^Pedidos/));
    await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('follows the browser back and forward buttons', async () => {
    await openInicio();
    fireEvent.click(sidebarLink(/^Pedidos/));
    await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });

    window.history.back();
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' })).toBeTruthy();
    expect(currentAddress()).toBe('/admin/');
    expect(sidebarLink('Inicio').getAttribute('aria-current')).toBe('page');

    window.history.forward();
    expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
    expect(currentAddress()).toBe('/admin/pedidos/');
  });

  it('puts the page back where it was on back, once it is tall enough', async () => {
    Object.defineProperty(document.documentElement, 'scrollHeight', { configurable: true, value: 4000 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    await openInicio();
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 640 });
    fireEvent.click(sidebarLink(/^Pedidos/));
    await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });
    Object.defineProperty(window, 'scrollY', { configurable: true, value: 0 });

    window.history.back();
    await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' });
    await waitFor(() => expect(window.scrollTo).toHaveBeenLastCalledWith(0, 640));
  });

  describe('links the browser keeps', () => {
    it.each([
      ['a modifier click', { ctrlKey: true }],
      ['a shift click', { shiftKey: true }],
      ['a middle click', { button: 1 }],
    ])('leaves %s on a section link to the browser', async (_name, init) => {
      await openInicio();
      const link = sidebarLink(/^Pedidos/);
      let prevented: boolean | undefined;
      document.addEventListener('click', (event) => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
      fireEvent.click(link, init);

      expect(prevented).toBe(false);
      expect(currentAddress()).toBe('/admin/');
      expect(screen.getByRole('heading', { level: 1, name: 'Vista Inicio' })).toBeTruthy();
      expect(getCurrentAdmin).toHaveBeenCalledTimes(1);
    });

    it.each(['Ir a ingresar', 'Ver la tienda'])('does a full document load for %s', async (name) => {
      await openInicio();
      let prevented: boolean | undefined;
      document.addEventListener('click', (event) => { prevented = event.defaultPrevented; event.preventDefault(); }, { once: true });
      fireEvent.click(screen.getByRole('link', { name }));

      expect(prevented).toBe(false);
      expect(currentAddress()).toBe('/admin/');
      expect(getCurrentAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe('same section, different query', () => {
    async function openProductos() {
      openAt('/admin/productos/');
      render(<AdminApp />);
      await screen.findByRole('heading', { level: 1, name: 'Vista Productos' });
    }

    it('remounts the section so it reads its filters from the new address', async () => {
      await openProductos();
      expect(screen.getByTestId('mount').textContent).toBe('1');

      fireEvent.click(screen.getByRole('link', { name: 'Buscar café' }));
      await waitFor(() => expect(screen.getByTestId('mount').textContent).toBe('2'));
      expect(currentAddress()).toBe('/admin/productos/?q=cafe');

      window.history.back();
      await waitFor(() => expect(screen.getByTestId('mount').textContent).toBe('3'));
      expect(currentAddress()).toBe('/admin/productos/');
    });

    it('treats the section link on a filtered list as a fresh visit', async () => {
      await openProductos();
      fireEvent.click(screen.getByRole('link', { name: 'Buscar café' }));
      await waitFor(() => expect(screen.getByTestId('mount').textContent).toBe('2'));

      fireEvent.click(sidebarLink(/^Productos/));
      await waitFor(() => expect(screen.getByTestId('mount').textContent).toBe('3'));
      expect(currentAddress()).toBe('/admin/productos/');
    });

    it('reloads the section without a new history entry when the link points at the current address', async () => {
      await openProductos();
      const entries = window.history.length;
      fireEvent.click(sidebarLink(/^Productos/));
      await waitFor(() => expect(screen.getByTestId('mount').textContent).toBe('2'));
      expect(window.history.length).toBe(entries);
    });

    it('does not take a section replacing its own query string for a navigation', async () => {
      await openProductos();
      fireEvent.click(screen.getByRole('button', { name: 'Filtrar' }));

      expect(currentAddress()).toBe('/admin/productos/?q=filtrado');
      expect(screen.getByTestId('mount').textContent).toBe('1');
      expect(getCurrentAdmin).toHaveBeenCalledTimes(1);
    });
  });

  describe('session revalidation on every section change (L4)', () => {
    it('asks the backend again per change, in parallel with the section, without blocking it', async () => {
      await openInicio();
      expect(getCurrentAdmin).toHaveBeenCalledTimes(1);
      getCurrentAdmin.mockReturnValue(new Promise(() => {}));

      fireEvent.click(sidebarLink(/^Pedidos/));
      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
      expect(getCurrentAdmin).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole('status', { name: 'Comprobando tu sesión' })).toBeNull();

      fireEvent.click(sidebarLink(/^Productos/));
      await screen.findByRole('heading', { level: 1, name: 'Vista Productos' });
      expect(getCurrentAdmin).toHaveBeenCalledTimes(3);
    });

    it('revalidates on back and forward too', async () => {
      await openInicio();
      fireEvent.click(sidebarLink(/^Pedidos/));
      await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });
      window.history.back();
      await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' });
      expect(getCurrentAdmin).toHaveBeenCalledTimes(3);
    });

    it('goes to sign-in when the session expired, exactly like the first check', async () => {
      await openInicio();
      getCurrentAdmin.mockResolvedValue({ ok: false, status: 401, code: 'unauthorized' });
      fireEvent.click(sidebarLink(/^Pedidos/));

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/ingresar/'));
    });

    it('goes to the no-access page when the account lost its access', async () => {
      await openInicio();
      getCurrentAdmin.mockResolvedValue({ ok: false, status: 403, code: 'forbidden' });
      fireEvent.click(sidebarLink(/^Pedidos/));

      await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/sin-acceso/'));
    });

    it('does not reload the no-access page into itself', async () => {
      openAt('/admin/sin-acceso/');
      render(<AdminApp />);
      await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' });
      fireEvent.click(sidebarLink('Inicio'));
      await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' });

      getCurrentAdmin.mockResolvedValue({ ok: false, status: 403, code: 'forbidden' });
      window.history.back();
      await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' });
      await waitFor(() => expect(getCurrentAdmin).toHaveBeenCalledTimes(3));
      expect(assign).not.toHaveBeenCalled();
    });

    it('stops showing an owner-only section once the refreshed session says the role was lost', async () => {
      await openInicio();
      let resolveCheck!: (value: ReturnType<typeof session>) => void;
      getCurrentAdmin.mockReturnValue(new Promise((resolve) => { resolveCheck = resolve; }));
      fireEvent.click(sidebarLink('Administradores'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Administradores' })).toBeTruthy();

      resolveCheck(session(staff));
      expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeTruthy();
      expect(screen.queryByText('Vista Administradores')).toBeNull();
      expect(screen.queryByRole('link', { name: 'Administradores' })).toBeNull();
    });

    it('keeps the screen when the background check cannot reach the API', async () => {
      await openInicio();
      getCurrentAdmin.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
      fireEvent.click(sidebarLink(/^Pedidos/));

      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
      await waitFor(() => expect(getCurrentAdmin).toHaveBeenCalledTimes(2));
      expect(screen.queryByRole('alert')).toBeNull();
      expect(assign).not.toHaveBeenCalled();
    });

    it('adopts a refreshed session so the next screen sees the current account', async () => {
      await openInicio();
      getCurrentAdmin.mockResolvedValue({ ok: true, data: { ...owner, display_name: 'Laura R. Ríos' }, etag: '"2"' });
      fireEvent.click(sidebarLink(/^Pedidos/));

      expect(await screen.findByRole('button', { name: 'Menú de Laura R. Ríos' })).toBeTruthy();
    });
  });

  describe('unsaved changes (L4)', () => {
    // Inicio -> product screen by a link in the app, with unsaved edits registered by the screen.
    async function openDirtyProduct() {
      await openInicio();
      probe.dirty = true;
      const link = document.createElement('a');
      link.setAttribute('href', '/admin/producto/?id=abc');
      document.body.append(link);
      fireEvent.click(link);
      link.remove();
      await screen.findByRole('heading', { level: 1, name: 'Vista Producto abc' });
    }

    it('asks before following a link out of a screen with unsaved edits', async () => {
      await openDirtyProduct();
      fireEvent.click(screen.getByRole('link', { name: 'Volver a Productos' }));

      const dialog = await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' });
      expect(within(dialog).getByText('Perderás los cambios que hiciste en Café de origen.')).toBeTruthy();
      expect(currentAddress()).toBe('/admin/producto/?id=abc');
      // The modal hides the page from assistive technology, not from the DOM.
      expect(screen.getByRole('heading', { level: 1, name: 'Vista Producto abc', hidden: true })).toBeTruthy();
    });

    it('stays on the screen with "Seguir editando" and does not revalidate or move the address', async () => {
      await openDirtyProduct();
      const calls = getCurrentAdmin.mock.calls.length;
      fireEvent.click(sidebarLink(/^Pedidos/));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Seguir editando' }));

      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
      expect(currentAddress()).toBe('/admin/producto/?id=abc');
      expect(screen.getByRole('heading', { level: 1, name: 'Vista Producto abc' })).toBeTruthy();
      expect(getCurrentAdmin.mock.calls.length).toBe(calls);
    });

    it('leaves with "Salir sin guardar"', async () => {
      await openDirtyProduct();
      fireEvent.click(sidebarLink(/^Pedidos/));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir sin guardar' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
      expect(currentAddress()).toBe('/admin/pedidos/');
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('does not ask when the screen has nothing to lose', async () => {
      probe.dirty = false;
      openAt('/admin/producto/?id=abc');
      render(<AdminApp />);
      await screen.findByRole('heading', { level: 1, name: 'Vista Producto abc' });
      fireEvent.click(screen.getByRole('link', { name: 'Volver a Productos' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Productos' })).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('asks on the browser back button and restores the address with "Seguir editando"', async () => {
      await openDirtyProduct();
      window.history.back();

      const dialog = await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' });
      expect(screen.getByRole('heading', { level: 1, name: 'Vista Producto abc', hidden: true })).toBeTruthy();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Seguir editando' }));

      await waitFor(() => expect(currentAddress()).toBe('/admin/producto/?id=abc'));
      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Producto abc' })).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();

      // History stayed consistent: Inicio, Producto, Productos are still the three entries.
      probe.dirty = false;
      fireEvent.click(screen.getByRole('link', { name: 'Volver a Productos' }));
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir sin guardar' }));
      await screen.findByRole('heading', { level: 1, name: 'Vista Productos' });
      window.history.back();
      await screen.findByRole('heading', { level: 1, name: 'Vista Producto abc' });
      window.history.back();
      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' })).toBeTruthy();
    });

    it('goes back after the dialog is confirmed on the browser back button', async () => {
      await openDirtyProduct();
      window.history.back();
      fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir sin guardar' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' })).toBeTruthy();
      expect(currentAddress()).toBe('/admin/');
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('lets a screen leave on purpose once it saved, without asking', async () => {
      await openDirtyProduct();
      fireEvent.click(screen.getByRole('button', { name: 'Salir ya' }));

      expect(await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' })).toBeTruthy();
      expect(screen.queryByRole('alertdialog')).toBeNull();
    });

    it('keeps the unload warning for real document loads', async () => {
      await openDirtyProduct();
      const unload = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(unload);
      expect(unload.defaultPrevented).toBe(true);
    });
  });

  describe('accessibility of a client navigation', () => {
    it('moves focus to the new h1, sets the page title and announces the route politely', async () => {
      await openInicio();
      fireEvent.click(sidebarLink(/^Pedidos/));

      const heading = await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(heading.getAttribute('tabindex')).toBe('-1');
      expect(document.title).toBe('Pedidos · Admin Monteluna');
      const announcer = document.querySelector('[aria-live="polite"]');
      expect(announcer?.textContent).toBe('Pedidos · Admin Monteluna');
      expect(announcer?.getAttribute('aria-atomic')).toBe('true');
    });

    it('does the same on back', async () => {
      await openInicio();
      fireEvent.click(sidebarLink(/^Pedidos/));
      await screen.findByRole('heading', { level: 1, name: 'Vista Pedidos' });
      window.history.back();

      const heading = await screen.findByRole('heading', { level: 1, name: 'Vista Inicio' });
      await waitFor(() => expect(document.activeElement).toBe(heading));
      expect(document.title).toBe('Inicio · Admin Monteluna');
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('Inicio · Admin Monteluna');
    });

    it('titles the owner-only screen like its Astro page', async () => {
      await openInicio();
      fireEvent.click(sidebarLink('Administradores'));
      await screen.findByRole('heading', { level: 1, name: 'Vista Administradores' });
      expect(document.title).toBe('Administradores · Admin Monteluna');
    });

    it('leaves a direct load alone: no focus move, no title change, nothing announced', async () => {
      document.title = 'Inicio · Admin Monteluna';
      await openInicio();
      expect(document.activeElement).toBe(document.body);
      expect(document.title).toBe('Inicio · Admin Monteluna');
      expect(document.querySelector('[aria-live="polite"]')?.textContent).toBe('');
    });

    it('keeps the live region off the status role the pages already use', async () => {
      await openInicio();
      expect(document.querySelector('[aria-live="polite"]')?.getAttribute('role')).toBeNull();
    });
  });
});
