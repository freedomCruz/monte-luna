import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockOrderPage, mockOrderRows } from '../../../mocks/admin-orders';
import type { AdminOrderPage } from '../../../lib/admin/orders';
import { OrdersView } from './OrdersView';

const { listAdminOrders } = vi.hoisted(() => ({ listAdminOrders: vi.fn() }));

vi.mock('../../../lib/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/orders')>()),
  listAdminOrders,
}));

const page = (overrides: Partial<AdminOrderPage> = {}): { ok: true; data: AdminOrderPage; etag: null } => ({
  ok: true,
  etag: null,
  data: { ...mockOrderPage, total: 214, ...overrides },
});

const lastQuery = () => listAdminOrders.mock.calls.at(-1)![0];
const originalWidth = window.innerWidth;

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/pedidos/');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  listAdminOrders.mockResolvedValue(page());
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});

describe('OrdersView table (F2: S3)', () => {
  it('shows the loading skeleton and then the canvas columns and row content', async () => {
    render(<OrdersView />);
    expect(screen.getByLabelText('Cargando pedidos').getAttribute('aria-busy')).toBe('true');

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent?.replace('↓', '').trim());
    expect(headers).toEqual(['Pedido', 'Fecha', 'Cliente', 'Destino', 'Total', 'Pedido', 'Pago', 'Método']);

    const first = within(table).getAllByRole('row')[1];
    expect(within(first).getByRole('link', { name: 'ORD-7K2M9Q4X' }).getAttribute('href')).toBe(`/admin/pedido/?id=${mockOrderRows[0].id}`);
    expect(within(first).getByText('María Fernanda Ruiz')).toBeTruthy();
    expect(within(first).getAllByText('Medellín, Antioquia')).toHaveLength(2);
    expect(within(first).getByText('$112.100')).toBeTruthy();
    expect(within(first).getByText('20 oct, 9:12 a. m.')).toBeTruthy();
    expect(within(first).getByText('Pagado')).toBeTruthy();
    expect(within(first).getByText('Aprobado')).toBeTruthy();
    expect(within(first).getByText('Nequi')).toBeTruthy();
  });

  it('has no checkboxes and no batch action in v1', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByText(/Pasar a «En preparación»/)).toBeNull();
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull();
  });

  it('requests the default view: last 30 days, newest first, 25 rows', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(lastQuery()).toEqual({ date_filter: 'last_30_days', sort: '-placed_at', limit: 25 });
    expect(screen.getByRole('status').textContent).toBe('1–8 de 214 pedidos');
    expect(screen.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeTruthy();
    expect(screen.getByText('Los pedidos nacen en la tienda; aquí se preparan, se despachan y se siguen.')).toBeTruthy();
  });

  it('applies the pending dispatch view from the header link (L6 d)', async () => {
    render(<OrdersView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Ver despachos pendientes · 6' }));
    await waitFor(() => expect(lastQuery()).toEqual({ date_filter: 'all', pending_dispatch: true, sort: '-placed_at', limit: 25 }));
    expect(screen.getByRole('button', { name: /Por despachar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Limpiar filtros' })).toBeTruthy();
  });

  it('hides the header link when nothing awaits dispatch', async () => {
    listAdminOrders.mockResolvedValue(page({ pending_dispatch_count: 0 }));
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: /Ver despachos pendientes/ })).toBeNull();
  });

  it('searches by number, customer or email after a short pause', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar pedidos' }), { target: { value: ' maría ' } });
    expect(listAdminOrders).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(lastQuery()).toMatchObject({ search: 'maría' });
    expect(screen.getByPlaceholderText('Número, cliente o correo')).toBeTruthy();
  });

  it('filters by state and clears it with Limpiar filtros', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Pagado' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ status: ['paid'] }));
    expect(screen.getByRole('button', { name: 'Estado: Pagado' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(lastQuery()).not.toHaveProperty('status'));
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Estado' })).toBeTruthy();
  });

  it('filters by payment method', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Método de pago' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Tarjeta' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ payment_method_type: ['card'] }));
    expect(screen.getByRole('button', { name: 'Método: Tarjeta' })).toBeTruthy();
  });

  it('changes the date window to all dates or a valid range', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Fecha: últimos 30 días' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Todas las fechas' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ date_filter: 'all' }));
    expect(screen.getByRole('button', { name: 'Fecha: todas' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fecha: todas' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Rango' }));
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-20' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(screen.getByRole('button', { name: 'Aplicar rango' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-20' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar rango' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ date_filter: 'range', from_date: '2026-10-01', to_date: '2026-10-20' }));
    expect(screen.getByRole('button', { name: 'Fecha: 1 oct – 20 oct' })).toBeTruthy();
  });

  it('sorts by date from the column header', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    const header = screen.getByRole('columnheader', { name: /Fecha/ });
    expect(header.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(within(header).getByRole('button'));
    await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'placed_at' }));
    expect(screen.getByRole('columnheader', { name: /Fecha/ }).getAttribute('aria-sort')).toBe('ascending');
  });

  it('paginates with cursors and keeps previous cursors for Anterior', async () => {
    listAdminOrders.mockResolvedValueOnce(page({ next_cursor: 'c2', total: 60 }));
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(screen.getByRole('status').textContent).toBe('1–8 de 60 pedidos');
    expect(screen.getByRole('button', { name: '‹ Anterior' }).hasAttribute('disabled')).toBe(true);

    listAdminOrders.mockResolvedValueOnce(page({ next_cursor: null, total: 60 }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }));
    await waitFor(() => expect(lastQuery()).toMatchObject({ cursor: 'c2' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('26–33 de 60 pedidos'));
    expect(screen.getByRole('button', { name: 'Siguiente ›' }).hasAttribute('disabled')).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: '‹ Anterior' }));
    await waitFor(() => expect(lastQuery()).not.toHaveProperty('cursor'));
  });

  it('changes the page size and restarts from the first page', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Filas por página'), { target: { value: '50' } });
    await waitFor(() => expect(lastQuery()).toMatchObject({ limit: 50 }));
    expect(lastQuery()).not.toHaveProperty('cursor');
    expect(Array.from(screen.getByLabelText('Filas por página').querySelectorAll('option')).map((option) => option.value)).toEqual(['25', '50', '100']);
  });

  it('shows the error state and retries', async () => {
    listAdminOrders.mockResolvedValueOnce({ ok: false, status: 500, code: 'internal_error' });
    render(<OrdersView />);
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar los pedidos');
    expect(screen.getByText('Puede ser la conexión. Tus pedidos están a salvo.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
    expect(listAdminOrders).toHaveBeenCalledTimes(2);
  });

  it('shows the first-order empty state when there is nothing and no filter', async () => {
    listAdminOrders.mockResolvedValue(page({ items: [], total: 0, pending_dispatch_count: 0 }));
    render(<OrdersView />);
    expect(await screen.findByRole('heading', { name: 'Aún no llega el primer pedido' })).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('explains an empty result under filters and offers to clear them', async () => {
    render(<OrdersView />);
    await screen.findByRole('table');
    listAdminOrders.mockResolvedValue(page({ items: [], total: 0 }));
    fireEvent.click(screen.getByRole('button', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cancelado' }));
    expect(await screen.findByRole('heading', { name: 'No hay pedidos con estos filtros' })).toBeTruthy();
    listAdminOrders.mockResolvedValue(page());
    fireEvent.click(within(screen.getByRole('region', { name: 'Lista de pedidos' })).getByRole('button', { name: 'Limpiar filtros' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });

  it('restores the filters of the address bar', async () => {
    window.history.replaceState(null, '', '/admin/pedidos/?pending_dispatch=true');
    render(<OrdersView />);
    await screen.findByRole('table');
    expect(lastQuery()).toMatchObject({ pending_dispatch: true, date_filter: 'all' });
  });
});

describe('OrdersView at 390 px (F2: S3)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });

  it('lists cards with the Por despachar and Todos chips, starting on Por despachar', async () => {
    render(<OrdersView />);
    expect(await screen.findByRole('button', { name: 'Por despachar · 6' })).toBeTruthy();
    expect(lastQuery()).toMatchObject({ pending_dispatch: true, date_filter: 'all' });
    expect(screen.getByRole('button', { name: 'Por despachar · 6' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByPlaceholderText('Número o cliente')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('214 pedidos pagados esperan despacho');

    const card = screen.getByRole('link', { name: /ORD-7K2M9Q4X/ });
    expect(card.getAttribute('href')).toBe(`/admin/pedido/?id=${mockOrderRows[0].id}`);
    expect(within(card).getByText('María Fernanda Ruiz · Medellín, Antioquia')).toBeTruthy();
    expect(within(card).getByText('20 oct, 9:12 a. m. · Nequi')).toBeTruthy();
    expect(within(card).getByText('$112.100')).toBeTruthy();
    expect(within(card).getByText('Pagado')).toBeTruthy();
  });

  it('switches to Todos and loads more orders by appending the next page', async () => {
    listAdminOrders.mockResolvedValue(page({ next_cursor: 'c2' }));
    render(<OrdersView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Todos' }));
    await waitFor(() => expect(lastQuery()).toEqual({ date_filter: 'last_30_days', sort: '-placed_at', limit: 25 }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('214 pedidos · los más recientes primero'));

    listAdminOrders.mockResolvedValue(page({ items: [{ ...mockOrderRows[0], id: 'x', order_number: 'ORD-NEXT0001' }], next_cursor: null }));
    fireEvent.click(screen.getByRole('button', { name: 'Cargar más pedidos' }));
    expect(await screen.findByRole('link', { name: /ORD-NEXT0001/ })).toBeTruthy();
    expect(lastQuery()).toMatchObject({ cursor: 'c2' });
    expect(screen.getAllByRole('link', { name: /ORD-7K2M9Q4X/ })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Cargar más pedidos' })).toBeNull();
  });

  it('shows the error state with Reintentar', async () => {
    listAdminOrders.mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' });
    render(<OrdersView />);
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar los pedidos');
  });
});
