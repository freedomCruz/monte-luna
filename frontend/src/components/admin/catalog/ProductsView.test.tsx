import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockCategories, mockProductDetail, mockProductPage, mockProductRows, mockProductTypes } from '../../../mocks/admin-products';
import type { AdminProductPage } from '../../../lib/admin/catalog';
import { ProductsView } from './ProductsView';

const { listAdminProducts, listAdminCatalogProductTypes, listAdminCatalogCategories, getAdminProduct, updateAdminProduct } = vi.hoisted(() => ({
  listAdminProducts: vi.fn(),
  getAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  listAdminCatalogProductTypes: vi.fn(),
  listAdminCatalogCategories: vi.fn(),
}));

vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()),
  listAdminProducts,
  getAdminProduct,
  updateAdminProduct,
  listAdminCatalogProductTypes,
  listAdminCatalogCategories,
}));

const page = (overrides: Partial<AdminProductPage> = {}) => ({ ok: true as const, etag: null, data: { ...mockProductPage, ...overrides } });
const lastQuery = () => listAdminProducts.mock.calls.at(-1)![0];

beforeEach(() => {
  window.history.replaceState(null, '', '/admin/productos/');
  listAdminProducts.mockResolvedValue(page());
  getAdminProduct.mockResolvedValue({ ok: true, etag: '"3"', data: mockProductDetail });
  listAdminCatalogProductTypes.mockResolvedValue({ ok: true, etag: null, data: mockProductTypes });
  listAdminCatalogCategories.mockResolvedValue({ ok: true, etag: null, data: mockCategories });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe('ProductsView table (F2: S2)', () => {
  it('shows the loading skeleton and then the canvas columns and row content', async () => {
    render(<ProductsView />);
    expect(screen.getByLabelText('Cargando productos').getAttribute('aria-busy')).toBe('true');

    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader').map((header) => header.textContent?.replace(/[↑↓↕]/, '').trim());
    expect(headers).toEqual(['Producto', 'Tipo', 'Categoría', 'Estado', 'Variantes', 'Precio', 'Stock', 'Acciones']);

    const first = within(table).getAllByRole('row')[1];
    expect(within(first).getByRole('button', { name: 'Finca El Mirador – Geisha Lavado' })).toBeTruthy();
    expect(within(first).getByText('Café')).toBeTruthy();
    expect(within(first).getByText('Cafés de origen')).toBeTruthy();
    expect(within(first).getByText('Publicado')).toBeTruthy();
    expect(within(first).getByText('8')).toBeTruthy();
    expect(within(first).getByText('$38.000 – $72.000')).toBeTruthy();
    expect(within(first).getByText('64')).toBeTruthy();
  });

  it('badges out-of-stock, low-stock and archived rows as the canvas does', async () => {
    render(<ProductsView />);
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    expect(within(rows[3]).getByText('Agotado')).toBeTruthy();
    expect(within(rows[4]).getByText('Poco stock')).toBeTruthy();
    expect(within(rows[5]).getByText('Borrador')).toBeTruthy();
    expect(within(rows[6]).getByText('Archivado')).toBeTruthy();
    expect(within(rows[6]).queryByText('Agotado')).toBeNull();
    expect(within(rows[1]).queryByText(/Agotado|Poco stock/)).toBeNull();
  });

  it('has no selection checkboxes and no bulk bar in this stage (L6)', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Acciones en lote' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Publicar|Archivar/ })).toBeNull();
  });

  it('requests the default view and renders the title, subtitle and Nuevo producto link', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    expect(lastQuery()).toEqual({ sort: 'title', limit: 25 });
    expect(screen.getByRole('status').textContent).toBe('1–6 de 6 productos');
    expect(screen.getByRole('heading', { name: 'Productos', level: 1 })).toBeTruthy();
    expect(screen.getByText('Café y cacao de la tienda. Abre un producto para editar sus variantes, precios e imágenes.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Nuevo producto' }).getAttribute('href')).toBe('/admin/producto/');
  });

  it('sorts by name, price and stock, flipping direction on the same column', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    const header = (name: string) => screen.getAllByRole('columnheader').find((cell) => cell.textContent?.startsWith(name))!;
    expect(header('Producto').getAttribute('aria-sort')).toBe('ascending');

    fireEvent.click(within(header('Producto')).getByRole('button'));
    await waitFor(() => expect(lastQuery().sort).toBe('-title'));
    await waitFor(() => expect(header('Producto').getAttribute('aria-sort')).toBe('descending'));

    fireEvent.click(within(header('Precio')).getByRole('button'));
    await waitFor(() => expect(lastQuery().sort).toBe('price_amount'));
    fireEvent.click(within(header('Precio')).getByRole('button'));
    await waitFor(() => expect(lastQuery().sort).toBe('-price_amount'));
    fireEvent.click(within(header('Stock')).getByRole('button'));
    await waitFor(() => expect(lastQuery().sort).toBe('stock'));
  });

  it('filters by type from the taxonomy menu and clears it', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Tipo' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Cacao' }));
    await waitFor(() => expect(lastQuery().product_type_id).toEqual([mockProductTypes.items[1].id]));
    expect(screen.getByRole('button', { name: 'Tipo: Cacao' })).toBeTruthy();
    expect(window.location.search).toContain('product_type_id=');

    fireEvent.click(screen.getByRole('button', { name: 'Quitar filtro Tipo' }));
    await waitFor(() => expect(lastQuery().product_type_id).toBeUndefined());
  });

  it('filters by category and by publication status', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: 'Categoría' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Chocolates' }));
    await waitFor(() => expect(lastQuery().category_id).toEqual([mockCategories.items[1].id]));

    fireEvent.click(screen.getByRole('button', { name: 'Estado' }));
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Borrador' }));
    await waitFor(() => expect(lastQuery().status).toEqual(['draft']));
  });

  it('toggles the low-or-empty stock filter and clears every filter at once', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros' })).getByRole('button', { name: 'Stock' }));
    await waitFor(() => expect(lastQuery().stock).toBe('low_or_empty'));
    expect(screen.getByRole('button', { name: /Stock: poco o agotado/ }).getAttribute('aria-pressed')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    await waitFor(() => expect(lastQuery().stock).toBeUndefined());
    expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull();
  });

  it('searches by name or SKU after a short pause', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    vi.useFakeTimers();
    fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o SKU'), { target: { value: 'huila' } });
    expect(lastQuery().search).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(400); });
    vi.useRealTimers();
    await waitFor(() => expect(lastQuery().search).toBe('huila'));
    expect(window.location.search).toBe('?search=huila');
  });

  it('restores the filters from the address bar', async () => {
    window.history.replaceState(null, '', `/admin/productos/?status=draft&stock=low_or_empty&sort=-stock&limit=50`);
    render(<ProductsView />);
    await screen.findByRole('table');
    expect(listAdminProducts.mock.calls[0][0]).toEqual({ status: ['draft'], stock: 'low_or_empty', sort: '-stock', limit: 50 });
  });

  it('pages forward and back with cursors', async () => {
    listAdminProducts.mockResolvedValueOnce(page({ next_cursor: 'c2', total: 60 }));
    render(<ProductsView />);
    await screen.findByRole('table');
    expect(screen.getByRole('status').textContent).toBe('1–6 de 60 productos');
    listAdminProducts.mockResolvedValueOnce(page({ next_cursor: null, total: 60 }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente ›' }));
    await waitFor(() => expect(lastQuery().cursor).toBe('c2'));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('26–31 de 60 productos'));
    fireEvent.click(screen.getByRole('button', { name: '‹ Anterior' }));
    await waitFor(() => expect(lastQuery().cursor).toBeUndefined());
  });
});

