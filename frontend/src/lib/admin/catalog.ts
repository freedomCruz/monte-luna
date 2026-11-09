import type { components, operations } from '../../generated/catalog';
import { queryString, request } from './client';

// Typed client for the admin catalog API (contracts/openapi/catalog.yaml). Product
// creation is the only write without If-Match; every other write sends the parent
// PRODUCT version as a strong ETag, and a stale one is 412 `version_conflict`
// (callers reload the product). Stock counters do not change that version.

export type AdminProductStatus = components['schemas']['AdminProductStatus'];
export type AdminProductRow = components['schemas']['AdminProductRow'];
export type AdminProductPage = components['schemas']['AdminProductPage'];
export type AdminProduct = components['schemas']['AdminProduct'];
export type AdminVariant = components['schemas']['AdminVariant'];
export type AdminImage = components['schemas']['AdminImage'];
export type AdminCreateProduct = components['schemas']['AdminCreateProduct'];
export type AdminPatchProduct = components['schemas']['AdminPatchProduct'];
export type AdminCreateVariant = components['schemas']['AdminCreateVariant'];
export type AdminPatchVariant = components['schemas']['AdminPatchVariant'];
export type AdminOrigin = components['schemas']['AdminOrigin'];
export type AdminBrand = components['schemas']['AdminBrand'];
export type AdminProductType = components['schemas']['AdminProductType'];
export type AdminAttributeDefinition = components['schemas']['AdminAttributeDefinition'];
export type AdminAttributePatch = components['schemas']['AdminAttributePatch'];
export type AdminImageEdit = components['schemas']['AdminImageEdit'];
export type AdminCategory = components['schemas']['AdminCategory'];
export type AdminCategoryPage = components['schemas']['AdminCategoryPage'];
export type AdminOriginPage = components['schemas']['AdminOriginPage'];
export type AdminBrandPage = components['schemas']['AdminBrandPage'];
export type AdminProductTypePage = components['schemas']['AdminProductTypePage'];
export type AdminInventoryVariant = components['schemas']['AdminInventoryVariant'];
export type AdminInventoryVariantPage = components['schemas']['AdminInventoryVariantPage'];
export type AdminVariantLot = components['schemas']['AdminVariantLot'];
export type AdminVariantLotPage = components['schemas']['AdminVariantLotPage'];
export type AdminInventoryMovement = components['schemas']['AdminInventoryMovement'];
export type AdminInventoryMovementPage = components['schemas']['AdminInventoryMovementPage'];
export type AdminReceiveLot = components['schemas']['AdminReceiveLot'];
export type AdminLotReceipt = components['schemas']['AdminLotReceipt'];

export type ListAdminProductsQuery = NonNullable<operations['listAdminProducts']['parameters']['query']>;
export type ListAdminCategoriesQuery = NonNullable<operations['listAdminCatalogCategories']['parameters']['query']>;
export type ListAdminOriginsQuery = NonNullable<operations['listAdminCatalogOrigins']['parameters']['query']>;
export type ListAdminBrandsQuery = NonNullable<operations['listAdminCatalogBrands']['parameters']['query']>;
export type ListAdminProductTypesQuery = NonNullable<operations['listAdminCatalogProductTypes']['parameters']['query']>;
export type ListAdminInventoryVariantsQuery = NonNullable<operations['listAdminInventoryVariants']['parameters']['query']>;
export type ListAdminVariantLotsQuery = NonNullable<operations['listAdminVariantLots']['parameters']['query']>;
export type ListAdminInventoryMovementsQuery = NonNullable<operations['listAdminInventoryMovements']['parameters']['query']>;

/** Multipart fields of an image upload; the server generates the storage key. */
export interface UploadAdminProductImage {
  file: Blob;
  alt_text: string;
  /** Omit to attach the image to every variant. */
  variant_id?: string;
  position?: number;
}

const MERGE_PATCH = 'application/merge-patch+json';

const productsPath = '/api/v1/admin/products';
const productPath = (id: string) => `${productsPath}/${encodeURIComponent(id)}`;
const variantPath = (productId: string, variantId: string) =>
  `${productPath(productId)}/variants/${encodeURIComponent(variantId)}`;
const taxonomyPath = '/api/v1/admin/catalog';
const inventoryPath = (variantId: string) => `/api/v1/admin/inventory/variants/${encodeURIComponent(variantId)}`;

/** Searches and paginates products, drafts and archives included. */
export function listAdminProducts(params: ListAdminProductsQuery = {}) {
  return request<AdminProductPage>('GET', `${productsPath}${queryString(params)}`);
}

