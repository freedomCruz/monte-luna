import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockOrderMetrics, mockOrderRows, mockStaffOrderMetrics, mockTodayMetrics } from '../../../mocks/admin-orders';
import type { AdminOrderMetrics } from '../../../lib/admin/orders';
import { InicioView } from './InicioView';

const mocks = vi.hoisted(() => ({
  getAdminOrderMetrics: vi.fn(),
  role: { current: 'owner' as 'owner' | 'staff' },
}));

vi.mock('../../../lib/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/orders')>()),
  getAdminOrderMetrics: mocks.getAdminOrderMetrics,
}));

vi.mock('../shell/AdminShell', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../shell/AdminShell')>()),
  useAdminSession: () => ({
    user: { id: 'u1', email: 'laura@monteluna.co', display_name: 'Laura Ríos', role: mocks.role.current, status: 'active' },
    etag: '"1"',
  }),
}));

const ok = (data: AdminOrderMetrics) => ({ ok: true as const, data, etag: null });
const lastQuery = () => mocks.getAdminOrderMetrics.mock.calls.at(-1)![0];
const originalWidth = window.innerWidth;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-20T15:00:00Z'));
  mocks.role.current = 'owner';
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  mocks.getAdminOrderMetrics.mockImplementation(async () => ok(mockOrderMetrics));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
});

