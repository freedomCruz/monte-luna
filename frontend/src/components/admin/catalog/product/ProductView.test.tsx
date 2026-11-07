import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockBrands, mockCategories, mockOrigins, mockProductDetail, mockProductTypes } from '../../../../mocks/admin-products';
import { ProductView } from './ProductView';

const api = vi.hoisted(() => ({
  getAdminProduct: vi.fn(),
  createAdminProduct: vi.fn(),
  updateAdminProduct: vi.fn(),
  createAdminVariant: vi.fn(),
  updateAdminVariant: vi.fn(),
  uploadAdminProductImage: vi.fn(),
  listAdminCatalogBrands: vi.fn(),
  listAdminCatalogCategories: vi.fn(),
  listAdminCatalogOrigins: vi.fn(),
  listAdminCatalogProductTypes: vi.fn(),
}));

vi.mock('../../../../lib/admin/catalog', async (importOriginal) => ({ ...(await importOriginal<typeof import('../../../../lib/admin/catalog')>()), ...api }));

const product = mockProductDetail;
const ok = <T,>(data: T, etag: string | null = null) => ({ ok: true as const, data, etag });
const fail = (status: number, code: string) => ({ ok: false as const, status, code });
const list = <T,>(data: T) => ok(data);

function openAddress(search: string) {
  window.history.replaceState(null, '', `/admin/producto/${search}`);
}

const assign = vi.fn();

