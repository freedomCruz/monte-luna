import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { $cartItems } from '../../lib/cart-store';
import { fetchCartAvailabilities } from '../../lib/cart-pricing';
import type { VariantAvailability } from '../../lib/availabilities-client';
import { formatMoneyCop } from '../../lib/formatters';
import {
  type CheckoutFormData,
  type CheckoutFormErrors,
  getDefaultCheckoutFormData,
  loadCheckoutData,
  saveCheckoutData,
  validateCheckoutForm,
} from '../../lib/checkout/state';
import {
  getDepartments,
  getMunicipalitiesByDepartment,
  getDepartmentByCode,
  getMunicipalityByCode,
} from '../../lib/checkout/divipola';
import { requestOrderQuote, type OrderQuote } from '../../lib/orders/client';
import { CheckoutDatosStep } from './CheckoutDatosStep';
import { CheckoutPaymentStep } from './CheckoutPaymentStep';

export function CheckoutIsland() {
  const items = useStore($cartItems);

  // Live variant pricing & stock
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());
  const [loadingAvailabilities, setLoadingAvailabilities] = useState(false);

  // Multi-step flow: 'datos' (step 2) -> 'pago' (step 3)
  const [step, setStep] = useState<'datos' | 'pago'>('datos');

  // Form data initialized from sessionStorage if available
  const [formData, setFormData] = useState<CheckoutFormData>(() => {
    const saved = loadCheckoutData();
    return saved ?? getDefaultCheckoutFormData();
  });

  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

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

  const handleContinueToPayment = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setHasAttemptedSubmit(true);

    const validation = validateCheckoutForm(formData);
    setErrors(validation.errors);

    if (!validation.isValid) {
      if (typeof window !== 'undefined') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return;
    }

    saveCheckoutData(formData);
    setStep('pago');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // If cart is empty, show empty state
  if (items.length === 0) {
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

  // Fallback subtotal calculation from live availabilities while quote loads
  const fallbackSubtotalMinor = items.reduce((sum, item) => {
    const avail = availabilities.get(item.variant_id);
    return sum + (avail?.price_amount ?? 0) * item.quantity;
  }, 0);

  // Total display formatting
  const totalDisplay = quote
    ? formatMoneyCop(quote.total_amount)
    : formatMoneyCop(fallbackSubtotalMinor);
  const totalLabel = quote ? 'Total' : 'Total estimado';

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
        fallbackSubtotalMinor={fallbackSubtotalMinor}
        totalDisplay={totalDisplay}
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
      selectedDept={selectedDept}
      selectedMuni={selectedMuni}
      items={items}
      availabilities={availabilities}
      fallbackSubtotalMinor={fallbackSubtotalMinor}
      totalLabel={totalLabel}
      totalDisplay={totalDisplay}
      onChange={handleChange}
      onSubmit={handleContinueToPayment}
      onRetryQuote={fetchQuote}
    />
  );
}