describe('InicioView (F4: S2)', () => {
  it('greets, dates the page in Colombia and asks for the last 30 days by default', async () => {
    render(<InicioView />);
    expect(await screen.findByRole('heading', { name: 'Hola, Laura', level: 1 })).toBeTruthy();
    expect(screen.getByText('Martes 20 de octubre de 2026 · hora de Colombia')).toBeTruthy();
    expect(lastQuery()).toEqual({ period: 'last_30_days' });
  });

  it('shows the four KPIs with their deltas and the comparison', async () => {
    render(<InicioView />);
    const kpis = await screen.findByRole('region', { name: 'Indicadores del periodo' });
    const read = (title: string) => within(kpis).getByText(title).parentElement!.textContent;
    expect(read('Ventas pagadas')).toContain('$4.860.000');
    expect(read('Ventas pagadas')).toContain('▲ +12 %');
    expect(read('Ventas pagadas')).toContain('vs. 30 días anteriores');
    expect(read('Pedidos')).toContain('92');
    expect(read('Pedidos')).toContain('▲ +8 %');
    expect(read('Ticket promedio')).toContain('$52.800');
    expect(read('Unidades vendidas')).toContain('168');
    expect(read('Unidades vendidas')).toContain('▼ −2 %');
  });

  it('switches period and shows a dash when there is nothing to compare with', async () => {
    render(<InicioView />);
    const group = await screen.findByRole('group', { name: 'Periodo' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Hoy', '7 días', '30 días', 'Rango']);
    expect(within(group).getByRole('button', { name: '30 días' }).getAttribute('aria-pressed')).toBe('true');

    mocks.getAdminOrderMetrics.mockImplementation(async () => ok(mockTodayMetrics));
    fireEvent.click(within(group).getByRole('button', { name: 'Hoy' }));
    await waitFor(() => expect(lastQuery()).toEqual({ period: 'today' }));
    expect(await screen.findByRole('heading', { name: 'Ventas por hora · hoy' })).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Indicadores del periodo' })).getByText('Unidades vendidas').parentElement!.textContent).toContain('—');
    expect(within(screen.getByRole('group', { name: 'Periodo' })).getByRole('button', { name: 'Hoy' }).getAttribute('aria-pressed')).toBe('true');

    mocks.getAdminOrderMetrics.mockImplementation(async () => ok({ ...mockOrderMetrics, period: 'last_7_days' }));
    fireEvent.click(screen.getByRole('button', { name: '7 días' }));
    await waitFor(() => expect(lastQuery()).toEqual({ period: 'last_7_days' }));
  });

  it('applies a custom range and rejects reversed or future dates', async () => {
    render(<InicioView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Rango' }));
    const apply = await screen.findByRole('button', { name: 'Aplicar rango' });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-19' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    expect(apply.hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-21' } });
    expect(apply.hasAttribute('disabled')).toBe(true);

    mocks.getAdminOrderMetrics.mockImplementation(async () => ok({ ...mockOrderMetrics, period: 'range', from_at: '2026-10-01T05:00:00Z', to_at: '2026-10-20T05:00:00Z' }));
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-19' } });
    fireEvent.click(apply);
    await waitFor(() => expect(lastQuery()).toEqual({ period: 'range', from_date: '2026-10-01', to_date: '2026-10-19' }));
    expect(await screen.findByRole('button', { name: '1 oct – 19 oct 2026' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Ventas por día · 1 al 19 de octubre' })).toBeTruthy();
    expect(screen.getAllByText('vs. 19 días anteriores').length).toBeGreaterThan(0);
  });

  it('draws one bar per bucket with a text alternative and the previous-period line', async () => {
    const { container } = render(<InicioView />);
    const chart = await screen.findByRole('img', { name: /Ventas por día · últimos 30 días\. Ventas entre \$118\.000 y \$284\.000 por día\./ });
    expect(chart).toBeTruthy();
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(30);
    expect(container.querySelector('polyline')).not.toBeNull();
    expect(screen.getByText('Este periodo')).toBeTruthy();
    expect(screen.getByText('Periodo anterior')).toBeTruthy();
    // The tooltip starts on the best day and follows the pointer.
    expect(screen.getByText('Ventas $284.000')).toBeTruthy();
    fireEvent.mouseEnter(container.querySelectorAll('[data-bar]')[0]);
    expect(screen.getByText('Ventas $118.000')).toBeTruthy();
  });

  it('toggles between the chart and the table of the same series', async () => {
    const { container } = render(<InicioView />);
    const toggle = await screen.findByRole('button', { name: 'Ver tabla' });
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(toggle);
    const section = screen.getByRole('region', { name: /Ventas por día/ });
    const table = within(section).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Fecha', 'Ventas', 'Periodo anterior']);
    expect(within(table).getAllByRole('row')).toHaveLength(31);
    expect(container.querySelector('[data-bar]')).toBeNull();
    expect(screen.getByRole('button', { name: 'Ver gráfico' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Ver gráfico' }));
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(30);
  });

  it('lists the order alerts and keeps the refund alert for owners', async () => {
    render(<InicioView />);
    const section = await screen.findByRole('region', { name: 'Requiere atención' });
    expect(within(section).getByText('2')).toBeTruthy();
    const dispatch = within(section).getByRole('link', { name: /Pedidos pagados por despachar/ });
    expect(dispatch.getAttribute('href')).toBe('/admin/pedidos/?pending_dispatch=true');
    expect(dispatch.textContent).toContain('El más antiguo espera desde el 17 oct.');
    expect(within(section).getByText('Reembolso manual pendiente')).toBeTruthy();
    expect(within(section).queryByText(/Stock|tostados|Factura/i)).toBeNull();
  });

  it('shows staff no refund information at all', async () => {
    mocks.role.current = 'staff';
    mocks.getAdminOrderMetrics.mockImplementation(async () => ok(mockStaffOrderMetrics));
    render(<InicioView />);
    const section = await screen.findByRole('region', { name: 'Requiere atención' });
    expect(within(section).getByRole('link', { name: /Pedidos pagados por despachar/ })).toBeTruthy();
    expect(within(section).queryByText(/Reembolso/)).toBeNull();
    expect(within(section).getByText('1')).toBeTruthy();
  });

  it('says so when nothing needs attention', async () => {
    mocks.getAdminOrderMetrics.mockImplementation(async () => ok({ ...mockOrderMetrics, attention: { role: 'owner', pending_dispatch_count: 0, oldest_pending_dispatch_paid_at: null, manual_refund_count: 0 } }));
    render(<InicioView />);
    expect(await screen.findByText('Nada por atender ahora.')).toBeTruthy();
  });

  it('lists the latest orders with the canvas columns and a link to Pedidos', async () => {
    render(<InicioView />);
    const section = await screen.findByRole('region', { name: 'Últimos pedidos' });
    expect(within(section).getByRole('link', { name: 'Ver todos los pedidos' }).getAttribute('href')).toBe('/admin/pedidos/');
    const table = within(section).getByRole('table');
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Pedido', 'Fecha', 'Cliente', 'Destino', 'Total', 'Estado', 'Pago']);
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(7);
    expect(within(rows[1]).getByRole('link', { name: 'ORD-7K2M9Q4X' }).getAttribute('href')).toBe(`/admin/pedido/?id=${mockOrderRows[0].id}`);
    expect(within(rows[1]).getByText('20 oct, 9:12 a. m.')).toBeTruthy();
    expect(within(rows[1]).getByText('$112.100')).toBeTruthy();
    expect(within(rows[1]).getByText('Pagado')).toBeTruthy();
    expect(within(rows[1]).getByText('Nequi')).toBeTruthy();
  });

  it('shows the loading skeleton, then an error with Reintentar', async () => {
    mocks.getAdminOrderMetrics.mockImplementationOnce(async () => ({ ok: false as const, status: 500, code: 'internal_error' }));
    render(<InicioView />);
    expect(screen.getByLabelText('Cargando el resumen').getAttribute('aria-busy')).toBe('true');
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar el resumen');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('region', { name: 'Indicadores del periodo' })).toBeTruthy();
    expect(mocks.getAdminOrderMetrics).toHaveBeenCalledTimes(2);
  });

  it('keeps the period controls while an error is shown so another period can be tried', async () => {
    mocks.getAdminOrderMetrics.mockImplementationOnce(async () => ({ ok: false as const, status: 0, code: 'network_error' }));
    render(<InicioView />);
    await screen.findByRole('alert');
    expect(screen.getByRole('group', { name: 'Periodo' })).toBeTruthy();
  });
});

describe('InicioView at 390 px (F4: S2, S8)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });

  it('shows the compact dashboard of A-Inicio-390', async () => {
    const { container } = render(<InicioView />);
    expect(await screen.findByRole('heading', { name: 'Hola, Laura', level: 1 })).toBeTruthy();
    expect(screen.getByText('Martes 20 de octubre')).toBeTruthy();
    const kpis = screen.getByRole('region', { name: 'Indicadores del periodo' });
    expect(within(kpis).queryByText('vs. 30 días anteriores')).toBeNull();
    expect(within(kpis).getByText('Ventas pagadas').parentElement!.textContent).toContain('$4.860.000');
    expect(container.querySelectorAll('[data-bar]')).toHaveLength(30);
    expect(screen.queryByRole('button', { name: 'Ver tabla' })).toBeNull();
    expect(screen.getByText('Máximo $284.000')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Requiere atención · 2' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver: Pedidos pagados por despachar' }).getAttribute('href')).toBe('/admin/pedidos/?pending_dispatch=true');
    expect(screen.getByText('Revísalo desde un computador o una tablet')).toBeTruthy();

    expect(screen.getByRole('link', { name: 'Ver todos' }).getAttribute('href')).toBe('/admin/pedidos/');
    const card = screen.getByRole('link', { name: /ORD-7K2M9Q4X/ });
    expect(card.textContent).toContain('María Fernanda Ruiz · hoy 9:12');
    expect(screen.getByText('En el celular el panel es de consulta. Para editar el catálogo, los cupones o la configuración, usa un computador o una tablet.')).toBeTruthy();
  });

  it('offers the same periods, with Rango as a plain label', async () => {
    render(<InicioView />);
    const group = await screen.findByRole('group', { name: 'Periodo' });
    expect(within(group).getAllByRole('button').map((button) => button.textContent)).toEqual(['Hoy', '7 días', '30 días', 'Rango']);
  });
});
