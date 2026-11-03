import { StatusBadge } from '../../ui/status-badge';
import { orderStatusPresentation, paymentStatusPresentation } from '../../../lib/admin/order-status';
import type { AdminPaymentStatus, OrderStatus } from '../../../lib/admin/orders';

/** Order status badge shared by Pedidos, Pedido and Inicio. */
export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const { label, tone } = orderStatusPresentation(status);
  return <StatusBadge tone={tone} className={className}>{label}</StatusBadge>;
}

/** Payment status badge; an order without an eligible attempt shows a dash. */
export function PaymentStatusBadge({ status, className }: { status: AdminPaymentStatus | null; className?: string }) {
  if (status === null) return <span className={className}>—</span>;
  const { label, tone } = paymentStatusPresentation(status);
  return <StatusBadge tone={tone} className={className}>{label}</StatusBadge>;
}
