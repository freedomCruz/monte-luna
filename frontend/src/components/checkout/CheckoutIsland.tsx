import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $cartItems, clearCart } from '../../lib/cart/store';
import {
  type CheckoutFormData,
  type CheckoutFormErrors,
  type StoredPlacedOrder,
  getDefaultCheckoutFormData,
  loadCheckoutData,
  saveCheckoutData,
  validateCheckoutForm,
  loadPlacedOrder,
  savePlacedOrder,
  clearPlacedOrder,
  mapFormDataToPlaceOrderRequest,
} from '../../lib/checkout/state';
import {
  getDepartments,
  getMunicipalitiesByDepartment,
  getDepartmentByCode,
  getMunicipalityByCode,
} from '../../lib/checkout/divipola';
import { fetchCartAvailabilities } from '../../lib/cart/pricing';
import type { VariantAvailability } from '../../lib/catalog/availabilities';
import {
  requestOrderQuote,
  placeOrder,
  type OrderQuote,
} from '../../lib/orders/client';
import {
  startPayment,
  loadWompiWidgetScript,
  openWompiWidget,
  verifyPayment,
  type WompiWidgetResult,
} from '../../lib/payments/client';
import { formatMoneyCop } from '../../lib/shared/formatters';
import { generateUuid } from '../../lib/shared/utils';
import { CheckoutDatosStep } from './CheckoutDatosStep';
import { CheckoutPaymentStep } from './CheckoutPaymentStep';

