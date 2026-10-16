import type { components } from '../../generated/orders';

export type PaymentMethodType = components['schemas']['GuestPayment']['payment_method_type'];
export type LatestAttemptStatus = components['schemas']['GuestPayment']['latest_attempt_status'];

/**
 * Returns human-readable label for the confirmed payment method.
 * e.g., 'nequi' -> 'Pagado con Nequi'
 */
export function formatPaymentMethodLabel(method: PaymentMethodType): string {
  switch (method) {
    case 'nequi':
      return 'Pagado con Nequi';
    case 'pse':
      return 'Pagado con PSE';
    case 'card':
      return 'Pagado con tarjeta';
    case 'bancolombia_transfer':
      return 'Pagado con Bancolombia';
    default:
      return 'Pagado con Wompi';
  }
}

/**
 * Derives the visual tracking state among: 'Pagado' | 'Confirmando' | 'Rechazado' | 'Vencido'
 * based on order status and the latest payment attempt.
 *
 * Rules (from Spec S7, contracts/openapi/orders.yaml GuestPayment description, and M-Pedido canvas):
 * 1. Order status is authoritative:
 *    - 'paid', 'preparing', 'shipped', 'delivered' -> 'Pagado'
 *    - 'expired' -> 'Vencido'
 * 2. If 'pending_payment':
 *    - If latest attempt is 'declined' or 'error' -> 'Rechazado' (order can still be paid while reserved)
 *    - Otherwise (e.g. 'pending', 'created', or no attempt) -> 'Confirmando'
 * 3. If 'cancelled':
 *    - 'Rechazado'
 */
export type TrackingViewState = 'Pagado' | 'Confirmando' | 'Rechazado' | 'Vencido';

export function resolveTrackingViewState(
  orderStatus: components['schemas']['OrderStatus'],
  payment?: components['schemas']['GuestPayment'] | null
): TrackingViewState {
  if (['paid', 'preparing', 'shipped', 'delivered'].includes(orderStatus)) {
    return 'Pagado';
  }

  if (orderStatus === 'expired') {
    return 'Vencido';
  }

  if (orderStatus === 'cancelled') {
    return 'Rechazado';
  }

  // orderStatus === 'pending_payment'
  if (payment) {
    if (payment.latest_attempt_status === 'declined' || payment.latest_attempt_status === 'error') {
      return 'Rechazado';
    }
  }

  return 'Confirmando';
}
