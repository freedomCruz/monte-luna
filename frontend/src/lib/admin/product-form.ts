import type {
  AdminAttributeDefinition,
  AdminCreateProduct,
  AdminCreateVariant,
  AdminImage,
  AdminImageEdit,
  AdminPatchProduct,
  AdminPatchVariant,
  AdminProduct,
  AdminProductStatus,
  AdminVariant,
} from './catalog';

// Pure model of the Producto form: product and variant state, diffs to contract
// patches, and client-side feedback. The server stays the authority; every rule here
// only gives early feedback (compare-at price, slug shape, image type and size).
// Money is entered in whole pesos and sent in minor units, as the contract defines.

export type AttributeInput = string | number | boolean | string[];
export type TaxCategory = AdminVariant['tax_category'];

export interface ProductForm {
  title: string;
  slug: string;
  description: string;
  status: AdminProductStatus;
  brandId: string;
  originId: string;
  categoryIds: string[];
  /** Raw field values by attribute key; empty string or empty list means "not set". */
  attributes: Record<string, string | string[]>;
}

export interface VariantForm {
  sku: string;
  barcode: string;
  weight: string;
  price: string;
  compareAt: string;
  tax: TaxCategory | '';
  status: AdminVariant['status'];
  /** Option values by definition key; only editable when creating a variant. */
  options: Record<string, string>;
}

export const TAX_CATEGORIES: { value: TaxCategory; label: string }[] = [
  { value: 'excluded', label: 'Excluido' },
  { value: 'exempt', label: 'Exento' },
  { value: 'reduced', label: 'Reducido' },
  { value: 'standard', label: 'General' },
];

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** Descriptive (product-scope) definitions, in position order. */
export function attributeDefinitions(definitions: AdminAttributeDefinition[]): AdminAttributeDefinition[] {
  return definitions.filter((definition) => definition.scope === 'product').sort((a, b) => a.position - b.position);
}

/** Variant axes: definitions the variants choose their options from. */
export function variantOptionDefinitions(definitions: AdminAttributeDefinition[]): AdminAttributeDefinition[] {
  return definitions.filter((definition) => definition.scope === 'variant' && definition.is_variant_option).sort((a, b) => a.position - b.position);
}

/** "38.000" or "$ 38000" to minor units; null for blank or non-numeric input. */
export function pesosToMinor(text: string): number | null {
  const digits = text.replace(/[\s$.]/g, '');
  if (digits === '' || !/^\d+$/.test(digits)) return null;
  return Number(digits) * 100;
}

export function minorToPesos(minor: number | null): string {
  return minor === null ? '' : Math.floor(minor / 100).toLocaleString('es-CO');
}

export function slugify(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const copy = [...list];
  const target = Math.max(0, Math.min(copy.length - 1, to));
  const [item] = copy.splice(from, 1);
  copy.splice(target, 0, item);
  return copy;
}

// --- Attributes -----------------------------------------------------------------

function attributeToInput(definition: AdminAttributeDefinition, value: unknown): string | string[] {
  if (value === undefined || value === null) return definition.data_type === 'multi_option' ? [] : '';
  if (Array.isArray(value)) return value.map(String);
  return String(value);
}

