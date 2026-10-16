import type { components } from '../../generated/orders';

export type PaymentMethodType = components['schemas']['GuestPayment']['payment_method_type'];
export type LatestAttemptStatus = components['schemas']['GuestPayment']['latest_attempt_status'];

/**
 * Returns human-readable label for the confirmed payment method, or null if unknown or missing.
 * e.g., 'nequi' -> 'Pagado con Nequi'
 * Spec S7: With no known payment method, no "Pagado con …" note is shown; never a default such as "Pagado con Wompi".
 */
export function formatPaymentMethodLabel(
  method?: PaymentMethodType | string | null
): string | null {
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
      return null;
  }
}

/**
 * Derives the visual tracking state among: 'Pagado' | 'Confirmando' | 'Rechazado' | 'Vencido' | 'Cancelado'
 * based on order status and the latest payment attempt.
 *
 * Rules (from Spec S7, contracts/openapi/orders.yaml GuestPayment description, and M-Pedido canvas):
 * 1. Order status is authoritative:
 *    - 'paid', 'preparing', 'shipped', 'delivered' -> 'Pagado'
 *    - 'expired' -> 'Vencido'
 *    - 'cancelled' -> 'Cancelado' (reusing 'Vencido' layout with cancelled copy, S7)
 * 2. If 'pending_payment':
 *    - If latest attempt is 'declined' or 'error' -> 'Rechazado' (order can still be paid while reserved)
 *    - Otherwise (e.g. 'pending', 'created', or no attempt) -> 'Confirmando'
 */
export type TrackingViewState = 'Pagado' | 'Confirmando' | 'Rechazado' | 'Vencido' | 'Cancelado';

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
    return 'Cancelado';
  }

  // orderStatus === 'pending_payment'
  if (payment) {
    if (payment.latest_attempt_status === 'declined' || payment.latest_attempt_status === 'error') {
      return 'Rechazado';
    }
  }

  return 'Confirmando';
}
