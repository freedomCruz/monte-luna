import { describe, expect, it } from 'vitest';
import { mockProductDetail } from '../../mocks/admin-products';
import {
  attributeDefinitions,
  buildCreateProduct,
  diffImages,
  diffProduct,
  diffVariant,
  emptyVariantForm,
  imageFileError,
  minorToPesos,
  moveItem,
  pesosToMinor,
  productToForm,
  slugify,
  validateCreate,
  validateVariant,
  variantToForm,
  variantToCreate,
  type ProductForm,
} from './product-form';

const product = mockProductDetail;
const defs = [
  { key: 'species', label: 'Especie', data_type: 'option', scope: 'product', is_variant_option: false, is_required: true, is_filterable: true, allowed_values: [{ value: 'arabica', label: 'Arábica' }], unit: null, position: 1 },
  { key: 'notes', label: 'Notas', data_type: 'multi_option', scope: 'product', is_variant_option: false, is_required: false, is_filterable: false, allowed_values: [{ value: 'jasmine', label: 'jazmín' }, { value: 'peach', label: 'durazno' }], unit: null, position: 2 },
  { key: 'score', label: 'Puntaje', data_type: 'decimal', scope: 'product', is_variant_option: false, is_required: false, is_filterable: false, allowed_values: null, unit: null, position: 3 },
  { key: 'washed', label: 'Lavado', data_type: 'boolean', scope: 'product', is_variant_option: false, is_required: false, is_filterable: false, allowed_values: null, unit: null, position: 4 },
  { key: 'size', label: 'Presentación', data_type: 'option', scope: 'variant', is_variant_option: true, is_required: true, is_filterable: true, allowed_values: [{ value: '250g', label: '250 g' }], unit: null, position: 1 },
] as Parameters<typeof attributeDefinitions>[0];

const base = (): ProductForm => ({
  title: 'Geisha',
  slug: 'geisha',
  description: '',
  status: 'draft',
  brandId: '',
  originId: '',
  categoryIds: [],
  attributes: { species: 'arabica', notes: ['jasmine'], score: '87', washed: 'true' },
});

describe('product form model (F3: S3)', () => {
  it('keeps only the product-scope definitions, in position order', () => {
    expect(attributeDefinitions(defs).map((d) => d.key)).toEqual(['species', 'notes', 'score', 'washed']);
  });

  it('converts pesos to minor units and back without inventing amounts', () => {
    expect(pesosToMinor('38.000')).toBe(3_800_000);
    expect(pesosToMinor(' $ 14000 ')).toBe(1_400_000);
    expect(pesosToMinor('')).toBeNull();
    expect(pesosToMinor('abc')).toBeNull();
    expect(minorToPesos(3_800_000)).toBe('38.000');
    expect(minorToPesos(null)).toBe('');
  });

  it('slugifies a title for the storefront URL', () => {
    expect(slugify('Finca El Mirador – Geisha Lavado')).toBe('finca-el-mirador-geisha-lavado');
    expect(slugify('Chocolate oscuro 65 %')).toBe('chocolate-oscuro-65');
    expect(slugify('Café ñandú')).toBe('cafe-nandu');
  });

  it('builds the form from a product and diffs to an empty patch when nothing changed', () => {
    const form = productToForm(product);
    expect(form.title).toBe(product.title);
    expect(form.brandId).toBe(product.brand?.id);
    expect(diffProduct(product, form, product.product_type.attribute_definitions)).toEqual({});
  });

  it('patches only the changed fields, clearing nullable ones with null', () => {
    const form = { ...productToForm(product), title: 'Nuevo', description: 'Texto', brandId: '', status: 'draft' as const };
    expect(diffProduct(product, form, product.product_type.attribute_definitions)).toEqual({
      title: 'Nuevo',
      description: 'Texto',
      brand_id: null,
      status: 'draft',
    });
  });

  it('patches category ids when the set changes and attributes by key, null removing an optional key', () => {
    const original = { ...product, attributes: { species: 'arabica', notes: ['jasmine'], score: 87 } } as typeof product;
    const form: ProductForm = { ...productToForm(original), categoryIds: ['c1'], attributes: { species: 'arabica', notes: ['jasmine', 'peach'], score: '', washed: '' } };
    expect(diffProduct(original, form, defs)).toEqual({
      category_ids: ['c1'],
      attributes: { notes: ['jasmine', 'peach'], score: null },
    });
  });

  it('validates a new product: type, title, slug and required attributes', () => {
    const form = { ...base(), title: ' ', slug: 'Bad Slug', attributes: {} };
    expect(validateCreate(form, '', defs)).toEqual({
      productTypeId: 'Elige un tipo de producto.',
      title: 'Escribe el nombre.',
      slug: 'Usa minúsculas, números y guiones.',
      attributes: { species: 'Completa este campo.' },
    });
    expect(validateCreate(base(), 'type-1', defs)).toEqual({});
  });

  it('builds the create body with typed attribute values and null optional references', () => {
    expect(buildCreateProduct({ ...base(), description: 'x' }, 'type-1', defs)).toEqual({
      product_type_id: 'type-1',
      title: 'Geisha',
      slug: 'geisha',
      description: 'x',
      status: 'draft',
      brand_id: null,
      origin_id: null,
      category_ids: [],
      attributes: { species: 'arabica', notes: ['jasmine'], score: 87, washed: true },
    });
  });

  it('diffs images: sends every image with its position only when something changed', () => {
    const images = [
      { id: 'a', alt_text: 'A', variant_id: null, position: 0 },
      { id: 'b', alt_text: 'B', variant_id: null, position: 1 },
    ];
    expect(diffImages(images as never, images as never)).toBeNull();
    const edited = [images[1], { ...images[0], alt_text: 'A2' }];
    expect(diffImages(images as never, edited as never)).toEqual([
      { id: 'b', alt_text: 'B', variant_id: null, position: 0 },
      { id: 'a', alt_text: 'A2', variant_id: null, position: 1 },
    ]);
  });

  it('moves an item inside a list without mutating it', () => {
    const list = ['a', 'b', 'c'];
    expect(moveItem(list, 0, 2)).toEqual(['b', 'c', 'a']);
    expect(moveItem(list, 2, 0)).toEqual(['c', 'a', 'b']);
    expect(moveItem(list, 1, 9)).toEqual(['a', 'c', 'b']);
    expect(list).toEqual(['a', 'b', 'c']);
  });

  it('rejects images over 5 MiB, empty or of another type with the server messages', () => {
    const file = (size: number, type: string) => ({ size, type }) as File;
    expect(imageFileError(file(1000, 'image/png'))).toBeNull();
    expect(imageFileError(file(5 * 1024 * 1024, 'image/webp'))).toBeNull();
    expect(imageFileError(file(5 * 1024 * 1024 + 1, 'image/jpeg'))).toBe('La imagen pesa más de 5 MiB.');
    expect(imageFileError(file(1000, 'image/gif'))).toBe('Usa una imagen JPG, PNG o WebP.');
    expect(imageFileError(file(0, 'image/png'))).toBe('El archivo está vacío.');
  });
});

