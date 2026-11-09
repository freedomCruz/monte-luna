import type { AdminInventoryMovement, AdminInventoryVariant, AdminVariantLot } from './catalog';
import { formatOrderDateTime } from './order-format';
import type { StatusPresentation } from './order-status';
import { stockBadge } from './product-format';
import { formatRoastDateSpanish } from '../shared/formatters';

// Presentation of the Inventario screen (A-Inventario). The server decides the flags
// (`low_stock`, `old_roast`), the held counts and the movement kinds; nothing here
// recomputes a threshold or a stock figure.

/** "Agotado" for zero units, "Poco stock" when the server flags the variant; nothing otherwise. */
export function variantStockBadge(variant: Pick<AdminInventoryVariant, 'available_quantity' | 'low_stock' | 'product_status'>): StatusPresentation | null {
  return stockBadge({ available_quantity: variant.available_quantity, low_stock: variant.low_stock, status: variant.product_status });
}

/** Lot badge of the canvas: depleted and archived lots are neutral, the old-roast flag asks for action. */
export function lotStatePresentation(lot: Pick<AdminVariantLot, 'status' | 'old_roast'>): StatusPresentation {
  if (lot.status === 'depleted') return { label: 'Lote agotado', tone: 'neutral' };
  if (lot.status === 'archived') return { label: 'Lote archivado', tone: 'neutral' };
  return lot.old_roast ? { label: 'Tueste antiguo', tone: 'action' } : { label: 'Lote activo', tone: 'done' };
}

const BOGOTA_DAY = new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'America/Bogota' });
const DAY_MS = 86_400_000;

/**
 * Whole Bogota calendar days from a production date to the server read time (`generated_at`),
 * for the "hace N días" caption. It is display only: the old-roast flag is the server's.
 */
export function daysSinceProduction(productionDate: string, generatedAt: string): number {
  const today = BOGOTA_DAY.format(new Date(generatedAt));
  return Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${productionDate}T00:00:00Z`)) / DAY_MS);
}

/** "20 ago 2026", or a dash when the lot does not expire. */
export function formatLotDate(date: string | null): string {
  return formatRoastDateSpanish(date) ?? '—';
}

/** Movement time in the store time zone ("20 oct, 9:12 a. m."). */
export const formatMovementDateTime = formatOrderDateTime;

const KIND: Record<AdminInventoryMovement['display_kind'], string> = {
  receipt: 'Entrada',
  reservation: 'Reserva',
  allocation: 'Asignación',
  sale: 'Venta',
  return: 'Devolución',
  adjustment: 'Ajuste',
  damage: 'Daño',
  release: 'Liberación',
};

export function movementLabel(kind: AdminInventoryMovement['display_kind']): string {
  return KIND[kind] ?? String(kind);
}

/** "+10" and "−2" with a true minus sign, as in the canvas ledger. */
export function formatQuantityDelta(delta: number): string {
  if (delta > 0) return `+${delta}`;
  return delta < 0 ? `−${Math.abs(delta)}` : '0';
}

/** The order the movement belongs to, then the note: "Pedido ORD-… esperando pago · Bolsa rota". */
export function movementDetail(movement: Pick<AdminInventoryMovement, 'display_kind' | 'order' | 'note'>): string {
  const { order, note } = movement;
  const parts: string[] = [];
  if (order) {
    if (movement.display_kind === 'release') parts.push(`Se liberó la reserva de ${order.order_number}`);
    else if (movement.display_kind === 'reservation' && order.reservation_state === 'held') parts.push(`Pedido ${order.order_number} esperando pago`);
    else parts.push(`Pedido ${order.order_number}`);
  }
  if (note) parts.push(note);
  return parts.length > 0 ? parts.join(' · ') : '—';
}

/** `actor_name` is null for the system and for an identity that no longer exists. */
export function movementActor(movement: Pick<AdminInventoryMovement, 'actor_id' | 'actor_name'>): string {
  if (movement.actor_name) return movement.actor_name;
  return movement.actor_id === null ? 'Sistema' : 'Persona no disponible';
}
