import type { AdminProductRow, AdminProductStatus } from './catalog';
import type { StatusPresentation } from './order-status';
import { formatMoneyCop } from '../shared/formatters';

// Presentation of a product row from the A-Productos canvas. Prices and stock come
// from the API (minor units, server `low_stock` flag); nothing is computed here.

/** One price, a "min – max" range, or a dash when no active variant has a price. */
export function productPriceLabel(min: number | null, max: number | null): string {
  if (min === null || max === null) return '—';
  return min === max ? formatMoneyCop(min) : `${formatMoneyCop(min)} – ${formatMoneyCop(max)}`;
}

const STATUS: Record<AdminProductStatus, StatusPresentation> = {
  published: { label: 'Publicado', tone: 'done' },
  draft: { label: 'Borrador', tone: 'neutral' },
  archived: { label: 'Archivado', tone: 'neutral' },
};

export function productStatusPresentation(status: AdminProductStatus): StatusPresentation {
  return STATUS[status] ?? { label: String(status), tone: 'neutral' };
}

/** "Agotado" for a non-archived product without units, "Poco stock" below the server threshold. */
export function stockBadge(row: Pick<AdminProductRow, 'available_quantity' | 'low_stock' | 'status'>): StatusPresentation | null {
  if (row.available_quantity === 0) return row.status === 'archived' ? null : { label: 'Agotado', tone: 'problem' };
  return row.low_stock ? { label: 'Poco stock', tone: 'action' } : null;
}

/** Text colour of the product type: coffee green, cacao purple (A-Productos). */
export function productTypeColor(typeSlug: string): string {
  if (typeSlug === 'coffee') return 'text-brand-green';
  if (typeSlug === 'cacao') return 'text-brand-purple';
  return 'text-foreground';
}
