import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $cartItems, clearCart } from '../../lib/cart/store';
import { fetchCartAvailabilities } from '../../lib/cart/pricing';
import type { VariantAvailability } from '../../lib/catalog/availabilities';
import { formatMoneyCop } from '../../lib/shared/formatters';
import { generateUuid } from '../../lib/shared/utils';
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
import { requestOrderQuote, placeOrder, type OrderQuote } from '../../lib/orders/client';
import { CheckoutDatosStep } from './CheckoutDatosStep';
import { CheckoutPaymentStep } from './CheckoutPaymentStep';

export function CheckoutIsland() {
  const items = useStore($cartItems);

  // Live variant pricing & stock
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());
  const [loadingAvailabilities, setLoadingAvailabilities] = useState(false);

  // Placed order from storage only if cart is empty (e.g. arriving directly at Step 3 for a previously placed order)
  const [placedOrder, setPlacedOrder] = useState<StoredPlacedOrder | null>(() => {
    if (items.length > 0) {
      clearPlacedOrder();
      return null;
    }
    return loadPlacedOrder();
  });

  // Multi-step flow: if there are items in cart, always start at 'datos' (step 2)
  const [step, setStep] = useState<'datos' | 'pago'>(() => {
    if (items.length > 0) return 'datos';
    const savedPlaced = loadPlacedOrder();
    return savedPlaced ? 'pago' : 'datos';
  });

  // Form data initialized from sessionStorage if available
  const [formData, setFormData] = useState<CheckoutFormData>(() => {
    const saved = loadCheckoutData();
    return saved ?? getDefaultCheckoutFormData();
  });

  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Idempotency key per checkout session attempt
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() => generateUuid());

  // Live order quote state (from backend /api/v1/orders/quote)
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Departments from DIVIPOLA
  const departments = useMemo(() => getDepartments(), []);

  // Municipalities for the selected department
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
        onBackToDatos={() => {
          setStep('datos');
          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
        }}
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
