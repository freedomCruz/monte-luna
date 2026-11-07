import { describe, expect, it } from 'vitest';
import { mockProductDetail } from '../../mocks/admin-products';
import { activeVariants, publicationHelp, storefrontHref, variantPresentation } from './product-sheet';

const { variants, product_type: type } = mockProductDetail;

describe('Productos quick view presentation (F2b: S2, S3)', () => {
  it('builds the presentation from the variant options and their labels, in definition order', () => {
    expect(variantPresentation(variants[0], type.attribute_definitions)).toBe('250 g · Grano entero');
    expect(variantPresentation(variants[3], type.attribute_definitions)).toBe('500 g · Fina');
  });

  it('falls back to the raw value, adding the unit, and to the SKU without options', () => {
    const definitions = [{ ...type.attribute_definitions[0], allowed_values: null, unit: 'g' }];
    expect(variantPresentation({ ...variants[0], options: { size: '250' } }, definitions)).toBe('250 g');
    expect(variantPresentation({ ...variants[0], options: {} }, definitions)).toBe(variants[0].sku);
  });

  it('lists only the active variants, as the product row counts them', () => {
    expect(activeVariants(variants)).toHaveLength(4);
    expect(activeVariants(variants).every((variant) => variant.status === 'active')).toBe(true);
  });

  it('explains only the state the canvas explains', () => {
    expect(publicationHelp('published')).toBe('Publicado: se ve en la tienda y se puede comprar.');
    expect(publicationHelp('draft')).toBeNull();
    expect(publicationHelp('archived')).toBeNull();
  });

  it('links the storefront product page by slug', () => {
    expect(storefrontHref('finca-el-mirador')).toBe('/productos/finca-el-mirador/');
  });
});
