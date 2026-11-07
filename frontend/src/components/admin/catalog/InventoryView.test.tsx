import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MOCK_GENERATED_AT,
  filterInventoryVariants,
  mockInventoryVariants,
  mockMovementPage,
  mockMovements,
  mockSelectedVariant,
  mockVariantLotPage,
  mockVariantLots,
} from '../../../mocks/admin-inventory';
import type { AdminVariantLotPage } from '../../../lib/admin/catalog';
import { InventoryView } from './InventoryView';

const { listAdminInventoryVariants, getAdminInventoryVariant, listAdminVariantLots, listAdminInventoryMovements, receiveAdminVariantLot } = vi.hoisted(() => ({
  listAdminInventoryVariants: vi.fn(),
  getAdminInventoryVariant: vi.fn(),
  listAdminVariantLots: vi.fn(),
  listAdminInventoryMovements: vi.fn(),
  receiveAdminVariantLot: vi.fn(),
}));

vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()),
  listAdminInventoryVariants,
  getAdminInventoryVariant,
  listAdminVariantLots,
  listAdminInventoryMovements,
  receiveAdminVariantLot,
}));

const ok = <T,>(data: T, etag: string | null = null) => ({ ok: true as const, etag, data });
const variantPage = (query: Parameters<typeof filterInventoryVariants>[0] = {}) => {
  const items = filterInventoryVariants(query);
  return ok({ items, next_cursor: null, total: items.length, generated_at: MOCK_GENERATED_AT });
};
const lastListQuery = () => listAdminInventoryVariants.mock.calls.at(-1)![0];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/inventario/');
  listAdminInventoryVariants.mockImplementation(async (query) => variantPage(query));
  getAdminInventoryVariant.mockImplementation(async (id: string) => ok(mockInventoryVariants.find((item) => item.variant_id === id)!, '"3"'));
  listAdminVariantLots.mockResolvedValue(ok(mockVariantLotPage));
  listAdminInventoryMovements.mockResolvedValue(ok(mockMovementPage));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('InventoryView variant list (F4: S4)', () => {
  it('shows the loading skeleton, then the variants with the server stock flags', async () => {
    render(<InventoryView />);
    expect(screen.getByLabelText('Cargando variantes').getAttribute('aria-busy')).toBe('true');

    const list = await screen.findByRole('list');
    const rows = within(list).getAllByRole('button');
    expect(rows).toHaveLength(mockInventoryVariants.length);
    expect(rows[0].textContent).toBe('Finca El Mirador250 g · Grano entero18');
    expect(rows[1].textContent).toBe('Finca El Mirador250 g · Fina4Poco stock');
    expect(rows[2].textContent).toBe('Finca El Mirador500 g · Fina0Agotado');
    expect(rows[5].textContent).toBe('Chocolate oscuro 75 %Barra de 80 g9Poco stock');
    expect(rows[6].textContent).toBe('Chocolate oscuro 100 %Barra de 80 g22');
    expect(rows[7].textContent).toContain('Archivada');
    expect(rows[0].getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('heading', { level: 1, name: 'Inventario y lotes' })).toBeTruthy();
    expect(screen.queryByLabelText('Filas por página')).toBeNull();
  });

  it('asks for the defaults first and mirrors nothing in the address bar', async () => {
    render(<InventoryView />);
    await screen.findByRole('list');
    expect(listAdminInventoryVariants).toHaveBeenCalledWith({ limit: 25 });
    expect(window.location.search).toBe('');
  });

  it('reads the SKU from the Producto link, searches with it and mirrors it', async () => {
    window.history.replaceState(null, '', '/admin/inventario/?search=ML-MIR-250-GE');
    render(<InventoryView />);
    await screen.findByRole('list');
    expect(lastListQuery()).toEqual({ search: 'ML-MIR-250-GE', limit: 25 });
    expect((screen.getByRole('searchbox', { name: 'Buscar variante' }) as HTMLInputElement).value).toBe('ML-MIR-250-GE');
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(1);
    expect(window.location.search).toBe('?search=ML-MIR-250-GE');
    expect(screen.getByRole('heading', { level: 2, name: 'Finca El Mirador · 250 g · Grano entero' })).toBeTruthy();
  });

  it('narrows to one product from product_id in the address bar and lets the person remove it', async () => {
    const productId = mockSelectedVariant.product_id;
    window.history.replaceState(null, '', `/admin/inventario/?product_id=${productId}`);
    render(<InventoryView />);
    await screen.findByRole('list');
    expect(lastListQuery()).toEqual({ product_id: productId, limit: 25 });
    expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(3);

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Producto' }));
    await waitFor(() => expect(lastListQuery()).toEqual({ limit: 25 }));
    expect(window.location.search).toBe('');
  });

  it('searches after a pause in typing', async () => {
    render(<InventoryView />);
    await screen.findByRole('list');
    vi.useFakeTimers();
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar variante' }), { target: { value: 'chocolate' } });
    expect(lastListQuery()).toEqual({ limit: 25 });
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    vi.useRealTimers();
    await waitFor(() => expect(lastListQuery()).toEqual({ search: 'chocolate', limit: 25 }));
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(3));
  });

  it('filters low or empty stock through the API and mirrors it', async () => {
    render(<InventoryView />);
    await screen.findByRole('list');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros' })).getByRole('button', { name: 'Stock' }));
    await waitFor(() => expect(lastListQuery()).toEqual({ stock: 'low_or_empty', limit: 25 }));
    expect(window.location.search).toBe('?stock=low_or_empty');
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(5));

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(lastListQuery()).toEqual({ limit: 25 }));
  });

  it('filters by variant status through the API', async () => {
    render(<InventoryView />);
    await screen.findByRole('list');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros' })).getByRole('button', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('radio', { name: 'Archivadas' }));
    await waitFor(() => expect(lastListQuery()).toEqual({ status: 'archived', limit: 25 }));
    expect(window.location.search).toBe('?status=archived');
    await waitFor(() => expect(within(screen.getByRole('list')).getAllByRole('button')).toHaveLength(1));
  });

  it('shows the no-match state and clears everything from it', async () => {
    window.history.replaceState(null, '', '/admin/inventario/?search=nada');
    render(<InventoryView />);
    expect(await screen.findByRole('heading', { name: 'Ninguna variante coincide' })).toBeTruthy();
    expect(screen.queryByText('Registrar entrada de lote')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' }).at(-1)!);
    await screen.findByRole('list');
    expect((screen.getByRole('searchbox', { name: 'Buscar variante' }) as HTMLInputElement).value).toBe('');
  });

  it('shows the error state with a retry', async () => {
    listAdminInventoryVariants.mockResolvedValueOnce({ ok: false, status: 500, code: 'internal_error' });
    render(<InventoryView />);
    expect(await screen.findByText('No pudimos cargar las variantes.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('list')).toBeTruthy();
  });

  it('pages with the cursor', async () => {
    listAdminInventoryVariants.mockImplementation(async (query) => (query.cursor
      ? ok({ items: mockInventoryVariants.slice(2), next_cursor: null, total: 8, generated_at: MOCK_GENERATED_AT })
      : ok({ items: mockInventoryVariants.slice(0, 2), next_cursor: 'c1', total: 8, generated_at: MOCK_GENERATED_AT })));
    render(<InventoryView />);
    await screen.findByRole('list');
    expect(screen.getByRole('status').textContent).toBe('1–2 de 8 variantes');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }));
    await waitFor(() => expect(lastListQuery()).toEqual({ cursor: 'c1', limit: 25 }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('26–31 de 8 variantes'));
  });

  it('offers no manual adjustment, damage or return controls (L6)', async () => {
    render(<InventoryView />);
    await screen.findByRole('button', { name: 'Registrar entrada de lote' });
    expect(screen.queryByText(/Ajustar/)).toBeNull();
    expect(screen.queryByRole('button', { name: /ajust|daño|devoluci/i })).toBeNull();
  });
});

