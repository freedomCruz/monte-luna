import type { AdminProduct, AdminProductStatus, AdminVariant } from './catalog';

// Presentation helpers of the Productos quick view (A-Productos "Vista rápida").
// Labels come from the product type's attribute definitions; nothing is invented.

type Definitions = AdminProduct['product_type']['attribute_definitions'];

/** "250 g · Grano entero": the variant's option values in definition order. */
export function variantPresentation(variant: Pick<AdminVariant, 'options' | 'sku'>, definitions: Definitions): string {
  const parts = definitions
    .filter((definition) => definition.scope === 'variant' && definition.is_variant_option)
    .sort((a, b) => a.position - b.position)
    .flatMap((definition) => {
      const raw = variant.options[definition.key];
      if (raw === undefined || Array.isArray(raw)) return [];
      const value = String(raw);
      const label = definition.allowed_values?.find((allowed) => allowed.value === value)?.label;
      return [label ?? (definition.unit ? `${value} ${definition.unit}` : value)];
    });
  return parts.length > 0 ? parts.join(' · ') : variant.sku;
}

/** The quick view lists active variants only, the same ones the product row counts. */
export function activeVariants(variants: AdminVariant[]): AdminVariant[] {
  return variants.filter((variant) => variant.status === 'active');
}

/** Helper line under the publication select; the canvas explains only "Publicado". */
export function publicationHelp(status: AdminProductStatus): string | null {
  return status === 'published' ? 'Publicado: se ve en la tienda y se puede comprar.' : null;
}

/** Public product page, shown in the row menu for published products. */
export function storefrontHref(slug: string): string {
  return `/productos/${encodeURIComponent(slug)}/`;
}
