import { formatOrderDateTime } from './order-format';
import { orderStatusPresentation, type StatusPresentation } from './order-status';
import type { AdminOrder, OrderStatus } from './orders';

type Shipping = AdminOrder['summary']['shipping'];

export interface OrderActions {
  prepare: boolean;
  dispatch: boolean;
  deliver: boolean;
  cancel: boolean;
}

/** Actions offered by status (S4); the backend still validates every transition. */
export function orderActions(status: OrderStatus): OrderActions {
  return {
    prepare: status === 'paid',
    dispatch: status === 'paid' || status === 'preparing',
    deliver: status === 'shipped',
    cancel: status === 'paid' || status === 'preparing',
  };
}

const grams = (value: number) => value.toLocaleString('es-CO');

/** "0 a 1.000 g", "5.000 g o más", or null when the historical band was not recorded. */
function weightBand(shipping: Shipping): string | null {
  const { min_weight_grams: min, max_weight_grams: max } = shipping;
  if (min === null) return null;
  return max === null ? `${grams(min)} g o más` : `${grams(min)} a ${grams(max)} g`;
}

/** "Envío · Antioquia, 0 a 1.000 g"; zone and band appear only when they were recorded. */
export function shippingLineLabel(shipping: Shipping): string {
  const parts = [shipping.zone_name, weightBand(shipping)].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? `Envío · ${parts.join(', ')}` : 'Envío';
}

/** Note of the Entrega card: rate, band and delivery estimate. */
export function deliveryRateNote(shipping: Shipping): string {
  const band = weightBand(shipping);
  const { estimated_days_min: min, estimated_days_max: max } = shipping;
  const days = min === max ? `${min} ${min === 1 ? 'día hábil' : 'días hábiles'}` : `${min} a ${max} días hábiles`;
  return `Tarifa ${shipping.rate_name}${band ? ` · ${band}` : ''} · llega en ${days} después del despacho.`;
}

/** Header badge: a paid order is "por despachar" (A-Pedido). */
export function headerOrderBadge(status: OrderStatus): StatusPresentation {
  return status === 'paid' ? { label: 'Pagado · por despachar', tone: 'action' } : orderStatusPresentation(status);
}

/** "300 555 0187" for a ten-digit number; anything else is shown as stored. */
export function formatPhone(phone: string): string {
  return /^\d{10}$/.test(phone) ? `${phone.slice(0, 3)} ${phone.slice(3, 6)} ${phone.slice(6)}` : phone;
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export function unitsLabel(units: number): string {
  return units === 1 ? '1 unidad' : `${units} unidades`;
}

/** "hace 3 días" for the Envío card of an order waiting for dispatch. */
export function paidAgo(iso: string, now: Date): string {
  const hours = Math.floor((now.getTime() - new Date(iso).getTime()) / 3_600_000);
  if (hours < 1) return 'hace menos de una hora';
  if (hours < 24) return `hace ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  const days = Math.floor(hours / 24);
  return `hace ${days} ${days === 1 ? 'día' : 'días'}`;
}

export interface TimelineEntry {
  key: string;
  title: string;
  detail: string;
  state: 'done' | 'pending';
  last: boolean;
}

const HAPPY_PATH: OrderStatus[] = ['pending_payment', 'paid', 'preparing', 'shipped', 'delivered'];
const PENDING_DETAIL: Partial<Record<OrderStatus, string>> = {
  preparing: 'Pendiente',
  shipped: 'Pendiente · al registrar el despacho',
  delivered: 'Pendiente · lo marca una persona del equipo',
};

function actorLabel(entry: AdminOrder['status_history'][number]): string {
  if (entry.actor_type === 'customer') return entry.from_status === null ? 'Cliente creó el pedido' : 'Cliente';
  if (entry.actor_type === 'system') return entry.to_status === 'paid' ? 'Sistema (pago aprobado)' : 'Sistema';
  return 'Equipo';
}

/** Recorded history plus, for orders still on the normal path, the steps ahead (A-Pedido). */
export function buildTimeline(order: AdminOrder): TimelineEntry[] {
  const done = order.status_history.map((entry) => ({
    key: entry.id,
    title: orderStatusPresentation(entry.to_status).label,
    detail: [formatOrderDateTime(entry.created_at), actorLabel(entry), entry.note].filter(Boolean).join(' · '),
    state: 'done' as const,
  }));
  const reached = new Set(order.status_history.map((entry) => entry.to_status));
  const ahead = HAPPY_PATH.includes(order.status)
    ? HAPPY_PATH.filter((status) => !reached.has(status) && HAPPY_PATH.indexOf(status) > HAPPY_PATH.indexOf(order.status)).map((status) => ({
        key: `pending-${status}`,
        title: orderStatusPresentation(status).label,
        detail: PENDING_DETAIL[status] ?? 'Pendiente',
        state: 'pending' as const,
      }))
    : [];
  return [...done, ...ahead].map((entry, index, all) => ({ ...entry, last: index === all.length - 1 }));
}