export function CheckoutIsland() {
  const items = useStore($cartItems);

  const [formData, setFormData] = useState<CheckoutFormData>(() => {
    const saved = loadCheckoutData();
    return saved ?? getDefaultCheckoutFormData();
  });
  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Quote state
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Order submission state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  // Placed order from storage
  const [placedOrder, setPlacedOrder] = useState<StoredPlacedOrder | null>(() => {
    if (items.length > 0) {
      clearPlacedOrder();
      return null;
    }
    const existing = loadPlacedOrder();
    // Validate stored order expiry: if expired, clear it
    if (existing && existing.reservation_expires_at) {
      const expires = new Date(existing.reservation_expires_at).getTime();
      if (expires <= Date.now()) {
        clearPlacedOrder();
        return null;
      }
    }
    return existing;
  });

  // Flow step: 'datos' (Step 2) | 'pago' (Step 3)
  const [step, setStep] = useState<'datos' | 'pago'>(() => {
    if (items.length > 0) return 'datos';
    const savedPlaced = loadPlacedOrder();
    return savedPlaced ? 'pago' : 'datos';
  });

  // Wompi payment interaction state (Step 3)
  const [isPaymentLoading, setIsPaymentLoading] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [isPaymentWindowOpen, setIsPaymentWindowOpen] = useState(false);
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState<string>(() => generateUuid());

  // Catalog live availability
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());
  const [, setLoadingAvailabilities] = useState(false);

  // Departments from DIVIPOLA
  const departments = useMemo(() => getDepartments(), []);

  // Municipalities for chosen department
  const municipalities = useMemo(() => {
    if (!formData.departmentCode) return [];
    return getMunicipalitiesByDepartment(formData.departmentCode);
  }, [formData.departmentCode]);

  const selectedDept = useMemo(
    () => getDepartmentByCode(formData.departmentCode),
    [formData.departmentCode]
  );
  const selectedMuni = useMemo(
    () => getMunicipalityByCode(formData.municipalityCode),
    [formData.municipalityCode]
  );

  // Load availabilities on mount / items change
  useEffect(() => {
    let cancelled = false;
    if (items.length === 0) return;

    async function load() {
      setLoadingAvailabilities(true);
      try {
        const result = await fetchCartAvailabilities(items);
        if (!cancelled) setAvailabilities(result);
      } catch (err) {
        console.error('Failed to load availabilities in checkout:', err);
      } finally {
        if (!cancelled) setLoadingAvailabilities(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Request quote whenever municipalityCode or cart items change
  const fetchQuote = useCallback(async () => {
    if (!formData.municipalityCode || items.length === 0) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    setQuoteLoading(true);
    setQuoteError(null);

    const quoteItems = items.map((i) => ({
      variant_id: i.variant_id,
      quantity: i.quantity,
    }));

    const result = await requestOrderQuote({
      municipality_code: formData.municipalityCode,
      items: quoteItems,
    });

    setQuoteLoading(false);

    if (result.ok) {
      setQuote(result.quote);
      setQuoteError(null);
    } else {
      setQuote(null);
      if (result.code === 'unsupported_destination') {
        setQuoteError('unsupported_destination');
      } else if (result.code === 'insufficient_stock') {
        setQuoteError('insufficient_stock');
      } else if (result.code === 'variant_unavailable') {
        setQuoteError('Uno o más productos ya no están disponibles.');
      } else {
        setQuoteError(result.problem?.detail || 'No fue posible cotizar el envío para este destino.');
      }
    }
  }, [formData.municipalityCode, items]);

  useEffect(() => {
    fetchQuote();
  }, [fetchQuote]);

  // Persist form changes to sessionStorage
  const handleChange = <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value };
      saveCheckoutData(updated);
      return updated;
    });

    if (hasAttemptedSubmit) {
      // Re-validate dynamically on edit after first submit attempt
      const nextFormData = { ...formData, [field]: value };
      const validation = validateCheckoutForm(nextFormData);
      setErrors(validation.errors);
    }
  };

  const handleContinueToPayment = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasAttemptedSubmit(true);
    setSubmitError(null);

    const validation = validateCheckoutForm(formData);
    setErrors(validation.errors);

    if (!validation.isValid) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    saveCheckoutData(formData);

    // Call POST /api/v1/orders with Idempotency-Key
    setIsSubmitting(true);
    try {
      const placeOrderReq = mapFormDataToPlaceOrderRequest(formData, items);
      const res = await placeOrder(placeOrderReq, idempotencyKey);

      if (res.ok) {
        const orderData: StoredPlacedOrder = {
          order_id: res.order.order_id,
          order_number: res.order.order_number,
          status: res.order.status,
          total_amount: res.order.total_amount,
          reservation_expires_at: res.order.reservation_expires_at,
          tracking_token: res.order.tracking_token,
        };
        savePlacedOrder(orderData);
        setPlacedOrder(orderData);
        clearCart();
        setStep('pago');
        if (typeof window !== 'undefined') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      } else {
        if (res.code === 'insufficient_stock') {
          setSubmitError(
            'Uno o más productos ya no cuentan con stock suficiente para apartar tu pedido. Por favor regresa al carrito para actualizar las cantidades.'
          );
        } else if (res.code === 'variant_unavailable') {
          setSubmitError(
            'Uno o más productos seleccionados ya no están disponibles en la tienda.'
          );
        } else if (res.code === 'unsupported_destination') {
          setSubmitError(
            'Lo sentimos, en este momento no contamos con cobertura de envío a este municipio.'
          );
        } else if (res.code === 'unknown_municipality') {
          setSubmitError(
            'El municipio seleccionado no es válido o no fue reconocido por el sistema.'
          );
        } else if (res.code === 'validation_failed') {
          setSubmitError(
            res.problem?.detail || 'Hubo un error en los datos enviados. Por favor revisa el formulario.'
          );
        } else {
          setSubmitError(
            res.problem?.detail || 'No fue posible crear el pedido. Intenta nuevamente en unos instantes.'
          );
        }
        // Regenerate key on fatal error so user can re-attempt cleanly
        setIdempotencyKey(generateUuid());
      }
    } catch (err) {
      console.error('Error placing order:', err);
      setSubmitError('Ocurrió un error inesperado al procesar tu pedido. Por favor intenta de nuevo.');
      setIdempotencyKey(generateUuid());
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle clicking "Pagar" in Step 3 (Task F1 / Spec S7)
  const handlePay = async () => {
    if (!placedOrder || !placedOrder.tracking_token) {
      setPaymentError('No hay un pedido activo para pagar.');
      return;
    }

    // Check if reservation already expired
    if (placedOrder.reservation_expires_at) {
      if (new Date(placedOrder.reservation_expires_at).getTime() <= Date.now()) {
        setPaymentError('La reserva de este pedido ya expiró. El inventario fue liberado.');
        return;
      }
    }

    setIsPaymentLoading(true);
    setPaymentError(null);

    try {
      // 1. Dynamic script injection of Wompi widget (Gate G2, L6)
      await loadWompiWidgetScript();

      // 2. Call POST /api/v1/payments with idempotency key
      const startResult = await startPayment(placedOrder.tracking_token, paymentIdempotencyKey);

      if (!startResult.ok) {
        if (startResult.code === 'order_not_pending_payment') {
          setPaymentError('El pedido no se encuentra en estado pendiente de pago.');
        } else if (startResult.code === 'reservation_expired') {
          setPaymentError('El tiempo de reserva de este pedido ha expirado.');
        } else {
          setPaymentError(
            startResult.problem?.detail || 'No fue posible iniciar el pago. Intenta nuevamente.'
          );
        }
        // Regenerate idempotency key on failure for clean re-attempt
        setPaymentIdempotencyKey(generateUuid());
        setIsPaymentLoading(false);
        return;
      }

      // 3. Mark modal open ("Ventana de pago" state in canvas)
      setIsPaymentWindowOpen(true);
      setIsPaymentLoading(false);

      // 4. Open Wompi Widget
      openWompiWidget(startResult.checkout, async (widgetResult: WompiWidgetResult) => {
        // Modal closes when widget returns callback or buyer finishes
        setIsPaymentWindowOpen(false);

        const txId = widgetResult?.transaction?.id || null;

        // Verify payment in background/callback
        if (placedOrder?.tracking_token) {
          try {
            await verifyPayment(placedOrder.tracking_token, txId);
          } catch (vErr) {
            console.error('Failed to verify payment after widget callback:', vErr);
          }
        }

        // Navigate to /pedido tracking view with token
        if (typeof window !== 'undefined' && placedOrder?.tracking_token) {
          const redirectUrl = `/pedido?token=${encodeURIComponent(placedOrder.tracking_token)}`;
          window.location.href = redirectUrl;
        }
      });
    } catch (err) {
      console.error('Error starting Wompi payment:', err);
      setPaymentError('Ocurrió un error al preparar la pasarela de pago. Intenta de nuevo.');
      setPaymentIdempotencyKey(generateUuid());
      setIsPaymentLoading(false);
    }
  };

  // If cart is empty and not already on pago step with placed order, show empty state
  if (items.length === 0 && (!placedOrder || step !== 'pago')) {
    return (
      <div className="w-full max-w-[800px] mx-auto px-6 py-20 text-center flex flex-col items-center gap-6">
        <h1 className="font-condensed text-4xl md:text-5xl font-extrabold uppercase">
          Tu carrito está vacío
        </h1>
        <p className="text-lg text-muted-foreground max-w-md">
          Agrega café de origen o chocolates antes de proceder al pago.
        </p>
        <a
          href="/tienda"
          className="inline-flex items-center justify-center min-h-[56px] px-8 rounded-xl bg-foreground text-background font-condensed text-xl font-extrabold uppercase hover:opacity-90"
        >
          Explorar la tienda
        </a>
      </div>
    );
  }

  // Total display formatting - server quote is authoritative (no client calculation)
  const totalDisplay = placedOrder
    ? formatMoneyCop(placedOrder.total_amount)
    : quote
      ? formatMoneyCop(quote.total_amount)
      : quoteLoading
        ? 'Calculando…'
        : 'Sin cotizar';
  const totalLabel = quote || placedOrder ? 'Total' : 'Total sin envío';

  // Render Step 3: Pago Shell
  if (step === 'pago') {
    return (
      <CheckoutPaymentStep
        formData={formData}
        quote={quote}
        quoteError={quoteError}
        quoteLoading={quoteLoading}
        selectedDept={selectedDept}
        selectedMuni={selectedMuni}
        items={items}
        availabilities={availabilities}
        totalDisplay={totalDisplay}
        orderNumber={placedOrder?.order_number}
        trackingToken={placedOrder?.tracking_token}
        reservationExpiresAt={placedOrder?.reservation_expires_at}
        onBackToDatos={() => {
          setStep('datos');
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
        onPay={handlePay}
        isPaymentLoading={isPaymentLoading}
        paymentError={paymentError}
        isPaymentWindowOpen={isPaymentWindowOpen}
        onClosePaymentWindow={() => setIsPaymentWindowOpen(false)}
      />
    );
  }

  // Render Step 2: Datos y Envío
  return (
    <CheckoutDatosStep
      formData={formData}
      errors={errors}
      hasAttemptedSubmit={hasAttemptedSubmit}
      departments={departments}
      municipalities={municipalities}
      quote={quote}
      quoteLoading={quoteLoading}
      quoteError={quoteError}
      submitError={submitError}
      isSubmitting={isSubmitting}
      selectedDept={selectedDept}
      selectedMuni={selectedMuni}
      items={items}
      availabilities={availabilities}
      totalLabel={totalLabel}
      totalDisplay={totalDisplay}
      onChange={handleChange}
      onSubmit={handleContinueToPayment}
      onRetryQuote={fetchQuote}
    />
  );
}
