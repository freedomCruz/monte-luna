import type { components } from '../../generated/catalog';
import type { TrackingViewState } from './payment-tracking';

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
 * Finds the origin of the first order line whose product has one from the live catalog API:
 * 1. GET /api/v1/products/{slug}
 * 2. If product has an origin, GET /api/v1/origins/{slug} for department and story.
 * If product request fails or has no origin, tries the next line.
 * If origin request fails, renders the card with the product's origin summary fields only (no department, no story).
 * Returns null if no line yields an origin (hides the card).
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

      // 1. Fetch product from live catalog API
      try {
        const prodRes = await fetch(
          `/api/v1/products/${encodeURIComponent(line.product_slug)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (prodRes.ok) {
          product = (await prodRes.json()) as Product;
        }
      } catch {
        product = null;
      }

      if (!product || !product.origin || !product.origin.slug) {
        continue;
      }

      const originSlug = product.origin.slug;
      let department: string | null = null;
      let story: string | null = null;

      // 2. Fetch origin facts from live catalog API for department and story
      try {
        const originRes = await fetch(
          `/api/v1/origins/${encodeURIComponent(originSlug)}`,
          { headers: { Accept: 'application/json' } }
        );
        if (originRes.ok) {
          const originData = (await originRes.json()) as Origin;
          department = originData.department ?? null;
          story = originData.story ?? null;
        }
      } catch {
        department = null;
        story = null;
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
