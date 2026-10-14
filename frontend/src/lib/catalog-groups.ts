import type { Product, Category } from './catalog';

export interface CategoryProductGroup {
  id: string;
  category: Category;
  headline?: string;
  description?: string;
  theme: 'forest' | 'burgundy' | 'sand' | 'card';
  products: Product[];
}

export interface ProductTypeGroup {
  id: string;
  productType: Product['product_type'];
  products: Product[];
}

/**
 * Groups products by category according to category definitions.
 * Only returns categories that have at least one product, preserving category position order.
 */
export function groupProductsByCategory(
  products: Product[],
  categories: Category[]
): CategoryProductGroup[] {
  const sortedCategories = [...categories].sort((a, b) => a.position - b.position);

  const groups: CategoryProductGroup[] = [];

  for (const cat of sortedCategories) {
    const matchingProducts = products.filter((p) =>
      p.categories.some((c) => c.slug === cat.slug)
    );

    if (matchingProducts.length > 0) {
      // Pick aesthetic theme and copy per Monteluna M-Listado specs
      let headline: string;
      let description: string;
      let theme: CategoryProductGroup['theme'];

      if (cat.slug === 'cafe') {
        theme = 'forest';
        headline = 'Café de finca, tostado en grano.';
        description = '100 % arábica de origen colombiano, tostión media. Entra a cada café para elegir peso y molienda.';
      } else if (cat.slug === 'cacao') {
        theme = 'burgundy';
        headline = 'Chocolate oscuro Monteluna.';
        description = 'Cacao fino de aroma de origen colombiano, al 65 %, 75 % y 100 %. Sin gluten, en barras de 80 g.';
      } else {
        theme = 'sand';
        headline = `${cat.name} Monteluna.`;
        description = 'Productos y accesorios seleccionados para complementar tu experiencia.';
      }

      groups.push({
        id: `cat-group-${cat.slug}`,
        category: cat,
        headline,
        description,
        theme,
        products: matchingProducts,
      });
    }
  }

  return groups;
}

/**
 * Groups products by product_type.
 */
export function groupProductsByProductType(
  products: Product[]
): ProductTypeGroup[] {
  const map = new Map<string, ProductTypeGroup>();

  for (const product of products) {
    const typeSlug = product.product_type.slug;
    if (!map.has(typeSlug)) {
      map.set(typeSlug, {
        id: `type-group-${typeSlug}`,
        productType: product.product_type,
        products: [],
      });
    }
    map.get(typeSlug)!.products.push(product);
  }

  return Array.from(map.values());
}
