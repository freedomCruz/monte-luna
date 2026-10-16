import React from 'react';
import type { components } from '../../generated/orders';
import { OrderCountdownTimer } from './OrderCountdownTimer';
import { resolveTrackingViewState } from '../../lib/orders/payment-tracking';

export interface OrderTrackingHeroProps {
  order: components['schemas']['GuestOrder'];
  onTimerExpire?: () => void;
}

export function OrderTrackingHero({ order, onTimerExpire }: OrderTrackingHeroProps) {
  const viewState = resolveTrackingViewState(order.status, order.payment);

  // Determine variant styling & texts based on M-Pedido / M-Pedido-390 canvas
  const isPaid = viewState === 'Pagado';
  const isPending = viewState === 'Confirmando';
  const isExpired = viewState === 'Vencido';
  const isRejected = viewState === 'Rechazado';

  // Hero container colors
  const heroBg = isPaid
    ? 'bg-brand-green text-primary-foreground'
    : isExpired || isRejected
      ? 'bg-hero/30 text-foreground'
      : 'bg-hero/40 text-foreground';

  // Title, text, buttons
  let title = '¡Gracias! Tu café ya es tuyo.';
  let text = 'Recibimos tu pago. Enviamos la confirmación y el enlace para seguir tu pedido.';
  let btnText = 'Seguir mi pedido';
  let btnHref = '#';
  let linkText = 'Volver a la tienda';
  let linkHref = '/tienda';

  // Seal (sello) attributes
  let selloA = 'Pago';
  let selloB = 'Aprobado';
  let selloC = 'Confirmado';
  let selloBg = 'bg-brand-yellow text-primary';

  if (isPending) {
    title = 'Estamos confirmando tu pago.';
    text =
      'Todavía no recibimos la respuesta del medio de pago. Puedes cerrar esta página: te avisamos por correo apenas quede confirmado.';
    btnText = 'Actualizar estado';
    btnHref = typeof window !== 'undefined' ? window.location.href : '#';
    selloA = 'Pago';
    selloB = 'En curso';
    selloC = 'Un momento';
    selloBg = 'bg-primary text-brand-yellow';
  } else if (isExpired) {
    title = 'Se acabó el tiempo de este pedido.';
    text =
      'Pasó el tiempo de reserva sin recibir el pago y liberamos el inventario para otras personas. Puedes armarlo de nuevo en un minuto.';
    btnText = 'Armar el pedido de nuevo';
    btnHref = '/tienda';
    linkText = 'Ir a la tienda';
    linkHref = '/tienda';
    selloA = 'Reserva';
    selloB = 'Vencida';
    selloC = '30 minutos';
    selloBg = 'bg-primary text-primary-foreground';
  } else if (isRejected) {
    title = 'El pago no pasó.';
    text =
      'El medio de pago rechazó la transacción y no se hizo ningún cobro. Tu pedido sigue apartado o puedes reintentar el pago.';
    btnText = 'Intentar el pago de nuevo';
    btnHref = '/checkout';
    linkText = 'Volver al carrito';
    linkHref = '/carrito';
    selloA = 'Pago';
    selloB = 'Rechazado';
    selloC = 'Sin cobro';
    selloBg = 'bg-destructive text-primary-foreground';
  }

  return (
    <div className={`w-full ${heroBg} overflow-hidden py-10 md:py-16 px-6 md:px-12`}>
      <div className="max-w-[1320px] mx-auto flex flex-col md:flex-row items-center justify-between gap-8 md:gap-12">
        {/* Left Column: Headings, timer, CTA */}
        <div className="flex-1 flex flex-col items-start gap-4 max-w-[680px]">
          {/* Order badge */}
          <span className="inline-flex items-center gap-2.5 font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
            Pedido{' '}
            <span className="px-2.5 py-1 rounded-md bg-card text-foreground font-mono text-sm md:text-base font-extrabold tracking-normal">
              {order.order_number}
            </span>
          </span>

          <h1
            aria-live="polite"
            className="font-sans text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[0.98] tracking-tight m-0"
          >
            {title}
          </h1>

          <p className="text-base sm:text-lg md:text-xl leading-relaxed opacity-90 m-0">
            {text}
          </p>

          {/* 30-min reservation countdown timer if pending or rejected (while still pending_payment) */}
          {order.status === 'pending_payment' && order.reservation_expires_at && (
            <div className="w-full max-w-[420px] my-2">
              <OrderCountdownTimer
                expiresAt={order.reservation_expires_at}
                onExpire={onTimerExpire}
              />
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center gap-4 pt-2">
            <a
              href={btnHref}
              className="inline-flex items-center justify-center min-h-[54px] px-8 rounded-xl bg-card text-foreground font-sans text-base font-bold uppercase tracking-wide hover:opacity-95 transition-opacity"
            >
              {btnText} →
            </a>
            <a
              href={linkHref}
              className="inline-flex items-center min-h-[44px] text-sm md:text-base font-bold uppercase underline underline-offset-4 hover:opacity-80 transition-opacity"
            >
              {linkText}
            </a>
          </div>
        </div>

        {/* Right Column: Decorative seal */}
        <div className="relative shrink-0 flex items-center justify-center w-48 h-48 sm:w-56 sm:h-56">
          <div
            className={`flex flex-col items-center justify-center w-44 h-44 sm:w-48 sm:h-48 rounded-full ${selloBg} outline-2 outline-dashed outline-offset-[-10px] transform -rotate-12 shadow-lg`}
          >
            <span className="font-condensed text-sm sm:text-base font-bold tracking-widest uppercase">
              {selloA}
            </span>
            <span className="font-sans text-2xl sm:text-3xl font-extrabold leading-none tracking-tight">
              {selloB}
            </span>
            <span className="font-condensed text-xs sm:text-sm font-bold tracking-widest uppercase mt-0.5">
              {selloC}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
