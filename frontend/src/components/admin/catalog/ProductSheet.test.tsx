import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockProductDetail } from '../../../mocks/admin-products';
import { ProductSheet } from './ProductSheet';

const { getAdminProduct, updateAdminProduct } = vi.hoisted(() => ({ getAdminProduct: vi.fn(), updateAdminProduct: vi.fn() }));

vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()),
  getAdminProduct,
  updateAdminProduct,
}));

const loaded = { ok: true as const, etag: '"3"', data: mockProductDetail };
const saved = { ok: true as const, etag: '"4"', data: { ...mockProductDetail, status: 'draft' as const, version: 4 } };

function open(onClose = vi.fn(), onSaved = vi.fn()) {
  render(<ProductSheet productId={mockProductDetail.id} fallbackTitle={mockProductDetail.title} onClose={onClose} onSaved={onSaved} />);
  return { onClose, onSaved };
}

beforeEach(() => {
  getAdminProduct.mockResolvedValue(loaded);
  updateAdminProduct.mockResolvedValue(saved);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ProductSheet (F2b: S2, S3)', () => {
  it('shows a loading state with the row title, then the product facts and variants', async () => {
    open();
    const dialog = await screen.findByRole('dialog', { name: mockProductDetail.title });
    expect(within(dialog).getByText('Vista rápida')).toBeTruthy();
    expect(await within(dialog).findByText('Cafés de origen')).toBeTruthy();
    expect(getAdminProduct).toHaveBeenCalledWith(mockProductDetail.id);

    const facts = dialog.querySelector('dl') as HTMLElement;
    expect(within(facts).getByText('Café')).toBeTruthy();
    expect(within(facts).getByText('Finca El Mirador · Huila')).toBeTruthy();
    expect(within(facts).getByText('Monteluna')).toBeTruthy();

    expect(within(dialog).getByText('Variantes · 4')).toBeTruthy();
    const table = within(dialog).getByRole('table');
    expect(within(table).getByText('250 g · Grano entero')).toBeTruthy();
    expect(within(table).getAllByText('$38.000')).toHaveLength(2);
    expect(within(table).getByText('Agotado')).toBeTruthy();
    expect(within(table).queryByText('ML-MIR-GE-OLD')).toBeNull();
    expect(within(dialog).getByText('Publicado: se ve en la tienda y se puede comprar.')).toBeTruthy();
    expect(within(dialog).getByRole('link', { name: 'Editar el producto completo →' }).getAttribute('href')).toBe(`/admin/producto/?id=${mockProductDetail.id}`);
  });

  it('keeps Guardar disabled until the status changes, then patches only the status with the product ETag', async () => {
    const { onSaved, onClose } = open();
    const select = await screen.findByLabelText('Estado de publicación');
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect((save as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(select, { target: { value: 'draft' } });
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save);

    await waitFor(() => expect(updateAdminProduct).toHaveBeenCalledWith(mockProductDetail.id, '"3"', { status: 'draft' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: mockProductDetail.id, status: 'draft' })));
    expect(onClose).toHaveBeenCalled();
  });

  it('asks for confirmation before archiving and sends nothing until confirmed', async () => {
    open();
    fireEvent.change(await screen.findByLabelText('Estado de publicación'), { target: { value: 'archived' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const confirm = await screen.findByRole('alertdialog');
    expect(updateAdminProduct).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole('button', { name: 'Volver' }));
    expect(updateAdminProduct).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Archivar producto' }));
    await waitFor(() => expect(updateAdminProduct).toHaveBeenCalledWith(mockProductDetail.id, '"3"', { status: 'archived' }));
  });

  it('shows the conflict state on 412, saves nothing, and reloads the current version on request', async () => {
    updateAdminProduct.mockResolvedValue({ ok: false, status: 412, code: 'version_conflict' });
    const { onSaved, onClose } = open();
    fireEvent.change(await screen.findByLabelText('Estado de publicación'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeTruthy();
    expect(within(alert).getByText('Tus cambios no se guardaron. Anótalos antes de recargar.')).toBeTruthy();
    expect(onSaved).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    getAdminProduct.mockResolvedValue({ ok: true, etag: '"5"', data: { ...mockProductDetail, status: 'archived', version: 5 } });
    fireEvent.click(within(alert).getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect(getAdminProduct).toHaveBeenCalledTimes(2));
    await waitFor(() => expect((screen.getByLabelText('Estado de publicación') as HTMLSelectElement).value).toBe('archived'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reports another save failure without closing the sheet', async () => {
    updateAdminProduct.mockResolvedValue({ ok: false, status: 500, code: 'internal_error' });
    const { onClose } = open();
    fireEvent.change(await screen.findByLabelText('Estado de publicación'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('No pudimos guardar el cambio. Intenta de nuevo.')).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a retry when the product cannot be loaded', async () => {
    getAdminProduct.mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' });
    open();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No pudimos cargar el producto.')).toBeTruthy();
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Cafés de origen')).toBeTruthy();
  });

  it.each(['Cancelar', 'Cerrar', 'Escape'])('preserves dirty status until discard is confirmed via %s', async (dismiss) => {
    const { onClose, onSaved } = open();
    fireEvent.change(await screen.findByLabelText('Estado de publicación'), { target: { value: 'draft' } });
    const requestClose = () => {
      if (dismiss === 'Escape') fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
      else fireEvent.click(screen.getByRole('button', { name: dismiss }));
    };
    requestClose();
    const confirm = await screen.findByRole('alertdialog', { name: '¿Salir sin guardar?' });
    expect(onClose).not.toHaveBeenCalled();
    expect(within(confirm).getByText(`Perderás los cambios que hiciste en ${mockProductDetail.title}.`)).toBeTruthy();
    expect(document.activeElement).toBe(within(confirm).getByRole('button', { name: 'Seguir editando' }));
    fireEvent.click(within(confirm).getByRole('button', { name: 'Seguir editando' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect((screen.getByLabelText('Estado de publicación') as HTMLSelectElement).value).toBe('draft');
    expect(screen.getByRole('dialog', { name: mockProductDetail.title })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
    requestClose();
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Salir sin guardar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(updateAdminProduct).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('closes immediately when the selected status returns to its saved value', async () => {
    const { onClose } = open();
    const select = await screen.findByLabelText('Estado de publicación');
    fireEvent.change(select, { target: { value: 'draft' } });
    fireEvent.change(select, { target: { value: mockProductDetail.status } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(updateAdminProduct).not.toHaveBeenCalled();
  });

  it('closes a clean Sheet from Cancelar and from the close button', async () => {
    const { onClose } = open();
    await screen.findByText('Cafés de origen');
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