/** Reads the complete product; the ETag is the `If-Match` of every product write. */
export function getAdminProduct(id: string) {
  return request<AdminProduct>('GET', productPath(id));
}

/** Creates a product (no `If-Match`); a duplicate slug is 409 `slug_conflict`. */
export function createAdminProduct(body: AdminCreateProduct) {
  return request<AdminProduct>('POST', productsPath, { body });
}

/** Merge-patches a product; `etag` must be the exact product ETag from the last read. */
export function updateAdminProduct(id: string, etag: string, body: AdminPatchProduct) {
  return request<AdminProduct>('PATCH', productPath(id), { body, ifMatch: etag, contentType: MERGE_PATCH });
}

/** Creates a variant with zero stock; the response ETag is the new product version. */
export function createAdminVariant(productId: string, etag: string, body: AdminCreateVariant) {
  return request<AdminVariant>('POST', `${productPath(productId)}/variants`, { body, ifMatch: etag });
}

/** Reads a variant; the ETag is the parent product version. */
export function getAdminVariant(productId: string, variantId: string) {
  return request<AdminVariant>('GET', variantPath(productId, variantId));
}

/** Merge-patches a variant guarded by the parent PRODUCT ETag. Send batches sequentially. */
export function updateAdminVariant(productId: string, variantId: string, etag: string, body: AdminPatchVariant) {
  return request<AdminVariant>('PATCH', variantPath(productId, variantId), { body, ifMatch: etag, contentType: MERGE_PATCH });
}

/** Uploads one JPEG, PNG or WebP (up to 5 MiB) and attaches it to the product. */
export function uploadAdminProductImage(productId: string, etag: string, upload: UploadAdminProductImage) {
  const formData = new FormData();
  formData.set('file', upload.file);
  formData.set('alt_text', upload.alt_text);
  if (upload.variant_id !== undefined) formData.set('variant_id', upload.variant_id);
  if (upload.position !== undefined) formData.set('position', String(upload.position));
  return request<AdminImage>('POST', `${productPath(productId)}/images`, { formData, ifMatch: etag });
}

/** Reads attached image metadata; the ETag is the parent product version. */
export function getAdminProductImage(productId: string, imageId: string) {
  return request<AdminImage>('GET', `${productPath(productId)}/images/${encodeURIComponent(imageId)}`);
}

/** Read-only category choices (active by default). */
export function listAdminCatalogCategories(params: ListAdminCategoriesQuery = {}) {
  return request<AdminCategoryPage>('GET', `${taxonomyPath}/categories${queryString(params)}`);
}

/** Read-only origin choices with a literal name or producer search. */
export function listAdminCatalogOrigins(params: ListAdminOriginsQuery = {}) {
  return request<AdminOriginPage>('GET', `${taxonomyPath}/origins${queryString(params)}`);
}

/** Read-only brand choices (active by default). */
export function listAdminCatalogBrands(params: ListAdminBrandsQuery = {}) {
  return request<AdminBrandPage>('GET', `${taxonomyPath}/brands${queryString(params)}`);
}

/** Read-only product types with their attribute definitions. */
export function listAdminCatalogProductTypes(params: ListAdminProductTypesQuery = {}) {
  return request<AdminProductTypePage>('GET', `${taxonomyPath}/product-types${queryString(params)}`);
}

/** Searches variant stock; the server computes `low_stock`. */
export function listAdminInventoryVariants(params: ListAdminInventoryVariantsQuery = {}) {
  return request<AdminInventoryVariantPage>('GET', `/api/v1/admin/inventory/variants${queryString(params)}`);
}

/** Reads a variant stock summary; the ETag is the parent product version for lot receipts. */
export function getAdminInventoryVariant(variantId: string) {
  return request<AdminInventoryVariant>('GET', inventoryPath(variantId));
}

/** Lists the variant's lots oldest first; the server computes `old_roast`. */
export function listAdminVariantLots(variantId: string, params: ListAdminVariantLotsQuery = {}) {
  return request<AdminVariantLotPage>('GET', `${inventoryPath(variantId)}/lots${queryString(params)}`);
}

/** Lists the append-only movement ledger, newest first. */
export function listAdminInventoryMovements(variantId: string, params: ListAdminInventoryMovementsQuery = {}) {
  return request<AdminInventoryMovementPage>('GET', `${inventoryPath(variantId)}/movements${queryString(params)}`);
}

/** Receives units into a product lot through a variant; `etag` is the parent product ETag. */
export function receiveAdminVariantLot(variantId: string, etag: string, body: AdminReceiveLot) {
  return request<AdminLotReceipt>('POST', `${inventoryPath(variantId)}/receive-lot`, { body, ifMatch: etag });
}
