import { StatusBadge } from '../../ui/status-badge';
import { orderStatusPresentation, paymentStatusPresentation } from '../../../lib/admin/order-status';
import type { AdminPaymentStatus, OrderStatus } from '../../../lib/admin/orders';

type BadgeSize = 'sm' | 'md';

/** Order status badge shared by Pedidos, Pedido and Inicio. */
export function OrderStatusBadge({ status, size, className }: { status: OrderStatus; size?: BadgeSize; className?: string }) {
  const { label, tone } = orderStatusPresentation(status);
  return <StatusBadge tone={tone} size={size} className={className}>{label}</StatusBadge>;
}

/** Payment status badge; an order without an eligible attempt shows a dash. */
export function PaymentStatusBadge({ status, size, className }: { status: AdminPaymentStatus | null; size?: BadgeSize; className?: string }) {
  if (status === null) return <span className={className}>—</span>;
  const { label, tone } = paymentStatusPresentation(status);
  return <StatusBadge tone={tone} size={size} className={className}>{label}</StatusBadge>;
}