describe('ProductsView quick view and row actions (F2b: S2, S3)', () => {
  it('opens the quick view from the product name and refreshes the list after saving', async () => {
    updateAdminProduct.mockResolvedValue({ ok: true, etag: '"4"', data: { ...mockProductDetail, status: 'draft', version: 4 } });
    render(<ProductsView />);
    await screen.findByRole('table');
    const calls = listAdminProducts.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Finca El Mirador – Geisha Lavado' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finca El Mirador – Geisha Lavado' });
    expect(getAdminProduct).toHaveBeenCalledWith(mockProductRows[0].id);
    fireEvent.change(await within(dialog).findByLabelText('Estado de publicación'), { target: { value: 'draft' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(listAdminProducts.mock.calls.length).toBeGreaterThan(calls));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('offers only supported actions in the row menu: quick view, edit and, if published, the storefront', async () => {
    render(<ProductsView />);
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    const trigger = (row: HTMLElement, name: string) => within(row).getByRole('button', { name: `Acciones de ${name}` });

    fireEvent.pointerDown(trigger(rows[1], 'Finca El Mirador – Geisha Lavado'), { button: 0, ctrlKey: false });
    const menu = await screen.findByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual(['Vista rápida', 'Editar producto', 'Ver en la tienda']);
    expect(within(menu).getByRole('menuitem', { name: 'Editar producto' }).getAttribute('href')).toBe(`/admin/producto/?id=${mockProductRows[0].id}`);
    expect(within(menu).getByRole('menuitem', { name: 'Ver en la tienda' }).getAttribute('href')).toBe(`/productos/${mockProductRows[0].slug}/`);
    expect(within(menu).queryByText(/stock|Publicar|Archivar/i)).toBeNull();
  });

  it('hides the storefront link for a draft product', async () => {
    render(<ProductsView />);
    const rows = within(await screen.findByRole('table')).getAllByRole('row');
    fireEvent.pointerDown(within(rows[5]).getByRole('button', { name: /^Acciones de/ }), { button: 0, ctrlKey: false });
    const menu = await screen.findByRole('menu');
    expect(within(menu).queryByRole('menuitem', { name: 'Ver en la tienda' })).toBeNull();
  });
});

describe('ProductsView states (F2: S2)', () => {
  it('shows the empty catalog with a link to create the first product', async () => {
    listAdminProducts.mockResolvedValue(page({ items: [], total: 0 }));
    render(<ProductsView />);
    expect(await screen.findByRole('heading', { name: 'Aún no hay productos' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Nuevo producto' }).length).toBeGreaterThan(0);
  });

  it('shows no-matches when filters leave nothing, and clears them', async () => {
    render(<ProductsView />);
    await screen.findByRole('table');
    listAdminProducts.mockResolvedValue(page({ items: [], total: 0 }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Filtros' })).getByRole('button', { name: 'Stock' }));
    expect(await screen.findByRole('heading', { name: 'Ningún producto coincide' })).toBeTruthy();
    listAdminProducts.mockResolvedValue(page());
    fireEvent.click(screen.getAllByRole('button', { name: 'Limpiar filtros' }).at(-1)!);
    await screen.findByRole('table');
    expect(lastQuery().stock).toBeUndefined();
  });

  it('shows the error state and retries', async () => {
    listAdminProducts.mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' });
    render(<ProductsView />);
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByRole('heading', { name: 'No pudimos cargar los productos' })).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeTruthy();
  });
});
