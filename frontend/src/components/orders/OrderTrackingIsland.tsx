import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { components } from '../../generated/orders';
import { getGuestOrder } from '../../lib/orders/client';
import { verifyPayment } from '../../lib/payments/client';
import { computeOrderTrackingSteps } from '../../lib/orders/tracking';
import { resolveTrackingViewState } from '../../lib/orders/payment-tracking';
import { OrderTrackingHero } from './OrderTrackingHero';
import { OrderTrackingStepsSection } from './OrderTrackingStepsSection';
import { OrderDeliveryCard } from './OrderDeliveryCard';
import { OrderSummaryAside } from './OrderSummaryAside';
import { OrderNoticesGrid, type OrderNoticeItem } from './OrderNoticesGrid';
import { OrderOriginCard } from './OrderOriginCard';
import {
  fetchOrderOrigin,
  resolveOriginCardTitle,
  type OrderOriginData,
} from '../../lib/orders/order-origin';

export interface OrderTrackingIslandProps {
  initialToken?: string;
}

export function OrderTrackingIsland({ initialToken }: OrderTrackingIslandProps) {
  const [token, setToken] = useState<string | null>(initialToken || null);
  const [order, setOrder] = useState<components['schemas']['GuestOrder'] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorStatus, setErrorStatus] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [originData, setOriginData] = useState<OrderOriginData | null>(null);

  // Keep track of whether we already verified the redirect transaction ID hint
  const hasAttemptedVerifyRef = useRef(false);

  const fetchOrder = useCallback(async (trackingToken: string) => {
    setLoading(true);
    setErrorStatus(null);
    setErrorMessage(null);

    const res = await getGuestOrder(trackingToken);
    if (res.ok) {
      setOrder(res.order);
    } else {
      setErrorStatus(res.status ?? 500);
      if (res.status === 404) {
        setErrorMessage(
          'No encontramos ningún pedido asociado a este enlace. Verifica que hayas copiado el enlace completo que llegó a tu correo.'
        );
      } else if (res.status === 400) {
        setErrorMessage(
          'El enlace de seguimiento no tiene un formato válido. Revisa el enlace que recibiste por correo.'
        );
      } else {
        setErrorMessage(
          res.problem?.detail || 'No fue posible consultar el pedido en este momento. Intenta de nuevo más tarde.'
        );
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let resolvedToken = token;
    let transactionIdHint: string | null = null;

    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (!resolvedToken) {
        resolvedToken = params.get('token');
        if (resolvedToken) {
          setToken(resolvedToken);
        }
      }
      transactionIdHint = params.get('id');
    }

    if (!resolvedToken) {
      setLoading(false);
      setErrorStatus(400);
      setErrorMessage(
        'No se proporcionó un token de seguimiento. Para ver el estado de tu pedido, accede a través del enlace enviado a tu correo.'
      );
      return;
    }

    async function initOrder(tok: string, txId: string | null) {
      // If returning from Wompi with ?id=..., verify once with backend and strip ?id= from URL (S3, S7)
      if (txId && !hasAttemptedVerifyRef.current) {
        hasAttemptedVerifyRef.current = true;
        try {
          await verifyPayment(tok, txId);
        } catch (vErr) {
          console.error('Error verifying payment from redirect hint:', vErr);
        } finally {
          // Remove ?id= from URL without page reload
          if (typeof window !== 'undefined' && window.history && window.history.replaceState) {
            const cleanParams = new URLSearchParams(window.location.search);
            cleanParams.delete('id');
            const cleanUrl = `${window.location.pathname}${cleanParams.toString() ? '?' + cleanParams.toString() : ''}`;
            window.history.replaceState(null, '', cleanUrl);
          }
        }
      }

      await fetchOrder(tok);
    }

    initOrder(resolvedToken, transactionIdHint);
  }, [token, fetchOrder]);

  useEffect(() => {
    let isMounted = true;
    if (!order || !order.lines || order.lines.length === 0) {
      setOriginData(null);
      return;
    }

    fetchOrderOrigin(order.lines).then((data) => {
      if (isMounted) {
        setOriginData(data);
      }
    });

    return () => {
      isMounted = false;
    };
  }, [order]);

  // Loading state
  if (loading) {
    return (
      <main className="max-w-[1320px] w-full mx-auto px-6 md:px-12 py-16 flex flex-col items-center justify-center text-center gap-4">
        <div
          role="status"
          aria-live="polite"
          className="flex flex-col items-center gap-3"
        >
          <span className="w-10 h-10 border-4 border-hero border-solid rounded-full animate-spin" />
          <span className="font-condensed text-xl font-bold uppercase tracking-wider text-muted-foreground">
            Cargando estado del pedido…
          </span>
        </div>
      </main>
    );
  }

  // Error state (404, 400, or network problem)
  if (errorStatus || !order) {
    return (
      <main className="max-w-[1320px] w-full mx-auto px-6 md:px-12 py-16 flex flex-col items-center justify-center text-center gap-6">
        <div
          role="alert"
          className="max-w-xl w-full p-8 bg-card border-2 border-destructive rounded-3xl flex flex-col items-center gap-4 shadow-sm"
        >
          <span className="text-4xl">🔍</span>
          <h1 className="font-sans text-2xl md:text-3xl font-extrabold m-0 text-destructive">
            {errorStatus === 404 ? 'Pedido no encontrado' : 'Enlace no válido'}
          </h1>
          <p className="text-base text-foreground/80 leading-relaxed m-0">
            {errorMessage}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <a
              href="/tienda"
              className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl bg-hero text-foreground font-sans text-base font-bold uppercase tracking-wide hover:opacity-90"
            >
              Ir a la tienda
            </a>
            {token && (
              <button
                type="button"
                onClick={() => fetchOrder(token)}
                className="inline-flex items-center justify-center min-h-[48px] px-6 rounded-xl border-2 border-border text-foreground font-sans text-base font-bold uppercase tracking-wide hover:bg-card"
              >
                Reintentar
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  // Resolved view state: 'Pagado' | 'Confirmando' | 'Rechazado' | 'Vencido' | 'Cancelado'
  const viewState = resolveTrackingViewState(order.status, order.payment);

  // Order tracking steps: only active for Pagado and Confirmando (canvas conSeguimiento: true)
  const conSeguimiento = viewState === 'Pagado' || viewState === 'Confirmando';
  const steps = conSeguimiento ? computeOrderTrackingSteps(order.status) : [];

  let notices: OrderNoticeItem[] = [];
  if (viewState === 'Pagado') {
    notices = [
      {
        marca: '@',
        titulo: 'Guarda el correo de confirmación',
        texto:
          'Trae un enlace privado. Es la única llave para ver tu pedido: no hay consulta pública por número.',
      },
      {
        marca: '→',
        titulo: 'Te escribimos cuando salga',
        texto: 'Con la transportadora y el número de guía para rastrearlo en tiempo real.',
      },
    ];
  } else if (viewState === 'Confirmando') {
    notices = [
      {
        marca: '!',
        titulo: 'No pagues dos veces',
        texto:
          'Si ya aprobaste el pago en tu banco o en tu app, espera la confirmación antes de intentarlo de nuevo.',
      },
      {
        marca: '@',
        titulo: 'Te avisamos por correo',
        texto:
          'Apenas el pago quede confirmado recibes el correo de confirmación para seguir tu pedido.',
      },
    ];
  } else if (viewState === 'Vencido') {
    notices = [
      {
        marca: '$',
        titulo: '¿Alcanzaste a pagar?',
        texto:
          'Si tu pago llega tarde, confirmamos el pedido si todavía hay inventario. Si no, te devolvemos el dinero.',
      },
      {
        marca: '↻',
        titulo: 'Los precios pueden cambiar',
        texto:
          'Al armar el pedido de nuevo se calculan otra vez precios, tarifas de envío y disponibilidad.',
      },
    ];
  } else if (viewState === 'Cancelado') {
    notices = [
      {
        marca: '↻',
        titulo: 'Los precios pueden cambiar',
        texto:
          'Al armar el pedido de nuevo se calculan otra vez precios, tarifas de envío y disponibilidad.',
      },
    ];
  } else if (viewState === 'Rechazado') {
    notices = [
      {
        marca: '?',
        titulo: 'Por qué puede pasar',
        texto:
          'Fondos insuficientes, datos mal escritos o una validación de tu entidad financiera.',
      },
      {
        marca: '↻',
        titulo: 'Puedes reintentar',
        texto:
          'Las veces que necesites mientras el pedido siga apartado. Solo se cobra un pago.',
      },
    ];
  }

  return (
    <div className="w-full bg-background text-foreground min-h-screen flex flex-col font-sans">
      {/* Hero section */}
      <OrderTrackingHero
        order={order}
        onTimerExpire={() => {
          if (token) fetchOrder(token);
        }}
      />

      {/* Main content body */}
      <main className="flex-1 w-full max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-16 flex flex-col gap-8 md:gap-10">
        {/* Step progress timeline */}
        {conSeguimiento && steps.length > 0 && (
          <OrderTrackingStepsSection
            steps={steps}
            subtitle={viewState === 'Confirmando' ? 'Esta página se actualiza sola.' : undefined}
          />
        )}

        {/* Delivery & Summary cards */}
        <div className="flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
          {/* Left Column: Delivery address & notices */}
          <div className="flex-1 w-full flex flex-col gap-6">
            <OrderDeliveryCard
              shippingAddress={order.shipping_address}
              status={order.status}
              shipment={order.shipment}
            />
            <OrderNoticesGrid notices={notices} />
          </div>

          {/* Right Column: Order summary aside */}
          <OrderSummaryAside
            lines={order.lines}
            subtotalAmount={order.subtotal_amount}
            shippingAmount={order.shipping_amount}
            totalAmount={order.total_amount}
            status={order.status}
            payment={order.payment}
          />
        </div>

        {/* Origin section */}
        {originData && (
          <OrderOriginCard
            title={resolveOriginCardTitle(viewState)}
            originSlug={originData.originSlug}
            department={originData.department}
            farmerStory={originData.story}
          />
        )}
      </main>
    </div>
  );
}