describe('InventoryView selected variant (F4: S4)', () => {
  it('shows the stock summary the server sent', async () => {
    render(<InventoryView />);
    await screen.findByRole('button', { name: 'Registrar entrada de lote' });
    expect(screen.getByText('SKU ML-MIR-250-GE')).toBeTruthy();
    const cards = screen.getByText('Disponible', { selector: 'span' }).parentElement!.parentElement!;
    expect(cards.textContent).toContain('Disponible18unidades para vender');
    expect(cards.textContent).toContain('Reservado3en pedidos esperando pago (30 min)');
    expect(cards.textContent).toContain('Lotes activos3con unidades disponibles');
  });

  it('selects another variant and loads its lots and ledger', async () => {
    render(<InventoryView />);
    await screen.findByRole('button', { name: 'Registrar entrada de lote' });
    const second = mockInventoryVariants[1];
    fireEvent.click(within(screen.getByRole('list')).getAllByRole('button')[1]);
    await waitFor(() => expect(listAdminVariantLots).toHaveBeenLastCalledWith(second.variant_id, { limit: 100 }));
    expect(listAdminInventoryMovements).toHaveBeenLastCalledWith(second.variant_id, { limit: 25 });
    expect(await screen.findByRole('heading', { level: 2, name: 'Finca El Mirador · 250 g · Fina' })).toBeTruthy();
  });

  it('renders the lots oldest first with the server flags and dates', async () => {
    render(<InventoryView />);
    const table = (await screen.findByRole('heading', { name: 'Lotes' })).closest('section')!;
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent);
    expect(headers).toEqual(['Lote', 'Tueste', 'Vence', 'Disponible', 'Reservado', 'Estado']);
    const rows = await within(table).findAllByRole('row');
    const text = rows.slice(1).map((row) => row.textContent);
    expect(text[0]).toBe('MIR-082020 ago 2026hace 61 días—00Lote agotado');
    expect(text[1]).toBe('MIR-0915Sale primero15 sep 2026hace 35 días15 mar 202722Tueste antiguo');
    expect(text[2]).toBe('MIR-093030 sep 2026hace 20 días30 mar 202761Lote activo');
    expect(text[3]).toBe('MIR-101414 oct 2026hace 6 días—100Lote activo');
  });

  it('shows exactly 30 days unflagged and zero units without inventing a flag', async () => {
    const page: AdminVariantLotPage = {
      ...mockVariantLotPage,
      items: [
        { ...mockVariantLots[3], id: 'lot-30', lot_code: 'MIR-0920', production_date: '2026-09-20', quantity: 5, old_roast: false },
        { ...mockVariantLots[3], id: 'lot-31', lot_code: 'MIR-0919', production_date: '2026-09-19', quantity: 0, old_roast: true, status: 'active' },
      ],
    };
    listAdminVariantLots.mockResolvedValue(ok(page));
    render(<InventoryView />);
    const table = (await screen.findByRole('heading', { name: 'Lotes' })).closest('section')!;
    const rows = await within(table).findAllByRole('row');
    expect(rows[1].textContent).toContain('hace 30 días');
    expect(rows[1].textContent).toContain('Lote activo');
    expect(rows[1].textContent).not.toContain('Tueste antiguo');
    expect(rows[2].textContent).toContain('hace 31 días');
    expect(rows[2].textContent).toContain('Tueste antiguo');
  });

  it('renders the ledger with display kinds, signed quantities and actor names', async () => {
    render(<InventoryView />);
    const section = (await screen.findByRole('heading', { name: 'Historial de movimientos' })).closest('section')!;
    const rows = await within(section).findAllByRole('row');
    expect(within(section).getAllByRole('columnheader').map((header) => header.textContent)).toEqual(['Fecha', 'Movimiento', 'Lote', 'Cantidad', 'Detalle', 'Quién']);
    const text = rows.slice(1).map((row) => row.textContent);
    expect(text).toEqual([
      '20 oct, 9:12 a. m.ReservaMIR-0915−2Pedido ORD-7K2M9Q4X esperando pagoSistema',
      '20 oct, 9:12 a. m.ReservaMIR-0930−1Pedido ORD-7K2M9Q4X esperando pagoSistema',
      '19 oct, 4:40 p. m.LiberaciónMIR-0915+1Se liberó la reserva de ORD-8M4Q1Z7DSistema',
      '19 oct, 11:05 a. m.DañoMIR-0930−1Bolsa rota en bodegaAndrés Peña',
      '18 oct, 6:30 p. m.VentaMIR-0915−1Pedido ORD-9P3K7M2QSistema',
      '17 oct, 3:15 p. m.AsignaciónMIR-1014−1Pedido ORD-5T8N2R6VPersona no disponible',
      '14 oct, 8:00 a. m.EntradaMIR-1014+10Tostión del 14 de octubreAndrés Peña',
    ]);
    expect(mockMovements).toHaveLength(7);
  });

  it('appends the next ledger page on request', async () => {
    listAdminInventoryMovements.mockImplementation(async (_id, query) => (query.cursor
      ? ok({ ...mockMovementPage, items: mockMovements.slice(2), next_cursor: null })
      : ok({ ...mockMovementPage, items: mockMovements.slice(0, 2), next_cursor: 'm1' })));
    render(<InventoryView />);
    const section = (await screen.findByRole('heading', { name: 'Historial de movimientos' })).closest('section')!;
    await within(section).findAllByRole('row');
    expect(within(section).getAllByRole('row')).toHaveLength(3);
    fireEvent.click(within(section).getByRole('button', { name: 'Ver más movimientos' }));
    await waitFor(() => expect(within(section).getAllByRole('row')).toHaveLength(8));
    expect(listAdminInventoryMovements).toHaveBeenLastCalledWith(mockSelectedVariant.variant_id, { limit: 25, cursor: 'm1' });
    expect(within(section).queryByRole('button', { name: 'Ver más movimientos' })).toBeNull();
  });

  it('shows an error with retry when the ledger fails', async () => {
    listAdminInventoryMovements.mockResolvedValueOnce({ ok: false, status: 503, code: 'dependency_unavailable' });
    render(<InventoryView />);
    const section = (await screen.findByRole('heading', { name: 'Historial de movimientos' })).closest('section')!;
    expect(await within(section).findByText('No pudimos cargar el historial.')).toBeTruthy();
    fireEvent.click(within(section).getByRole('button', { name: 'Reintentar' }));
    expect((await within(section).findAllByRole('row')).length).toBeGreaterThan(1);
  });
});