beforeEach(() => {
  openAddress(`?id=${product.id}`);
  api.getAdminProduct.mockResolvedValue(ok(product, '"3"'));
  api.listAdminCatalogBrands.mockResolvedValue(list(mockBrands));
  api.listAdminCatalogCategories.mockResolvedValue(list(mockCategories));
  api.listAdminCatalogOrigins.mockResolvedValue(list(mockOrigins));
  api.listAdminCatalogProductTypes.mockResolvedValue(list(mockProductTypes));
  vi.stubGlobal('location', { ...window.location, search: window.location.search, assign });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

async function ready() {
  render(<ProductView />);
  return screen.findByRole('heading', { level: 1, name: product.title });
}

const save = () => fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
const tab = (name: string | RegExp) => fireEvent.click(screen.getByRole('tab', { name }));

describe('ProductView edit (F3: S3)', () => {
  it('shows the header, the tabs with their counts and the general data without a save bar', async () => {
    await ready();
    expect(screen.getByRole('navigation', { name: 'Ruta' }).textContent).toContain('Productos');
    expect(screen.getAllByText('Publicado').length).toBeGreaterThan(0);
    expect(screen.getByRole('link', { name: /Ver en la tienda/ }).getAttribute('href')).toBe(`/productos/${product.slug}/`);
    const tabs = screen.getAllByRole('tab').map((item) => item.textContent);
    expect(tabs).toEqual(['General', 'Atributos', 'Imágenes1', 'Variantes5']);
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(product.title);
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe(product.slug);
    expect(screen.getByText('monteluna.co/productos/')).toBeTruthy();
    expect((screen.getByRole('radio', { name: 'Publicado' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });

  it('saves only the changed fields with the product ETag and shows the saved notice', async () => {
    api.updateAdminProduct.mockResolvedValue(ok({ ...product, title: 'Nuevo nombre', version: 4 }, '"4"'));
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo nombre' } });
    expect(screen.getByText('Cambios sin guardar en el producto')).toBeTruthy();
    save();
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledWith(product.id, '"3"', { title: 'Nuevo nombre' }));
    expect((await screen.findByRole('status')).textContent).toContain('Producto guardado');
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
  });

  it('discards the edits', async () => {
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe(product.title);
    expect(api.updateAdminProduct).not.toHaveBeenCalled();
  });

  it('shows the conflict notice on 412, keeps the edits unsaved, and reloads on request', async () => {
    api.updateAdminProduct.mockResolvedValue(fail(412, 'version_conflict'));
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Otro' } });
    save();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeTruthy();
    expect(within(alert).getByText('Tus cambios no se guardaron. Anótalos antes de recargar.')).toBeTruthy();
    expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Otro');

    api.getAdminProduct.mockResolvedValue(ok({ ...product, title: 'Versión actual', version: 5 }, '"5"'));
    fireEvent.click(within(alert).getByRole('button', { name: 'Recargar' }));
    await waitFor(() => expect((screen.getByLabelText('Nombre') as HTMLInputElement).value).toBe('Versión actual'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows a slug conflict on the slug field after a 409', async () => {
    api.updateAdminProduct.mockResolvedValue(fail(409, 'slug_conflict'));
    await ready();
    fireEvent.change(screen.getByLabelText('Slug'), { target: { value: 'ya-existe' } });
    save();
    expect(await screen.findByText('Ya existe un producto con este enlace.')).toBeTruthy();
  });

  it('edits attributes from the product type definitions and patches them by key', async () => {
    api.updateAdminProduct.mockResolvedValue(ok({ ...product, version: 4 }, '"4"'));
    await ready();
    tab('Atributos');
    expect(screen.getByText('Estos campos los define el tipo de producto «Café».')).toBeTruthy();
    expect(screen.getByLabelText('Especie')).toBeTruthy();
    expect(screen.queryByLabelText('Presentación')).toBeNull();
    fireEvent.click(screen.getByLabelText('durazno'));
    fireEvent.change(screen.getByLabelText('Puntaje de cata (opcional)'), { target: { value: '' } });
    save();
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledWith(product.id, '"3"', { attributes: { notes: ['jasmine', 'peach'], score: null } }));
  });

  it('edits the categories and the publication status', async () => {
    api.updateAdminProduct.mockResolvedValue(ok({ ...product, version: 4 }, '"4"'));
    await ready();
    fireEvent.click(screen.getByRole('button', { name: `Quitar ${mockCategories.items[0].name}` }));
    fireEvent.click(screen.getByRole('radio', { name: 'Borrador' }));
    save();
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledWith(product.id, '"3"', { status: 'draft', category_ids: [] }));
  });
});

describe('ProductView variants (F3: S3)', () => {
  const variant = product.variants[0];

  it('lists every variant with its read-only stock linked to Inventario, and badges', async () => {
    await ready();
    tab(/Variantes/);
    const table = screen.getByRole('table');
    expect(within(table).getAllByRole('row')).toHaveLength(product.variants.length + 1);
    expect(within(table).getByLabelText('SKU de 250 g Grano entero')).toBeTruthy();
    const stock = within(table).getByRole('link', { name: `Stock de ${variant.sku}: 18. Ver en Inventario` });
    expect(stock.getAttribute('href')).toBe(`/admin/inventario/?search=${variant.sku}`);
    expect(within(table).getAllByText('Agotado').length).toBeGreaterThan(0);
    expect(within(table).queryByRole('spinbutton')).toBeNull();
  });

  it('saves a price change in minor units with the product ETag and chains the new ETag', async () => {
    api.updateAdminProduct.mockResolvedValue(ok({ ...product, title: 'Nuevo', version: 4 }, '"4"'));
    api.updateAdminVariant.mockResolvedValue(ok({ ...variant, price_amount: 3_900_000, version: 2 }, '"5"'));
    await ready();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Nuevo' } });
    tab(/Variantes/);
    fireEvent.change(screen.getByLabelText('Precio de 250 g Grano entero'), { target: { value: '39.000' } });
    expect(screen.getByText('Cambios sin guardar en el producto y 1 variante')).toBeTruthy();
    save();
    await waitFor(() => expect(api.updateAdminVariant).toHaveBeenCalledWith(product.id, variant.id, '"4"', { price_amount: 3_900_000 }));
    expect(api.updateAdminProduct).toHaveBeenCalledWith(product.id, '"3"', { title: 'Nuevo' });
    expect((await screen.findByRole('status')).textContent).toContain('Producto guardado');
  });

  it('shows the savings and blocks a reference price that is not above the price', async () => {
    await ready();
    tab(/Variantes/);
    fireEvent.change(screen.getByLabelText('Precio de referencia de 250 g Grano entero'), { target: { value: '45.000' } });
    expect(screen.getByText('Ahorras $7.000')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Precio de referencia de 250 g Grano entero'), { target: { value: '38.000' } });
    save();
    expect(await screen.findByText('Debe ser mayor que el precio.')).toBeTruthy();
    expect(api.updateAdminVariant).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Variantes/ }).textContent).toContain('1 con error');
  });

  it('shows a SKU conflict on the row after a 409', async () => {
    api.updateAdminVariant.mockResolvedValue(fail(409, 'sku_conflict'));
    await ready();
    tab(/Variantes/);
    fireEvent.change(screen.getByLabelText('SKU de 250 g Grano entero'), { target: { value: 'DUP' } });
    save();
    expect(await screen.findByText('Ya existe una variante con este SKU.')).toBeTruthy();
  });

  it('creates a variant from the product type options and adds it to the table', async () => {
    const created = { ...variant, id: 'new-variant', sku: 'ML-NEW', options: { size: '250g', grind: 'fine' }, available_quantity: 0, low_stock: true };
    api.createAdminVariant.mockResolvedValue(ok(created, '"4"'));
    await ready();
    tab(/Variantes/);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva variante' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva variante' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Crear variante' }));
    expect(within(sheet).getAllByText('Elige una opción.')).toHaveLength(2);
    expect(api.createAdminVariant).not.toHaveBeenCalled();

    fireEvent.change(within(sheet).getByLabelText('Presentación'), { target: { value: '250g' } });
    fireEvent.change(within(sheet).getByLabelText('Molienda'), { target: { value: 'fine' } });
    fireEvent.change(within(sheet).getByLabelText('SKU'), { target: { value: 'ML-NEW' } });
    fireEvent.change(within(sheet).getByLabelText('Precio'), { target: { value: '72.000' } });
    fireEvent.change(within(sheet).getByLabelText('Peso en gramos'), { target: { value: '500' } });
    fireEvent.change(within(sheet).getByLabelText('Categoría de impuesto'), { target: { value: 'standard' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Crear variante' }));

    await waitFor(() => expect(api.createAdminVariant).toHaveBeenCalledWith(product.id, '"3"', expect.objectContaining({ sku: 'ML-NEW', options: { size: '250g', grind: 'fine' }, price_amount: 7_200_000, weight_grams: 500, tax_category: 'standard' })));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByLabelText('SKU de 250 g Fina').closest('tr')).toBeTruthy();
  });

  it('keeps the new-variant Sheet open with the server message on a duplicate', async () => {
    api.createAdminVariant.mockResolvedValue(fail(409, 'variant_options_conflict'));
    await ready();
    tab(/Variantes/);
    fireEvent.click(screen.getByRole('button', { name: 'Nueva variante' }));
    const sheet = await screen.findByRole('dialog', { name: 'Nueva variante' });
    fireEvent.change(within(sheet).getByLabelText('Presentación'), { target: { value: '250g' } });
    fireEvent.change(within(sheet).getByLabelText('Molienda'), { target: { value: 'whole' } });
    fireEvent.change(within(sheet).getByLabelText('SKU'), { target: { value: 'X' } });
    fireEvent.change(within(sheet).getByLabelText('Precio'), { target: { value: '1.000' } });
    fireEvent.change(within(sheet).getByLabelText('Peso en gramos'), { target: { value: '100' } });
    fireEvent.change(within(sheet).getByLabelText('Categoría de impuesto'), { target: { value: 'standard' } });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Crear variante' }));
    expect(await within(sheet).findByText('Ya existe una variante con estas opciones.')).toBeTruthy();
  });
});

describe('ProductView images (F3: S5)', () => {
  const pick = (file: File) => fireEvent.change(screen.getByLabelText('Elegir archivos', { selector: 'input' }), { target: { files: [file] } });
  const pendingAlt = () => screen.getAllByLabelText('Texto alternativo').find((input) => (input as HTMLInputElement).value === '') as HTMLInputElement;
  const png = (size = 1000, type = 'image/png', name = 'taza.png') => new File([new Uint8Array(size)], name, { type });

  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:preview');
    URL.revokeObjectURL = vi.fn();
  });

  it('lists the images with alt text and variant, the first one as principal', async () => {
    await ready();
    tab(/Imágenes/);
    expect((screen.getByLabelText('Texto alternativo') as HTMLInputElement).value).toBe('Empaque Finca El Mirador');
    expect(screen.getByText('Principal')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Mover imagen 1' })).toBeTruthy();
  });

  it('rejects a file over 5 MiB and a wrong type before any request', async () => {
    await ready();
    tab(/Imágenes/);
    pick(png(5 * 1024 * 1024 + 1));
    expect(await screen.findByText('La imagen pesa más de 5 MiB.')).toBeTruthy();
    pick(png(1000, 'image/gif', 'a.gif'));
    expect(await screen.findByText('Usa una imagen JPG, PNG o WebP.')).toBeTruthy();
    expect(api.uploadAdminProductImage).not.toHaveBeenCalled();
  });

  it('requires alt text, uploads with the product ETag and adds the image', async () => {
    api.uploadAdminProductImage.mockResolvedValue(ok({ ...product.images[0], id: 'img-2', alt_text: 'Taza de café', position: 1 }, '"4"'));
    await ready();
    tab(/Imágenes/);
    pick(png());
    fireEvent.click(await screen.findByRole('button', { name: 'Subir imagen' }));
    expect(await screen.findByText('Escribe qué muestra la foto para quien no la ve.')).toBeTruthy();
    expect(api.uploadAdminProductImage).not.toHaveBeenCalled();

    fireEvent.change(pendingAlt(), { target: { value: 'Taza de café' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    await waitFor(() => expect(api.uploadAdminProductImage).toHaveBeenCalledWith(product.id, '"3"', { file: expect.any(File), alt_text: 'Taza de café', position: 1 }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Subir imagen' })).toBeNull());
    expect(screen.getAllByLabelText('Texto alternativo')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: /Imágenes/ }).textContent).toContain('2');
  });

  it('explains when the image storage is unavailable (503 media_unavailable) and keeps the file', async () => {
    api.uploadAdminProductImage.mockResolvedValue(fail(503, 'media_unavailable'));
    await ready();
    tab(/Imágenes/);
    pick(png());
    await screen.findByRole('button', { name: 'Subir imagen' });
    fireEvent.change(pendingAlt(), { target: { value: 'Taza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(await screen.findByText('No pudimos subir la imagen: el almacenamiento de imágenes no está disponible ahora. Intenta más tarde.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Subir imagen' })).toBeTruthy();
  });

  it('shows the server messages for 413 and 415', async () => {
    api.uploadAdminProductImage.mockResolvedValueOnce(fail(413, 'image_too_large'));
    await ready();
    tab(/Imágenes/);
    pick(png());
    await screen.findByRole('button', { name: 'Subir imagen' });
    fireEvent.change(pendingAlt(), { target: { value: 'Taza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(await screen.findByText('La imagen pesa más de 5 MiB.')).toBeTruthy();
    api.uploadAdminProductImage.mockResolvedValueOnce(fail(415, 'unsupported_image_type'));
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(await screen.findByText('Usa una imagen JPG, PNG o WebP.')).toBeTruthy();
  });

  it('shows the conflict notice when the upload hits a stale version', async () => {
    api.uploadAdminProductImage.mockResolvedValue(fail(412, 'version_conflict'));
    await ready();
    tab(/Imágenes/);
    pick(png());
    await screen.findByRole('button', { name: 'Subir imagen' });
    fireEvent.change(pendingAlt(), { target: { value: 'Taza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Subir imagen' }));
    expect(await screen.findByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeTruthy();
  });

  it('reorders with the keyboard and patches the full image list', async () => {
    const two = { ...product, images: [product.images[0], { ...product.images[0], id: 'img-2', alt_text: 'Segunda', position: 1 }] };
    api.getAdminProduct.mockResolvedValue(ok(two, '"3"'));
    api.updateAdminProduct.mockResolvedValue(ok({ ...two, version: 4 }, '"4"'));
    await ready();
    tab(/Imágenes/);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Mover imagen 1' }), { key: 'ArrowRight' });
    save();
    await waitFor(() => expect(api.updateAdminProduct).toHaveBeenCalledWith(product.id, '"3"', {
      images: [
        { id: 'img-2', alt_text: 'Segunda', variant_id: null, position: 0 },
        { id: product.images[0].id, alt_text: product.images[0].alt_text, variant_id: null, position: 1 },
      ],
    }));
  });

  it('blocks saving while an image has no alt text', async () => {
    await ready();
    tab(/Imágenes/);
    fireEvent.change(screen.getByLabelText('Texto alternativo'), { target: { value: ' ' } });
    save();
    expect((await screen.findAllByText('Escribe qué muestra la foto para quien no la ve.')).length).toBeGreaterThan(0);
    expect(api.updateAdminProduct).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Imágenes/ }).textContent).toContain('1 por revisar');
  });
});

describe('ProductView create (F3: S3)', () => {
  beforeEach(() => {
    openAddress('');
    vi.stubGlobal('location', { ...window.location, search: '', assign });
  });

  it('shows only General and Atributos, with the type select and no variants or images', async () => {
    render(<ProductView />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Nuevo producto' })).toBeTruthy();
    expect(screen.getAllByRole('tab').map((item) => item.textContent)).toEqual(['General', 'Atributos']);
    expect(api.getAdminProduct).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Crear producto' })).toBeTruthy();
  });

  it('validates, derives the slug from the name and creates without If-Match, then opens the product', async () => {
    api.createAdminProduct.mockResolvedValue(ok({ ...product, id: 'created-1' }, '"1"'));
    render(<ProductView />);
    await screen.findByRole('heading', { level: 1, name: 'Nuevo producto' });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText('Elige un tipo de producto.')).toBeTruthy();
    expect(screen.getByText('Escribe el nombre.')).toBeTruthy();
    expect(api.createAdminProduct).not.toHaveBeenCalled();

    fireEvent.change(await screen.findByLabelText('Tipo de producto'), { target: { value: mockProductTypes.items[0].id } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Finca La Esperanza – Pink Bourbon' } });
    expect((screen.getByLabelText('Slug') as HTMLInputElement).value).toBe('finca-la-esperanza-pink-bourbon');
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText('Completa este campo.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Atributos' }).getAttribute('aria-selected')).toBe('true');

    fireEvent.change(screen.getByLabelText('Especie'), { target: { value: 'arabica' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    await waitFor(() => expect(api.createAdminProduct).toHaveBeenCalledWith(expect.objectContaining({ product_type_id: mockProductTypes.items[0].id, title: 'Finca La Esperanza – Pink Bourbon', slug: 'finca-la-esperanza-pink-bourbon', status: 'draft', attributes: { species: 'arabica' } })));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/admin/producto/?id=created-1'));
  });

  it('shows a slug conflict on the slug field after a 409', async () => {
    api.createAdminProduct.mockResolvedValue(fail(409, 'slug_conflict'));
    render(<ProductView />);
    await screen.findByRole('heading', { level: 1, name: 'Nuevo producto' });
    fireEvent.change(await screen.findByLabelText('Tipo de producto'), { target: { value: mockProductTypes.items[0].id } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Geisha' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Atributos' }));
    fireEvent.change(screen.getByLabelText('Especie'), { target: { value: 'arabica' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear producto' }));
    expect(await screen.findByText('Ya existe un producto con este enlace.')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('ProductView loading states (F3: S3)', () => {
  it('shows a missing product on 404 and a retry on other failures', async () => {
    api.getAdminProduct.mockResolvedValueOnce(fail(404, 'product_not_found'));
    render(<ProductView />);
    expect(await screen.findByRole('heading', { name: 'Este producto no existe' })).toBeTruthy();
    cleanup();

    api.getAdminProduct.mockResolvedValueOnce(fail(0, 'network_error'));
    render(<ProductView />);
    const alert = await screen.findByRole('alert');
    fireEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: product.title })).toBeTruthy();
  });
});
