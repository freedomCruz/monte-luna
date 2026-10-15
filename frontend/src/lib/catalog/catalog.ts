import type { components } from '../../generated/catalog';
import {
  mockCatalogData,
} from '../../mocks/catalog';

export type Product = components['schemas']['Product'];
export type Variant = Product['variants'][number];
export type VariantOption = Variant['options'][number];
export type Category = components['schemas']['Category'];
export type Origin = components['schemas']['Origin'];
export type ProductPage = components['schemas']['ProductPage'];
export type CategoryPage = components['schemas']['CategoryPage'];
export type OriginPage = components['schemas']['OriginPage'];

function getApiBaseUrl(): string | null {
  const envObj = (typeof globalThis !== 'undefined' && 'process' in globalThis
    ? (globalThis as unknown as { process?: { env?: Record<string, string | undefined> } }).process?.env
    : {}) || {};
  const url = envObj.CATALOG_API_URL || (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.CATALOG_API_URL;
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return null;
  }
  return url.replace(/\/+$/, '');
}

export interface ListProductsQuery {
  limit?: number;
  cursor?: string;
  category?: string[];
  product_type?: string[];
  sort?: '-created_at';
}

/**
 * Fetches all products across paginated pages when API mode is active,
 * or filters/paginates mock products in fixtures mode.
 */
export async function getCatalogProducts(
  query?: ListProductsQuery
): Promise<ProductPage> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    let items = [...mockCatalogData.products];

    if (query?.category && query.category.length > 0) {
      items = items.filter((p) =>
        p.categories.some((c) => query.category!.includes(c.slug))
      );
    }

    if (query?.product_type && query.product_type.length > 0) {
      items = items.filter((p) =>
        query.product_type!.includes(p.product_type.slug)
      );
    }

    return {
      items,
      next_cursor: null,
    };
  }

  // API mode: paginate through all pages unless limit/cursor specifically requested
  let allItems: Product[] = [];
  let currentCursor: string | null = query?.cursor || null;

  do {
    const url = new URL(`${apiBase}/api/v1/products`);
    url.searchParams.set('limit', String(query?.limit || 100));

    if (currentCursor) {
      url.searchParams.set('cursor', currentCursor);
    }
    if (query?.category) {
      for (const cat of query.category) {
        url.searchParams.append('category', cat);
      }
    }
    if (query?.product_type) {
      for (const pt of query.product_type) {
        url.searchParams.append('product_type', pt);
      }
    }
    if (query?.sort) {
      url.searchParams.set('sort', query.sort);
    }

    const res = await fetch(url.toString(), {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch catalog products: ${res.status} ${res.statusText}`);
    }

    const page = (await res.json()) as ProductPage;
    allItems = allItems.concat(page.items);
    currentCursor = page.next_cursor;

    // If caller explicitly asked for a single page with limit & cursor, don't auto-paginate
    if (query?.cursor !== undefined) {
      return {
        items: page.items,
        next_cursor: page.next_cursor,
      };
    }
  } while (currentCursor);

  return {
    items: allItems,
    next_cursor: null,
  };
}

export async function getCatalogProductBySlug(
  slug: string
): Promise<Product | null> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    const found = mockCatalogData.products.find((p) => p.slug === slug);
    return found || null;
  }

  const res = await fetch(`${apiBase}/api/v1/products/${encodeURIComponent(slug)}`, {
    headers: {
      Accept: 'application/json',
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch product ${slug}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as Product;
}

export async function getCatalogOrigins(): Promise<OriginPage> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    return {
      items: [...mockCatalogData.origins],
      next_cursor: null,
    };
  }

  let allItems: Origin[] = [];
  let currentCursor: string | null = null;

  do {
    const url = new URL(`${apiBase}/api/v1/origins`);
    url.searchParams.set('limit', '100');
    if (currentCursor) {
      url.searchParams.set('cursor', currentCursor);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch origins: ${res.status} ${res.statusText}`);
    }

    const page = (await res.json()) as OriginPage;
    allItems = allItems.concat(page.items);
    currentCursor = page.next_cursor;
  } while (currentCursor);

  return {
    items: allItems,
    next_cursor: null,
  };
}

export async function getCatalogOriginBySlug(
  slug: string
): Promise<Origin | null> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    const found = mockCatalogData.origins.find((o) => o.slug === slug);
    return found || null;
  }

  const res = await fetch(`${apiBase}/api/v1/origins/${encodeURIComponent(slug)}`, {
    headers: { Accept: 'application/json' },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Failed to fetch origin ${slug}: ${res.status} ${res.statusText}`);
  }

  return (await res.json()) as Origin;
}

export async function getCatalogProductsByOrigin(
  originSlug: string
): Promise<Product[]> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    return mockCatalogData.products.filter(
      (p) => p.origin?.slug === originSlug
    );
  }

  let allItems: Product[] = [];
  let currentCursor: string | null = null;

  do {
    const url = new URL(`${apiBase}/api/v1/origins/${encodeURIComponent(originSlug)}/products`);
    url.searchParams.set('limit', '100');
    if (currentCursor) {
      url.searchParams.set('cursor', currentCursor);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (res.status === 404) {
      return [];
    }

    if (!res.ok) {
      throw new Error(`Failed to fetch products for origin ${originSlug}: ${res.status}`);
    }

    const page = (await res.json()) as ProductPage;
    allItems = allItems.concat(page.items);
    currentCursor = page.next_cursor;
  } while (currentCursor);

  return allItems;
}

export async function getCatalogCategories(): Promise<CategoryPage> {
  const apiBase = getApiBaseUrl();

  if (!apiBase) {
    return {
      items: [...mockCatalogData.categories],
      next_cursor: null,
    };
  }

  let allItems: Category[] = [];
  let currentCursor: string | null = null;

  do {
    const url = new URL(`${apiBase}/api/v1/categories`);
    url.searchParams.set('limit', '100');
    if (currentCursor) {
      url.searchParams.set('cursor', currentCursor);
    }

    const res = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch categories: ${res.status}`);
    }

    const page = (await res.json()) as CategoryPage;
    allItems = allItems.concat(page.items);
    currentCursor = page.next_cursor;
  } while (currentCursor);

  return {
    items: allItems,
    next_cursor: null,
  };
}