describe('InventoryView lot receipt (F4: S4)', () => {
  const open = async () => {
    render(<InventoryView />);
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar entrada de lote' }));
    return screen.findByRole('dialog', { name: 'Registrar entrada de lote' });
  };
  const fill = (dialog: HTMLElement, values: { code?: string; roast?: string; expiry?: string; quantity?: string; note?: string }) => {
    if (values.code !== undefined) fireEvent.change(within(dialog).getByLabelText('Código del lote'), { target: { value: values.code } });
    if (values.roast !== undefined) fireEvent.change(within(dialog).getByLabelText('Fecha de tueste'), { target: { value: values.roast } });
    if (values.expiry !== undefined) fireEvent.change(within(dialog).getByLabelText(/Vence/), { target: { value: values.expiry } });
    if (values.quantity !== undefined) fireEvent.change(within(dialog).getByLabelText('Cantidad que entra'), { target: { value: values.quantity } });
    if (values.note !== undefined) fireEvent.change(within(dialog).getByLabelText(/Nota/), { target: { value: values.note } });
  };
  const receipt = { product_id: mockSelectedVariant.product_id, product_version: 4, variant_id: mockSelectedVariant.variant_id, lot_id: 'lot-new', lot_code: 'MIR-1020', lot_created: true, movement_id: 'mov-new', reason: 'receipt' as const, quantity_received: 24, quantity_after: 24 };

  it('opens the variant-first form with the canvas fields', async () => {
    const dialog = await open();
    expect(within(dialog).getByText('Finca El Mirador · 250 g · Grano entero')).toBeTruthy();
    for (const label of ['Código del lote', 'Fecha de tueste', 'Cantidad que entra']) expect(within(dialog).getByLabelText(label)).toBeTruthy();
    expect(within(dialog).getByText('Único por producto. Va impreso en la bolsa.')).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Registrar entrada' })).toBeTruthy();
    expect(receiveAdminVariantLot).not.toHaveBeenCalled();
  });

  it('shows validation errors and sends nothing', async () => {
    const dialog = await open();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText('Escribe el código del lote.')).toBeTruthy();
    expect(within(dialog).getByText('Elige la fecha de tueste.')).toBeTruthy();
    expect(within(dialog).getByText('Escribe cuántas unidades entran.')).toBeTruthy();

    fill(dialog, { code: 'MIR-1020', roast: '2026-10-20', expiry: '2026-10-01', quantity: '24' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText('Debe ser igual o posterior a la fecha de tueste.')).toBeTruthy();
    expect(receiveAdminVariantLot).not.toHaveBeenCalled();
  });

  it('previews the available count from the quantity typed', async () => {
    const dialog = await open();
    fill(dialog, { quantity: '24' });
    expect(within(dialog).getByText(/Disponible pasará de/).textContent).toBe('Disponible pasará de 18 a 42.');
  });

  it('registers the receipt with the product ETag, replaces it and reads the stock again', async () => {
    const dialog = await open();
    // From the write on, the server is at product version 4.
    receiveAdminVariantLot.mockResolvedValue(ok(receipt, '"4"'));
    getAdminInventoryVariant.mockImplementation(async (id: string) => ok(mockInventoryVariants.find((item) => item.variant_id === id)!, '"4"'));
    fill(dialog, { code: ' MIR-1020 ', roast: '2026-10-20', quantity: '24', note: 'Tostión del día' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));

    await waitFor(() => expect(receiveAdminVariantLot).toHaveBeenCalledTimes(1));
    expect(receiveAdminVariantLot).toHaveBeenCalledWith(mockSelectedVariant.variant_id, '"3"', {
      lot_code: 'MIR-1020',
      production_date: '2026-10-20',
      quantity: 24,
      note: 'Tostión del día',
    });
    expect(await screen.findByText('Entrada registrada en el lote MIR-1020: +24 unidades.')).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    // Variant detail, list, lots and ledger are read again.
    await waitFor(() => expect(getAdminInventoryVariant).toHaveBeenCalledTimes(2));
    expect(listAdminVariantLots).toHaveBeenCalledTimes(2);
    expect(listAdminInventoryMovements).toHaveBeenCalledTimes(2);
    expect(listAdminInventoryVariants).toHaveBeenCalledTimes(2);

    // The next receipt carries the ETag the server returned for the new product version.
    receiveAdminVariantLot.mockResolvedValue(ok({ ...receipt, lot_created: false, product_version: 5 }, '"5"'));
    fireEvent.click(screen.getByRole('button', { name: 'Registrar entrada de lote' }));
    const again = await screen.findByRole('dialog', { name: 'Registrar entrada de lote' });
    fill(again, { code: 'MIR-1020', roast: '2026-10-20', quantity: '1' });
    fireEvent.click(within(again).getByRole('button', { name: 'Registrar entrada' }));
    await waitFor(() => expect(receiveAdminVariantLot).toHaveBeenCalledTimes(2));
    expect(receiveAdminVariantLot.mock.calls[1][1]).toBe('"4"');
  });

  it('maps server validation errors onto the fields', async () => {
    receiveAdminVariantLot.mockResolvedValue({ ok: false, status: 422, code: 'validation_failed', problem: { type: 't', title: 't', status: 422, code: 'validation_failed', errors: [{ field: 'quantity', code: 'out_of_range', message: 'x' }] } });
    const dialog = await open();
    fill(dialog, { code: 'MIR-1020', roast: '2026-10-20', quantity: '999999999' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText('La cantidad no es válida.')).toBeTruthy();
    expect(screen.queryByText(/Entrada registrada/)).toBeNull();
  });

  it('explains a lot that exists with other dates and keeps the form', async () => {
    receiveAdminVariantLot.mockResolvedValue({ ok: false, status: 409, code: 'lot_conflict' });
    const dialog = await open();
    fill(dialog, { code: 'MIR-0915', roast: '2026-10-20', quantity: '3' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText(/Ese código ya existe con otras fechas/)).toBeTruthy();
    expect((within(dialog).getByLabelText('Código del lote') as HTMLInputElement).value).toBe('MIR-0915');
  });

  it('shows the version conflict with Recargar, which reads the product again and keeps the form (412)', async () => {
    receiveAdminVariantLot.mockResolvedValue({ ok: false, status: 412, code: 'version_conflict' });
    const dialog = await open();
    fill(dialog, { code: 'MIR-1020', roast: '2026-10-20', quantity: '24' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeTruthy();
    expect(screen.queryByText(/Entrada registrada/)).toBeNull();

    getAdminInventoryVariant.mockImplementation(async (id: string) => ok(mockInventoryVariants.find((item) => item.variant_id === id)!, '"9"'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect(getAdminInventoryVariant).toHaveBeenCalledTimes(2));
    expect(within(dialog).queryByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeNull();
    expect((within(dialog).getByLabelText('Código del lote') as HTMLInputElement).value).toBe('MIR-1020');

    receiveAdminVariantLot.mockResolvedValue(ok(receipt, '"10"'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    await waitFor(() => expect(receiveAdminVariantLot).toHaveBeenCalledTimes(2));
    expect(receiveAdminVariantLot.mock.calls[1][1]).toBe('"9"');
  });

  it('shows a generic failure for network and server errors', async () => {
    receiveAdminVariantLot.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
    const dialog = await open();
    fill(dialog, { code: 'MIR-1020', roast: '2026-10-20', quantity: '24' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Registrar entrada' }));
    expect(await within(dialog).findByText('No pudimos registrar la entrada. Intenta de nuevo.')).toBeTruthy();
  });

  it('never offers the receipt without the product version', async () => {
    getAdminInventoryVariant.mockResolvedValue({ ok: false, status: 503, code: 'dependency_unavailable' });
    render(<InventoryView />);
    expect(await screen.findByText('No pudimos leer la versión del producto, necesaria para registrar entradas.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Registrar entrada de lote' })).toBeNull();
    expect(receiveAdminVariantLot).not.toHaveBeenCalled();
  });
});

describe('InventoryView below 1024 px (A-Inventario-768)', () => {
  afterEach(() => { window.innerWidth = 1024; });

  it('swaps the list for a Variante select and still loads the chosen variant', async () => {
    window.innerWidth = 768;
    render(<InventoryView />);
    const select = (await screen.findByRole('combobox', { name: 'Variante' })) as HTMLSelectElement;
    await waitFor(() => expect(select.options).toHaveLength(mockInventoryVariants.length));
    expect(select.options[0].textContent).toBe('Finca El Mirador · 250 g · Grano entero');
    expect(screen.queryByRole('list')).toBeNull();

    fireEvent.change(select, { target: { value: mockInventoryVariants[3].variant_id } });
    expect(await screen.findByRole('heading', { level: 2, name: 'Finca La María · 250 g · Grano entero' })).toBeTruthy();
    expect(listAdminVariantLots).toHaveBeenLastCalledWith(mockInventoryVariants[3].variant_id, { limit: 100 });
  });
});
