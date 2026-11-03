import type { AdminPaymentMethod, AdminPaymentStatus, OrderStatus } from './orders';

// Spanish labels and badge tones from the admin canvas (A-Pedidos, A-Pagos) and the
// "Status badges" table in docs/design/monteluna/admin/admin.md. Colour says what to
// do; the text always names the state. Unknown values added later stay readable.

export type StatusTone = 'action' | 'progress' | 'done' | 'neutral' | 'problem';

export interface StatusPresentation {
  label: string;
  tone: StatusTone;
}

const ORDER: Record<OrderStatus, StatusPresentation> = {
  pending_payment: { label: 'Pendiente de pago', tone: 'neutral' },
  paid: { label: 'Pagado', tone: 'action' },
  preparing: { label: 'En preparación', tone: 'progress' },
  shipped: { label: 'Enviado', tone: 'progress' },
  delivered: { label: 'Entregado', tone: 'done' },
  cancelled: { label: 'Cancelado', tone: 'problem' },
  expired: { label: 'Vencido', tone: 'neutral' },
};

const PAYMENT: Record<AdminPaymentStatus, StatusPresentation> = {
  created: { label: 'Creado', tone: 'neutral' },
  pending: { label: 'Pendiente', tone: 'progress' },
  approved: { label: 'Aprobado', tone: 'done' },
  declined: { label: 'Rechazado', tone: 'problem' },
  voided: { label: 'Anulado', tone: 'neutral' },
  error: { label: 'Error', tone: 'problem' },
  expired: { label: 'Vencido', tone: 'neutral' },
  duplicate_approved: { label: 'Pago duplicado', tone: 'action' },
};

const METHOD: Record<NonNullable<AdminPaymentMethod>, string> = {
  card: 'Tarjeta',
  pse: 'PSE',
  nequi: 'Nequi',
  bancolombia_transfer: 'Bancolombia',
};

export function orderStatusPresentation(status: OrderStatus): StatusPresentation {
  return ORDER[status] ?? { label: String(status), tone: 'neutral' };
}

export function paymentStatusPresentation(status: AdminPaymentStatus): StatusPresentation {
  return PAYMENT[status] ?? { label: String(status), tone: 'neutral' };
}

export function paymentMethodLabel(method: AdminPaymentMethod | undefined): string {
  return method ? (METHOD[method] ?? method) : '—';
}