describe('variant form model (F3: S3)', () => {
  const variant = product.variants[0];

  it('round-trips a variant and diffs to an empty patch', () => {
    const form = variantToForm(variant);
    expect(form.price).toBe('38.000');
    expect(diffVariant(variant, form)).toEqual({});
  });

  it('patches changed fields in minor units, clearing the compare-at price with null', () => {
    const withRef = { ...variant, compare_at_price_amount: 4_500_000 };
    const form = { ...variantToForm(withRef), price: '39.000', compareAt: '', sku: 'NEW', barcode: '770', weight: '300', tax: 'reduced' as const, status: 'archived' as const };
    expect(diffVariant(withRef, form)).toEqual({
      sku: 'NEW',
      barcode: '770',
      price_amount: 3_900_000,
      compare_at_price_amount: null,
      weight_grams: 300,
      tax_category: 'reduced',
      status: 'archived',
    });
  });

  it('requires the compare-at price to exceed the price, as the server does', () => {
    const form = { ...variantToForm(variant), price: '38.000', compareAt: '38.000' };
    expect(validateVariant(form).compareAt).toBe('Debe ser mayor que el precio.');
    expect(validateVariant({ ...form, compareAt: '45.000' })).toEqual({});
    expect(validateVariant({ ...form, compareAt: '' })).toEqual({});
  });

  it('validates sku, price, weight and tax category', () => {
    expect(validateVariant({ ...emptyVariantForm(), sku: ' ' })).toEqual({
      sku: 'Escribe el SKU.',
      price: 'Escribe el precio.',
      weight: 'Escribe el peso en gramos.',
      tax: 'Elige una categoría de impuesto.',
    });
  });

  it('builds the create body from option values, with prices in minor units', () => {
    const form = { ...emptyVariantForm(), sku: 'SKU-1', price: '38.000', compareAt: '45.000', weight: '250', tax: 'standard' as const, options: { size: '250g' } };
    expect(variantToCreate(form)).toEqual({
      sku: 'SKU-1',
      barcode: null,
      options: { size: '250g' },
      attributes: {},
      price_amount: 3_800_000,
      compare_at_price_amount: 4_500_000,
      weight_grams: 250,
      tax_category: 'standard',
      status: 'active',
      position: 0,
    });
  });
});