function inputToAttribute(definition: AdminAttributeDefinition, input: string | string[] | undefined): AttributeInput | undefined {
  if (Array.isArray(input)) return input.length > 0 ? input : undefined;
  if (input === undefined || input.trim() === '') return undefined;
  if (definition.data_type === 'integer' || definition.data_type === 'decimal') return Number(input.replace(',', '.'));
  if (definition.data_type === 'boolean') return input === 'true';
  return input.trim();
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// --- Product ----------------------------------------------------------------------

export function productToForm(product: AdminProduct): ProductForm {
  const attributes: ProductForm['attributes'] = {};
  for (const definition of attributeDefinitions(product.product_type.attribute_definitions)) {
    attributes[definition.key] = attributeToInput(definition, product.attributes[definition.key]);
  }
  return {
    title: product.title,
    slug: product.slug,
    description: product.description ?? '',
    status: product.status,
    brandId: product.brand?.id ?? '',
    originId: product.origin?.id ?? '',
    categoryIds: product.categories.map((category) => category.id),
    attributes,
  };
}

export function emptyProductForm(): ProductForm {
  return { title: '', slug: '', description: '', status: 'draft', brandId: '', originId: '', categoryIds: [], attributes: {} };
}

/** JSON Merge Patch with only what changed; `null` clears nullable fields and optional attributes. */
export function diffProduct(original: AdminProduct, form: ProductForm, definitions: AdminAttributeDefinition[]): AdminPatchProduct {
  const patch: AdminPatchProduct = {};
  if (form.title.trim() !== original.title) patch.title = form.title.trim();
  if (form.slug.trim() !== original.slug) patch.slug = form.slug.trim();
  const description = form.description.trim() === '' ? null : form.description;
  if (description !== (original.description ?? null)) patch.description = description;
  if (form.status !== original.status) patch.status = form.status;
  if ((form.brandId || null) !== (original.brand?.id ?? null)) patch.brand_id = form.brandId || null;
  if ((form.originId || null) !== (original.origin?.id ?? null)) patch.origin_id = form.originId || null;
  const originalCategories = original.categories.map((category) => category.id);
  if (!sameValue([...form.categoryIds].sort(), [...originalCategories].sort())) patch.category_ids = form.categoryIds;

  const attributes: NonNullable<AdminPatchProduct['attributes']> = {};
  for (const definition of attributeDefinitions(definitions)) {
    const next = inputToAttribute(definition, form.attributes[definition.key]);
    const previous = original.attributes[definition.key];
    if (sameValue(next, previous)) continue;
    attributes[definition.key] = next === undefined ? null : next;
  }
  if (Object.keys(attributes).length > 0) patch.attributes = attributes;
  return patch;
}

export interface CreateErrors {
  productTypeId?: string;
  title?: string;
  slug?: string;
  attributes?: Record<string, string>;
}

export function validateCreate(form: ProductForm, productTypeId: string, definitions: AdminAttributeDefinition[]): CreateErrors {
  const errors: CreateErrors = {};
  if (!productTypeId) errors.productTypeId = 'Elige un tipo de producto.';
  if (form.title.trim() === '') errors.title = 'Escribe el nombre.';
  if (!SLUG.test(form.slug.trim())) errors.slug = 'Usa minúsculas, números y guiones.';
  const missing: Record<string, string> = {};
  for (const definition of attributeDefinitions(definitions)) {
    if (definition.is_required && inputToAttribute(definition, form.attributes[definition.key]) === undefined) missing[definition.key] = 'Completa este campo.';
  }
  if (Object.keys(missing).length > 0) errors.attributes = missing;
  return errors;
}

export function buildCreateProduct(form: ProductForm, productTypeId: string, definitions: AdminAttributeDefinition[]): AdminCreateProduct {
  const attributes: AdminCreateProduct['attributes'] = {};
  for (const definition of attributeDefinitions(definitions)) {
    const value = inputToAttribute(definition, form.attributes[definition.key]);
    if (value !== undefined) attributes[definition.key] = value;
  }
  return {
    product_type_id: productTypeId,
    title: form.title.trim(),
    slug: form.slug.trim(),
    description: form.description.trim() === '' ? null : form.description,
    status: form.status,
    brand_id: form.brandId || null,
    origin_id: form.originId || null,
    category_ids: form.categoryIds,
    attributes,
  };
}

// --- Images -----------------------------------------------------------------------

/** Full image list for the product patch, or null when nothing changed. Order defines `position`. */
export function diffImages(original: Pick<AdminImage, 'id' | 'alt_text' | 'variant_id' | 'position'>[], edited: Pick<AdminImage, 'id' | 'alt_text' | 'variant_id' | 'position'>[]): AdminImageEdit[] | null {
  const toEdits = (list: typeof edited): AdminImageEdit[] => list.map((image, index) => ({ id: image.id, alt_text: image.alt_text, variant_id: image.variant_id, position: index }));
  const before = toEdits([...original].sort((a, b) => a.position - b.position));
  const after = toEdits(edited);
  return sameValue(before, after) ? null : after;
}

/** Same checks and wording as the server (`image_too_large`, `unsupported_image_type`). */
export function imageFileError(file: Pick<File, 'size' | 'type'>): string | null {
  if (file.size === 0) return 'El archivo está vacío.';
  if (!IMAGE_TYPES.includes(file.type)) return 'Usa una imagen JPG, PNG o WebP.';
  if (file.size > MAX_IMAGE_BYTES) return 'La imagen pesa más de 5 MiB.';
  return null;
}

// --- Variants ---------------------------------------------------------------------

export function emptyVariantForm(): VariantForm {
  return { sku: '', barcode: '', weight: '', price: '', compareAt: '', tax: '', status: 'active', options: {} };
}

export function variantToForm(variant: AdminVariant): VariantForm {
  return {
    sku: variant.sku,
    barcode: variant.barcode ?? '',
    weight: String(variant.weight_grams),
    price: minorToPesos(variant.price_amount),
    compareAt: minorToPesos(variant.compare_at_price_amount),
    tax: variant.tax_category,
    status: variant.status,
    options: Object.fromEntries(Object.entries(variant.options).map(([key, value]) => [key, String(value)])),
  };
}

export type VariantErrors = Partial<Record<'sku' | 'price' | 'compareAt' | 'weight' | 'tax', string>>;

export function validateVariant(form: VariantForm): VariantErrors {
  const errors: VariantErrors = {};
  if (form.sku.trim() === '') errors.sku = 'Escribe el SKU.';
  const price = pesosToMinor(form.price);
  if (price === null || price < 1) errors.price = 'Escribe el precio.';
  const compareAt = pesosToMinor(form.compareAt);
  if (form.compareAt.trim() !== '' && (compareAt === null || (price !== null && compareAt <= price))) errors.compareAt = 'Debe ser mayor que el precio.';
  if (!/^[1-9]\d*$/.test(form.weight.trim())) errors.weight = 'Escribe el peso en gramos.';
  if (form.tax === '') errors.tax = 'Elige una categoría de impuesto.';
  return errors;
}

export function diffVariant(original: AdminVariant, form: VariantForm): AdminPatchVariant {
  const patch: AdminPatchVariant = {};
  if (form.sku.trim() !== original.sku) patch.sku = form.sku.trim();
  const barcode = form.barcode.trim() === '' ? null : form.barcode.trim();
  if (barcode !== (original.barcode ?? null)) patch.barcode = barcode;
  const price = pesosToMinor(form.price);
  if (price !== null && price !== original.price_amount) patch.price_amount = price;
  const compareAt = form.compareAt.trim() === '' ? null : pesosToMinor(form.compareAt);
  if (compareAt !== (original.compare_at_price_amount ?? null)) patch.compare_at_price_amount = compareAt;
  const weight = Number(form.weight);
  if (Number.isInteger(weight) && weight !== original.weight_grams) patch.weight_grams = weight;
  if (form.tax !== '' && form.tax !== original.tax_category) patch.tax_category = form.tax;
  if (form.status !== original.status) patch.status = form.status;
  return patch;
}

export function variantToCreate(form: VariantForm): AdminCreateVariant {
  const tax = form.tax as TaxCategory;
  return {
    sku: form.sku.trim(),
    barcode: form.barcode.trim() === '' ? null : form.barcode.trim(),
    options: form.options,
    attributes: {},
    price_amount: pesosToMinor(form.price) as number,
    compare_at_price_amount: form.compareAt.trim() === '' ? null : pesosToMinor(form.compareAt),
    weight_grams: Number(form.weight),
    tax_category: tax,
    status: form.status,
    position: 0,
  };
}
