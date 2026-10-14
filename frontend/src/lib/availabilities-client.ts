import type { components } from '../generated/catalog';

export type ProductAvailability = components['schemas']['ProductAvailability'];
export type ProductAvailabilityPage = components['schemas']['ProductAvailabilityPage'];
export type VariantAvailability = components['schemas']['VariantAvailability'];
export type Problem = components['schemas']['Problem'];

const BATCH_LIMIT = 100;

/**
 * Client for `/api/v1/product-availabilities`.
 * Deduplicates product slugs, breaks queries into max 100 slugs per batch,
 * follows `next_cursor` pagination, and throws machine-readable Problem code if failed.
 */
export async function fetchProductAvailabilities(
  productSlugs: string[]
): Promise<ProductAvailabilityPage> {
  const uniqueSlugs = Array.from(new Set(productSlugs.filter((s) => Boolean(s && s.trim()))));

  if (uniqueSlugs.length === 0) {
    return {
      items: [],
      next_cursor: null,
    };
  }

  // Split into chunks of at most 100 distinct slugs per OpenAPI spec
  const chunks: string[][] = [];
  for (let i = 0; i < uniqueSlugs.length; i += BATCH_LIMIT) {
    chunks.push(uniqueSlugs.slice(i, i + BATCH_LIMIT));
  }

  const allItems: ProductAvailability[] = [];

  for (const chunk of chunks) {
    let currentCursor: string | null = null;

    do {
      const params = new URLSearchParams();
      for (const slug of chunk) {
        params.append('product_slug', slug);
      }
      params.set('limit', String(BATCH_LIMIT));
      if (currentCursor) {
        params.set('cursor', currentCursor);
      }

      const response = await fetch(`/api/v1/product-availabilities?${params.toString()}`, {
        headers: { Accept: 'application/json' },
      });

      if (!response.ok) {
        let problemCode = `http_${response.status}`;
        try {
          const problem = (await response.json()) as Problem;
          if (problem && problem.code) {
            problemCode = problem.code;
          }
        } catch {
          // keep status fallback
        }
        throw new Error(problemCode);
      }

      const page = (await response.json()) as ProductAvailabilityPage;
      if (page.items && Array.isArray(page.items)) {
        allItems.push(...page.items);
      }
      currentCursor = page.next_cursor || null;
    } while (currentCursor);
  }

  return {
    items: allItems,
    next_cursor: null,
  };
}
