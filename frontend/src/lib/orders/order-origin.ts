import type { components } from '../../generated/catalog';
import type { TrackingViewState } from './payment-tracking';
import {
  getCatalogProductBySlug,
  getCatalogOriginBySlug,
} from '../catalog/catalog';

export type Product = components['schemas']['Product'];
export type Origin = components['schemas']['Origin'];

export interface OrderOriginData {
  originSlug: string;
  department: string | null;
  story: string | null;
  producerName?: string | null;
  originName?: string | null;
}

/**
 * Resolves the title of the origin card based on tracking view state.
 * Spec S5 / S7 and M-Pedido canvas:
 * - Pagado, Confirmando, Rechazado: "Mientras llega, conoce de dónde viene tu café."
 * - Vencido, Cancelado: "Mientras decides, conoce de dónde viene tu café."
 */
export function resolveOriginCardTitle(viewState: TrackingViewState): string {
  switch (viewState) {
    case 'Vencido':
    case 'Cancelado':
      return 'Mientras decides, conoce de dónde viene tu café.';
    case 'Pagado':
    case 'Confirmando':
    case 'Rechazado':
    default:
      return 'Mientras llega, conoce de dónde viene tu café.';
  }
}

/**
 * Finds the origin of the first order line whose product has one from the catalog API:
 * 1. GET /api/v1/products/{slug} (or fallback to catalog data if unmocked preview)
 * 2. If product has an origin, GET /api/v1/origins/{slug} for region/department and story.
 * Returns null if no line has an origin.
 */
export async function fetchOrderOrigin(
  lines: { product_slug: string }[]
): Promise<OrderOriginData | null> {
  if (!lines || lines.length === 0) {
    return null;
  }

  for (const line of lines) {
    if (!line.product_slug) continue;
    try {
      let product: Product | null = null;

      // 1. Fetch product from catalog API
      try {
        const prodRes = await fetch(
          `/api/v1/products/${encodeURIComponent(line.product_slug)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (prodRes.ok) {
          product = (await prodRes.json()) as Product;
        } else {
          product = await getCatalogProductBySlug(line.product_slug);
        }
      } catch {
        product = await getCatalogProductBySlug(line.product_slug);
      }

      if (!product || !product.origin || !product.origin.slug) {
        continue;
      }

      const originSlug = product.origin.slug;
      let department: string | null = null;
      let story: string | null = null;

      // 2. Fetch origin facts from catalog API for department and story
      try {
        const originRes = await fetch(
          `/api/v1/origins/${encodeURIComponent(originSlug)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (originRes.ok) {
          const originData = (await originRes.json()) as Origin;
          department = originData.department ?? null;
          story = originData.story ?? null;
        } else {
          const mockOrigin = await getCatalogOriginBySlug(originSlug);
          if (mockOrigin) {
            department = mockOrigin.department ?? null;
            story = mockOrigin.story ?? null;
          }
        }
      } catch {
        const mockOrigin = await getCatalogOriginBySlug(originSlug);
        if (mockOrigin) {
          department = mockOrigin.department ?? null;
          story = mockOrigin.story ?? null;
        }
      }

      return {
        originSlug,
        department,
        story,
        producerName: product.origin.producer_name,
        originName: product.origin.name,
      };
    } catch {
      continue;
    }
  }

  return null;
}
