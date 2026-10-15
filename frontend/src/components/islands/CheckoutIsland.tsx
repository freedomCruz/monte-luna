import React, { useState, useEffect } from 'react';
import { useStore } from '@nanostores/react';
import { $cartItems } from '../../lib/cart-store';
import { fetchCartAvailabilities } from '../../lib/cart-pricing';
import type { VariantAvailability } from '../../lib/availabilities-client';
import { requestOrderQuote, type OrderQuote, type OrderQuoteResult } from '../../lib/orders-client';
import {
  getDepartments,
  getMunicipalitiesByDepartment,
  getDepartmentByCode,
  getMunicipalityByCode,
  type DivipolaMunicipality,
} from '../../lib/divipola';
import {
  type CheckoutFormData,
  type CheckoutFormErrors,
  getDefaultCheckoutFormData,
  loadCheckoutData,
  saveCheckoutData,
  validateCheckoutForm,
} from '../../lib/checkout-state';
import { formatMoneyCop } from '../../lib/formatters';

interface CheckoutIslandProps {
  initialStep?: 'datos' | 'pago';
}

export function CheckoutIsland({ initialStep = 'datos' }: CheckoutIslandProps) {
  const items = useStore($cartItems);
  const [step, setStep] = useState<'datos' | 'pago'>(initialStep);
  const [formData, setFormData] = useState<CheckoutFormData>(() => {
    return loadCheckoutData() || getDefaultCheckoutFormData();
  });
  const [errors, setErrors] = useState<CheckoutFormErrors>({});
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);

  // Live prices and stock for cart line display
  const [availabilities, setAvailabilities] = useState<Map<string, VariantAvailability>>(new Map());

  // Quote state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<{
    code: string;
    title: string;
    detail: string;
  } | null>(null);

  // Departments and municipalities
  const departments = getDepartments();
  const [municipalities, setMunicipalities] = useState<DivipolaMunicipality[]>(() => {
    return formData.departmentCode ? getMunicipalitiesByDepartment(formData.departmentCode) : [];
  });

  // Load live catalog availabilities for cart items
  useEffect(() => {
    if (items.length === 0) return;
    let isMounted = true;
    fetchCartAvailabilities(items).then((map) => {
      if (isMounted) setAvailabilities(map);
    });
    return () => {
      isMounted = false;
    };
  }, [items]);

  // Sync municipalities when department changes
  useEffect(() => {
    if (formData.departmentCode) {
      const list = getMunicipalitiesByDepartment(formData.departmentCode);
      setMunicipalities(list);
    } else {
      setMunicipalities([]);
    }
  }, [formData.departmentCode]);

  // Request quote whenever items or municipality changes
  useEffect(() => {
    if (items.length === 0 || !formData.municipalityCode) {
      setQuote(null);
      setQuoteError(null);
      return;
    }

    let isMounted = true;
    setQuoteLoading(true);

    requestOrderQuote({
      items: items.map((i) => ({ variant_id: i.variant_id, quantity: i.quantity })),
      municipality_code: formData.municipalityCode,
    }).then((result: OrderQuoteResult) => {
      if (!isMounted) return;
      setQuoteLoading(false);
      if (result.ok) {
        setQuote(result.quote);
        setQuoteError(null);
      } else {
        setQuote(null);
        if (result.code === 'unsupported_destination') {
          const muni = getMunicipalityByCode(formData.municipalityCode);
          const muniName = muni?.display_name || 'tu municipio';
          setQuoteError({
            code: 'unsupported_destination',
            title: `Todavía no llegamos a ${muniName}`,
            detail: 'Prueba con otro municipio o escríbenos.',
          });
        } else if (result.code === 'insufficient_stock') {
          setQuoteError({
            code: 'insufficient_stock',
            title: 'Una de tus bolsas se agotó mientras comprabas',
            detail: 'Uno o más productos ya no tienen existencias suficientes. Ajusta tu carrito.',
          });
        } else {
          setQuoteError({
            code: result.code,
            title: 'No pudimos calcular el envío',
            detail: result.problem?.detail || 'Por favor verifica la información e intenta de nuevo.',
          });
        }
      }
    });

    return () => {
      isMounted = false;
    };
  }, [items, formData.municipalityCode]);

  // Handle form change
  const handleChange = <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => {
    const updated = { ...formData, [field]: value };
    setFormData(updated);
    saveCheckoutData(updated);

    if (hasAttemptedSubmit) {
      const res = validateCheckoutForm(updated);
      setErrors(res.errors);
    }
  };

  const handleDepartmentChange = (deptCode: string) => {
    const updated: CheckoutFormData = {
      ...formData,
      departmentCode: deptCode,
      municipalityCode: '', // reset municipality on department change
    };
    setFormData(updated);
    saveCheckoutData(updated);
    if (hasAttemptedSubmit) {
      const res = validateCheckoutForm(updated);
      setErrors(res.errors);
    }
  };

  const handleContinueToPayment = (e?: React.SyntheticEvent) => {
    if (e) e.preventDefault();
    setHasAttemptedSubmit(true);
    const res = validateCheckoutForm(formData);
    setErrors(res.errors);

    if (!res.isValid) {
      return;
    }

    if (quoteError) {
      return;
    }

    // Advance to step 3 (pago)
    setStep('pago');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // If cart is empty, render empty state
  if (items.length === 0) {
    return (
      <main className="max-w-[1320px] mx-auto px-6 md:px-12 py-16 text-center">
        <h1 className="font-condensed text-4xl md:text-5xl font-extrabold uppercase mb-4 text-foreground">
          Tu carrito está vacío
        </h1>
        <p className="text-muted-foreground text-lg mb-8 max-w-md mx-auto">
          Agrega café o cacao desde la tienda para iniciar tu compra.
        </p>
        <a
          href="/tienda"
          className="inline-flex items-center justify-center min-h-[52px] px-8 rounded-xl bg-brand-green text-primary-foreground font-bold uppercase hover:bg-foreground transition-colors"
        >
          Explorar la tienda
        </a>
      </main>
    );
  }

  // Selected department and municipality entities
  const selectedDept = getDepartmentByCode(formData.departmentCode);
  const selectedMuni = getMunicipalityByCode(formData.municipalityCode);

  // Calculate temporary unquoted subtotal display if quote isn't loaded yet
  const fallbackSubtotalMinor = items.reduce((sum, item) => {
    const unitPrice = availabilities.get(item.variant_id)?.price_amount ?? 0;
    return sum + item.quantity * unitPrice;
  }, 0);

  const totalDisplay = quote
    ? formatMoneyCop(quote.total_amount)
    : fallbackSubtotalMinor > 0
      ? formatMoneyCop(fallbackSubtotalMinor)
      : '...';

  const totalLabel = quote ? 'Total' : 'Total sin envío';

  // ----------------------------------------------------
  // STEP 3: REVISA Y PAGA (M-Checkout-Pago)
  // ----------------------------------------------------
  if (step === 'pago') {
    const recipientDisplayName = formData.sameRecipient
      ? formData.fullName
      : formData.recipientName;
    const recipientPhoneDisplay = formData.recipientPhone || formData.phone;

    return (
      <div className="w-full bg-background text-foreground min-h-screen flex flex-col font-sans">
        {/* Top banner */}
        <div className="bg-brand-green text-primary-foreground px-6 py-2.5 text-sm md:text-base font-medium flex flex-wrap justify-center items-center gap-x-6 gap-y-1 text-center">
          <span>Compras como invitado, sin crear cuenta</span>
          <span aria-hidden="true" className="text-brand-yellow">•</span>
          <span>Pago seguro con Wompi</span>
          <span aria-hidden="true" className="text-brand-yellow">•</span>
          <span>Envíos a toda Colombia</span>
        </div>

        {/* Step indicator header */}
        <div className="bg-hero border-b border-foreground/10">
          <div className="max-w-[1320px] mx-auto px-6 md:px-12 py-8 md:py-12 flex flex-wrap items-end justify-between gap-6 md:gap-16">
            <div className="flex flex-col gap-2">
              <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
                Paso 3 de 3
              </span>
              <h1 className="font-condensed text-4xl md:text-6xl font-extrabold uppercase tracking-tight text-foreground">
                Revisa y paga
              </h1>
            </div>

            <ol
              aria-label="Pasos de compra"
              className="flex items-center gap-3 text-sm md:text-base font-bold"
            >
              <li className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-success text-white">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                  </svg>
                </span>
                <a href="/carrito" className="underline underline-offset-4 hover:text-accent">
                  Carrito
                </a>
              </li>
              <li aria-hidden="true" className="w-6 md:w-12 h-0.5 bg-foreground"></li>
              <li className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('datos')}
                  aria-label="Volver al paso de datos y envío"
                  className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-success text-white"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setStep('datos')}
                  className="underline underline-offset-4 hover:text-accent font-bold"
                >
                  Datos y envío
                </button>
              </li>
              <li aria-hidden="true" className="w-6 md:w-12 h-0.5 bg-foreground"></li>
              <li aria-current="step" className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background font-condensed text-lg md:text-xl font-extrabold">
                  3
                </span>
                <span>Pago</span>
              </li>
            </ol>
          </div>
        </div>

        {/* Main Content */}
        <main className="max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-16 w-full flex flex-col lg:flex-row items-start gap-10">
          <div className="flex-1 w-full flex flex-col gap-6">
            {/* Out of stock alert banner if quote error occurred */}
            {quoteError && (
              <div
                role="alert"
                className="flex flex-wrap items-center gap-4 p-5 border-2 border-destructive rounded-2xl bg-card"
              >
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  className="text-destructive shrink-0"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7.5v5.5M12 16.5v.2"></path>
                </svg>
                <div className="flex-1 flex flex-col gap-1">
                  <span className="text-lg font-extrabold">{quoteError.title}</span>
                  <span className="text-sm text-foreground/80">{quoteError.detail}</span>
                </div>
                <a
                  href="/carrito"
                  className="inline-flex items-center justify-center min-h-[48px] px-5 rounded-xl bg-foreground text-primary-foreground text-sm font-bold uppercase hover:bg-foreground/80 transition-colors"
                >
                  Ajustar el carrito
                </a>
              </div>
            )}

            {/* Step 2 summary card */}
            <section
              aria-labelledby="h-revisa"
              className="flex flex-col px-6 md:px-8 py-3 bg-card border border-border rounded-2xl shadow-xs"
            >
              <h2 id="h-revisa" className="sr-only">
                Tus datos
              </h2>

              {/* Contact */}
              <div className="flex items-start justify-between gap-4 py-5 border-b border-border">
                <span className="w-28 pt-1 font-condensed text-base font-bold tracking-wider uppercase text-muted-foreground">
                  Contacto
                </span>
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-lg md:text-xl font-extrabold">{formData.fullName}</span>
                  <span className="text-base text-foreground/80">{formData.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('datos')}
                  aria-label="Cambiar los datos de contacto"
                  className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
                >
                  Cambiar
                </button>
              </div>

              {/* Shipping Address */}
              <div className="flex items-start justify-between gap-4 py-5 border-b border-border">
                <span className="w-28 pt-1 font-condensed text-base font-bold tracking-wider uppercase text-muted-foreground">
                  Entrega
                </span>
                <div className="flex-1 flex flex-col gap-0.5">
                  <span className="text-lg md:text-xl font-extrabold">
                    {formData.addressLine1}
                    {formData.addressLine2 ? `, ${formData.addressLine2}` : ''}
                  </span>
                  <span className="text-base text-foreground/80">
                    {selectedMuni?.display_name || ''}, {selectedDept?.display_name || ''}
                  </span>
                  <span className="text-sm text-muted-foreground mt-0.5">
                    Recibe {recipientDisplayName} · {recipientPhoneDisplay}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('datos')}
                  aria-label="Cambiar la dirección de entrega"
                  className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
                >
                  Cambiar
                </button>
              </div>

              {/* Shipping info */}
              <div className="flex items-start justify-between gap-4 py-5 border-b border-border">
                <span className="w-28 pt-1 font-condensed text-base font-bold tracking-wider uppercase text-muted-foreground">
                  Envío
                </span>
                <div className="flex-1 flex flex-wrap items-center gap-3">
                  <span className="text-lg md:text-xl font-extrabold">
                    Llega en {quote?.shipping.estimated_days_min ?? 2} a{' '}
                    {quote?.shipping.estimated_days_max ?? 4} días hábiles
                  </span>
                  <span className="px-3 py-1 rounded-lg bg-brand-green text-primary-foreground text-sm font-bold">
                    {quote?.shipping.is_free_shipping
                      ? 'Gratis'
                      : formatMoneyCop(quote?.shipping_amount ?? 950000)}
                  </span>
                </div>
              </div>

              {/* Invoice info */}
              <div className="flex items-start justify-between gap-4 py-5">
                <span className="w-28 pt-1 font-condensed text-base font-bold tracking-wider uppercase text-muted-foreground">
                  Factura
                </span>
                <div className="flex-1 flex flex-col gap-0.5">
                  {formData.wantsInvoice ? (
                    <>
                      <span className="text-lg md:text-xl font-extrabold">
                        {formData.documentType} {formData.documentNumber}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {formData.personType === 'legal'
                          ? 'Factura electrónica para empresa'
                          : 'Factura a nombre de persona natural'}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg md:text-xl font-extrabold">Sin datos de factura</span>
                      <span className="text-sm text-muted-foreground">
                        Recibes la confirmación del pedido por correo.
                      </span>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setStep('datos')}
                  aria-label="Agregar o cambiar datos de factura"
                  className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
                >
                  {formData.wantsInvoice ? 'Cambiar' : 'Agregar'}
                </button>
              </div>
            </section>

            {/* Wompi Payment Information Section */}
            <section
              aria-labelledby="h-pago"
              className="flex flex-col gap-6 p-8 md:p-10 bg-foreground text-primary-foreground rounded-2xl"
            >
              <div className="flex flex-col gap-2">
                <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase text-brand-yellow">
                  Pago
                </span>
                <h2
                  id="h-pago"
                  className="font-condensed text-3xl md:text-4xl font-extrabold uppercase tracking-tight"
                >
                  Pagas en la ventana segura de Wompi.
                </h2>
                <p className="text-base md:text-lg text-primary-foreground/80 max-w-xl">
                  Ahí eliges el medio y escribes sus datos. Monteluna nunca ve ni guarda la
                  información de tu tarjeta o de tu banco.
                </p>
              </div>

              {/* Available payment methods */}
              <ul
                aria-label="Medios de pago disponibles"
                className="grid grid-cols-1 sm:grid-cols-2 gap-3"
              >
                <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <rect x="2.5" y="5" width="19" height="14" rx="2.5"></rect>
                    <path d="M2.5 10h19M6 15h4"></path>
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold">Tarjeta</span>
                    <span className="text-xs text-muted-foreground">Crédito o débito</span>
                  </div>
                </li>
                <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="M3 9.5l9-5 9 5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 19.5h18"></path>
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold">PSE</span>
                    <span className="text-xs text-muted-foreground">Débito desde tu banco</span>
                  </div>
                </li>
                <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <rect x="6" y="2.5" width="12" height="19" rx="2.5"></rect>
                    <path d="M10.5 18h3"></path>
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold">Nequi</span>
                    <span className="text-xs text-muted-foreground">Lo apruebas en la app</span>
                  </div>
                </li>
                <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="M4 8h13l-3-3M20 16H7l3 3"></path>
                  </svg>
                  <div className="flex flex-col">
                    <span className="text-base font-extrabold">Bancolombia</span>
                    <span className="text-xs text-muted-foreground">Transferencia desde tu cuenta</span>
                  </div>
                </li>
              </ul>

              {/* 3-step guarantees */}
              <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-primary-foreground/20 text-sm">
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
                  >
                    1
                  </span>
                  <span>
                    <strong className="block text-foreground/10 text-white font-extrabold">
                      Creamos tu pedido
                    </strong>
                    <span className="text-primary-foreground/80">con un número para seguirlo.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
                  >
                    2
                  </span>
                  <span>
                    <strong className="block text-foreground/10 text-white font-extrabold">
                      Lo apartamos 30 min
                    </strong>
                    <span className="text-primary-foreground/80">para que nadie se lleve tu café.</span>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
                  >
                    3
                  </span>
                  <span>
                    <strong className="block text-foreground/10 text-white font-extrabold">
                      Pagas y te confirmamos
                    </strong>
                    <span className="text-primary-foreground/80">por correo con tu enlace.</span>
                  </span>
                </li>
              </ol>

              {/* CTA */}
              <button
                type="button"
                disabled={Boolean(quoteError) || quoteLoading}
                className="w-full flex items-center justify-center gap-3 min-h-[64px] px-8 rounded-xl bg-accent text-white font-condensed text-2xl font-extrabold uppercase tracking-wide hover:opacity-95 transition-opacity disabled:opacity-50 cursor-pointer"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="5" y="10.5" width="14" height="10" rx="2"></rect>
                  <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>
                </svg>
                Pagar {totalDisplay}
              </button>

              <button
                type="button"
                onClick={() => setStep('datos')}
                className="self-center min-h-[44px] inline-flex items-center text-sm font-bold uppercase text-primary-foreground underline underline-offset-4 hover:text-brand-yellow"
              >
                ← Volver a datos y envío
              </button>
            </section>
          </div>

          {/* Sticky Summary Aside */}
          <aside
            aria-labelledby="h-pedido-pago"
            className="w-full lg:w-[380px] shrink-0 p-6 md:p-8 bg-card border border-border rounded-2xl flex flex-col gap-5 sticky top-24"
          >
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="h-pedido-pago" className="text-2xl font-extrabold">
                Tu pedido
              </h2>
              <a
                href="/carrito"
                className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
              >
                Editar
              </a>
            </div>

            {/* Line items list */}
            <div className="flex flex-col gap-4">
              {items.map((item) => {
                const availability = availabilities.get(item.variant_id);
                const unitPrice = availability?.price_amount ?? 0;
                const compareAt = availability?.compare_at_price_amount;
                const hasDiscount = Boolean(compareAt && compareAt > unitPrice);

                return (
                  <div key={item.variant_id} className="flex items-center gap-3.5">
                    <div className="relative shrink-0 w-16 h-16 rounded-xl bg-secondary flex items-center justify-center p-1">
                      {item.image_url ? (
                        <img
                          src={item.image_url}
                          alt=""
                          className="w-full h-full object-contain"
                        />
                      ) : (
                        <span className="font-condensed font-bold text-xs">Monteluna</span>
                      )}
                      <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-extrabold flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="text-base font-extrabold truncate">{item.product_name}</span>
                      <span className="text-xs text-muted-foreground">{item.variant_label}</span>
                      {availability?.production_date && item.product_type === 'coffee' && (
                        <span className="text-xs font-semibold text-brand-green">
                          Tostado el {availability.production_date}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-col items-end">
                      {hasDiscount && (
                        <s aria-label="Precio regular" className="text-xs text-muted-foreground">
                          {formatMoneyCop(compareAt! * item.quantity)}
                        </s>
                      )}
                      <span className="text-base font-extrabold">
                        {formatMoneyCop(unitPrice * item.quantity)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Totals */}
            <div className="flex flex-col gap-2.5 pt-4 border-t border-border text-base">
              <div className="flex justify-between items-center">
                <span>Subtotal</span>
                <span className="font-semibold">
                  {quote ? formatMoneyCop(quote.subtotal_amount) : formatMoneyCop(fallbackSubtotalMinor)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span>Envío</span>
                <span className="font-semibold">
                  {quote?.shipping.is_free_shipping
                    ? 'Gratis'
                    : quote
                      ? formatMoneyCop(quote.shipping_amount)
                      : 'Cotizando...'}
                </span>
              </div>
            </div>

            <div className="flex justify-between items-end pt-4 border-t-2 border-dashed border-dashed">
              <div className="flex flex-col">
                <span className="text-base font-bold">Total</span>
                <span className="text-xs text-muted-foreground">Pesos colombianos</span>
              </div>
              <span className="text-3xl font-extrabold text-foreground">{totalDisplay}</span>
            </div>
          </aside>
        </main>
      </div>
    );
  }

  // ----------------------------------------------------
  // STEP 2: DATOS Y ENVÍO (M-Checkout-Datos)
  // ----------------------------------------------------
  const errorCount = Object.keys(errors).length;
  const hasErrors = hasAttemptedSubmit && errorCount > 0;

  return (
    <div className="w-full bg-background text-foreground min-h-screen flex flex-col font-sans">
      {/* Top banner */}
      <div className="bg-brand-green text-primary-foreground px-6 py-2.5 text-sm md:text-base font-medium flex flex-wrap justify-center items-center gap-x-6 gap-y-1 text-center">
        <span>Sin crear cuenta</span>
        <span aria-hidden="true" className="text-brand-yellow">•</span>
        <span>Pago seguro con Wompi</span>
        <span aria-hidden="true" className="text-brand-yellow">•</span>
        <span>Envíos a toda Colombia</span>
      </div>

      {/* Header with step 2 */}
      <div className="bg-hero border-b border-foreground/10">
        <div className="max-w-[1320px] mx-auto px-6 md:px-12 py-8 md:py-12 flex flex-wrap items-end justify-between gap-6 md:gap-16">
          <div className="flex flex-col gap-2">
            <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
              Paso 2 de 3
            </span>
            <h1 className="font-condensed text-4xl md:text-6xl font-extrabold uppercase tracking-tight text-foreground">
              ¿A dónde lo enviamos?
            </h1>
          </div>

          <ol
            aria-label="Pasos de compra"
            className="flex items-center gap-3 text-sm md:text-base font-bold"
          >
            <li className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-success text-white">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                </svg>
              </span>
              <a href="/carrito" className="underline underline-offset-4 hover:text-accent">
                Carrito
              </a>
            </li>
            <li aria-hidden="true" className="w-6 md:w-12 h-0.5 bg-foreground"></li>
            <li aria-current="step" className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full bg-foreground text-background font-condensed text-lg md:text-xl font-extrabold">
                2
              </span>
              <span>Datos</span>
            </li>
            <li aria-hidden="true" className="w-6 md:w-12 h-0.5 bg-dashed"></li>
            <li className="flex items-center gap-2 text-muted-foreground">
              <span className="inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full border-2 border-dashed bg-card font-condensed text-lg md:text-xl font-extrabold">
                3
              </span>
              <span>Pago</span>
            </li>
          </ol>
        </div>
      </div>

      {/* Main Content Form */}
      <main className="max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-16 w-full flex flex-col lg:flex-row items-start gap-10">
        <form
          onSubmit={handleContinueToPayment}
          noValidate
          className="flex-1 w-full flex flex-col gap-8"
        >
          {/* Top error alert banner */}
          {hasErrors && (
            <div
              role="alert"
              className="flex items-start gap-3 p-4 md:p-5 border-2 border-destructive rounded-2xl bg-card"
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                className="text-destructive shrink-0 mt-0.5"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="9"></circle>
                <path d="M12 7.5v5.5M12 16.5v.2"></path>
              </svg>
              <div className="flex flex-col gap-1">
                <span className="text-base md:text-lg font-extrabold">
                  Faltan datos requeridos para continuar ({errorCount})
                </span>
                <span className="text-sm text-foreground/80">
                  Por favor revisa los campos marcados en rojo a continuación.
                </span>
              </div>
            </div>
          )}

          {/* Section A: Tus datos */}
          <section
            aria-labelledby="h-contacto"
            className="flex flex-col gap-5 p-6 md:p-8 bg-card border border-border rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-yellow font-condensed text-xl font-extrabold text-foreground"
              >
                A
              </span>
              <h2 id="h-contacto" className="text-2xl font-extrabold">
                Tus datos
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Email */}
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-email" className="text-base font-bold">
                  Correo
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  aria-invalid={Boolean(errors.email)}
                  className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                    errors.email ? 'border-destructive' : 'border-foreground'
                  }`}
                />
                {errors.email ? (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 7.5v5.5M12 16.5v.2"></path>
                    </svg>
                    {errors.email}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Aquí llegan la confirmación y el enlace para seguir tu pedido.
                  </span>
                )}
              </div>

              {/* Full Name */}
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-fullname" className="text-base font-bold">
                  Nombre completo
                </label>
                <input
                  id="checkout-fullname"
                  type="text"
                  autoComplete="name"
                  value={formData.fullName}
                  onChange={(e) => handleChange('fullName', e.target.value)}
                  aria-invalid={Boolean(errors.fullName)}
                  className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                    errors.fullName ? 'border-destructive' : 'border-foreground'
                  }`}
                />
                {errors.fullName && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.4"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="9"></circle>
                      <path d="M12 7.5v5.5M12 16.5v.2"></path>
                    </svg>
                    {errors.fullName}
                  </span>
                )}
              </div>

              {/* Phone (optional) */}
              <div className="flex flex-col gap-2 md:col-span-2">
                <label htmlFor="checkout-phone" className="text-base font-bold">
                  Celular <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="checkout-phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="300 123 4567"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  aria-invalid={Boolean(errors.phone)}
                  className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                    errors.phone ? 'border-destructive' : 'border-foreground'
                  }`}
                />
                {errors.phone && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    {errors.phone}
                  </span>
                )}
              </div>
            </div>
          </section>

          {/* Section B: Entrega */}
          <section
            aria-labelledby="h-entrega"
            className="flex flex-col gap-5 p-6 md:p-8 bg-card border border-border rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-yellow font-condensed text-xl font-extrabold text-foreground"
              >
                B
              </span>
              <h2 id="h-entrega" className="text-2xl font-extrabold">
                Entrega
              </h2>
            </div>

            {/* Recipient toggle */}
            <button
              type="button"
              role="checkbox"
              aria-checked={formData.sameRecipient}
              onClick={() => handleChange('sameRecipient', !formData.sameRecipient)}
              className="flex items-center gap-3 min-h-[44px] cursor-pointer text-left font-semibold text-lg"
            >
              <span
                aria-hidden="true"
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
                  formData.sameRecipient
                    ? 'border-brand-green bg-brand-green text-primary-foreground'
                    : 'border-foreground bg-card'
                }`}
              >
                {formData.sameRecipient && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                  </svg>
                )}
              </span>
              <span>
                Lo recibo yo{formData.fullName ? `, ${formData.fullName}` : ''}
              </span>
            </button>

            {/* Recipient custom fields if different recipient */}
            {!formData.sameRecipient && (
              <div className="flex flex-col gap-2">
                <label htmlFor="recipient-name" className="text-base font-bold">
                  Nombre de quien recibe
                </label>
                <input
                  id="recipient-name"
                  type="text"
                  placeholder="Nombre y apellido"
                  value={formData.recipientName}
                  onChange={(e) => handleChange('recipientName', e.target.value)}
                  aria-invalid={Boolean(errors.recipientName)}
                  className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                    errors.recipientName ? 'border-destructive' : 'border-foreground'
                  }`}
                />
                {errors.recipientName && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    {errors.recipientName}
                  </span>
                )}
              </div>
            )}

            {/* Recipient phone */}
            <div className="flex flex-col gap-2">
              <label htmlFor="recipient-phone" className="text-base font-bold">
                Celular de quien recibe
              </label>
              <input
                id="recipient-phone"
                type="tel"
                autoComplete="tel"
                placeholder="310 555 0142"
                value={formData.recipientPhone}
                onChange={(e) => handleChange('recipientPhone', e.target.value)}
                aria-invalid={Boolean(errors.recipientPhone)}
                className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                  errors.recipientPhone ? 'border-destructive' : 'border-foreground'
                }`}
              />
              {errors.recipientPhone ? (
                <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                  {errors.recipientPhone}
                </span>
              ) : (
                <span className="text-xs text-muted-foreground">
                  La transportadora llama a este número para coordinar la entrega.
                </span>
              )}
            </div>

            {/* DIVIPOLA Selectors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Department */}
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-department" className="text-base font-bold">
                  Departamento
                </label>
                <div className="relative">
                  <select
                    id="checkout-department"
                    autoComplete="address-level1"
                    value={formData.departmentCode}
                    onChange={(e) => handleDepartmentChange(e.target.value)}
                    aria-invalid={Boolean(errors.departmentCode)}
                    className={`w-full h-14 pl-4 pr-11 appearance-none border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground cursor-pointer ${
                      errors.departmentCode ? 'border-destructive' : 'border-foreground'
                    }`}
                  >
                    <option value="">Selecciona un departamento</option>
                    {departments.map((dept) => (
                      <option key={dept.code} value={dept.code}>
                        {dept.display_name}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="absolute right-4 top-4.5 pointer-events-none text-foreground"
                  >
                    <path d="M6 9l6 6 6-6"></path>
                  </svg>
                </div>
                {errors.departmentCode && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    {errors.departmentCode}
                  </span>
                )}
              </div>

              {/* Municipality */}
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-municipality" className="text-base font-bold">
                  Municipio
                </label>
                <div className="relative">
                  <select
                    id="checkout-municipality"
                    autoComplete="address-level2"
                    disabled={!formData.departmentCode}
                    value={formData.municipalityCode}
                    onChange={(e) => handleChange('municipalityCode', e.target.value)}
                    aria-invalid={Boolean(errors.municipalityCode)}
                    className={`w-full h-14 pl-4 pr-11 appearance-none border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                      errors.municipalityCode ? 'border-destructive' : 'border-foreground'
                    }`}
                  >
                    <option value="">
                      {formData.departmentCode
                        ? 'Selecciona tu municipio'
                        : 'Elige primero el departamento'}
                    </option>
                    {municipalities.map((muni) => (
                      <option key={muni.code} value={muni.code}>
                        {muni.display_name}
                      </option>
                    ))}
                  </select>
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="absolute right-4 top-4.5 pointer-events-none text-foreground"
                  >
                    <path d="M6 9l6 6 6-6"></path>
                  </svg>
                </div>
                {errors.municipalityCode && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    {errors.municipalityCode}
                  </span>
                )}
              </div>
            </div>

            {/* CC BY-SA 4.0 DIVIPOLA Attribution Notice */}
            <div className="text-xs text-muted-foreground mt-1">
              División político-administrativa basada en datos oficiales del{' '}
              <a
                href="https://www.datos.gov.co/d/gdxc-w37w"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                DANE (DIVIPOLA)
              </a>{' '}
              bajo licencia{' '}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                target="_blank"
                rel="noreferrer"
                className="underline hover:text-foreground"
              >
                CC BY-SA 4.0
              </a>
              .
            </div>

            {/* Address Line 1 */}
            <div className="flex flex-col gap-2">
              <label htmlFor="checkout-address1" className="text-base font-bold">
                Dirección
              </label>
              <input
                id="checkout-address1"
                type="text"
                autoComplete="address-line1"
                placeholder="Calle 5 # 12-34"
                value={formData.addressLine1}
                onChange={(e) => handleChange('addressLine1', e.target.value)}
                aria-invalid={Boolean(errors.addressLine1)}
                className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                  errors.addressLine1 ? 'border-destructive' : 'border-foreground'
                }`}
              />
              {errors.addressLine1 && (
                <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7.5v5.5M12 16.5v.2"></path>
                  </svg>
                  {errors.addressLine1}
                </span>
              )}
            </div>

            {/* Address Line 2 & Postal Code */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-address2" className="text-base font-bold">
                  Apartamento, torre u oficina{' '}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="checkout-address2"
                  type="text"
                  autoComplete="address-line2"
                  placeholder="Apto 302"
                  value={formData.addressLine2}
                  onChange={(e) => handleChange('addressLine2', e.target.value)}
                  className="w-full h-14 px-4 border-2 border-foreground rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="checkout-postal" className="text-base font-bold">
                  Código postal{' '}
                  <span className="font-normal text-muted-foreground">(opcional)</span>
                </label>
                <input
                  id="checkout-postal"
                  type="text"
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="417030"
                  value={formData.postalCode}
                  onChange={(e) => handleChange('postalCode', e.target.value)}
                  aria-invalid={Boolean(errors.postalCode)}
                  className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                    errors.postalCode ? 'border-destructive' : 'border-foreground'
                  }`}
                />
                {errors.postalCode && (
                  <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                    {errors.postalCode}
                  </span>
                )}
              </div>
            </div>

            {/* Delivery notes */}
            <div className="flex flex-col gap-2">
              <label htmlFor="checkout-delivery-notes" className="text-base font-bold">
                Indicaciones para la entrega{' '}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <textarea
                id="checkout-delivery-notes"
                rows={2}
                placeholder="Portería, punto de referencia, horario en el que hay alguien…"
                value={formData.deliveryNotes}
                onChange={(e) => handleChange('deliveryNotes', e.target.value)}
                className="w-full min-h-[88px] p-4 border-2 border-foreground rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground resize-y leading-relaxed"
              ></textarea>
            </div>

            {/* Live shipping calculation quote banner */}
            <div aria-live="polite" className="flex flex-col mt-2">
              {quote ? (
                <div className="flex flex-wrap items-center justify-between gap-4 p-5 md:p-6 bg-brand-green text-primary-foreground rounded-2xl">
                  <div className="flex items-center gap-4">
                    <svg
                      width="40"
                      height="40"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                      className="text-brand-yellow shrink-0"
                    >
                      <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7"></path>
                      <circle cx="7" cy="17.5" r="1.8"></circle>
                      <circle cx="17" cy="17.5" r="1.8"></circle>
                    </svg>
                    <div className="flex flex-col gap-0.5">
                      <span className="font-condensed text-base font-bold tracking-wider uppercase text-brand-yellow">
                        Envío a {selectedMuni?.display_name}, {selectedDept?.display_name}
                      </span>
                      <span className="text-xl font-bold">
                        Llega en {quote.shipping.estimated_days_min} a{' '}
                        {quote.shipping.estimated_days_max} días hábiles
                      </span>
                      <span className="text-sm text-primary-foreground/80">
                        {quote.shipping.is_free_shipping
                          ? 'Tu pedido supera el umbral de envío gratis para esta zona.'
                          : 'Tarifa única para este destino y este peso.'}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    {quote.shipping.is_free_shipping ? (
                      <>
                        <s
                          aria-label="Costo normal"
                          className="text-base text-primary-foreground/70"
                        >
                          $9.500
                        </s>
                        <span className="text-3xl md:text-4xl font-extrabold tracking-tight">
                          Gratis
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl md:text-4xl font-extrabold tracking-tight">
                        {formatMoneyCop(quote.shipping_amount)}
                      </span>
                    )}
                  </div>
                </div>
              ) : quoteError ? (
                <div
                  role="alert"
                  className="flex items-start gap-3 p-5 border-2 border-destructive rounded-2xl bg-card"
                >
                  <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    aria-hidden="true"
                    className="text-destructive shrink-0"
                  >
                    <circle cx="12" cy="12" r="9"></circle>
                    <path d="M12 7.5v5.5M12 16.5v.2"></path>
                  </svg>
                  <div className="flex flex-col gap-1">
                    <span className="text-lg font-extrabold">{quoteError.title}</span>
                    <span className="text-base text-foreground/80">{quoteError.detail}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-4 p-5 md:p-6 border-2 border-dashed border-dashed rounded-2xl text-muted-foreground">
                  <svg
                    width="36"
                    height="36"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                    className="shrink-0"
                  >
                    <path d="M2.5 6.5h11v10h-11zM13.5 10h4l3 3v3.5h-7"></path>
                    <circle cx="7" cy="17.5" r="1.8"></circle>
                    <circle cx="17" cy="17.5" r="1.8"></circle>
                  </svg>
                  <span className="text-base leading-relaxed">
                    Elige tu municipio y aquí verás cuánto cuesta el envío y cuándo llega. Es una
                    sola tarifa: no tienes que escoger transportadora.
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Section C: Factura (opcional) */}
          <section
            aria-labelledby="h-factura"
            className="flex flex-col gap-5 p-6 md:p-8 bg-card border border-border rounded-2xl"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-yellow font-condensed text-xl font-extrabold text-foreground"
              >
                C
              </span>
              <h2 id="h-factura" className="text-2xl font-extrabold">
                Factura electrónica <span className="font-normal text-muted-foreground text-lg">(opcional)</span>
              </h2>
            </div>

            <button
              type="button"
              role="checkbox"
              aria-checked={formData.wantsInvoice}
              onClick={() => handleChange('wantsInvoice', !formData.wantsInvoice)}
              className="flex items-center gap-3 min-h-[44px] cursor-pointer text-left font-semibold text-lg"
            >
              <span
                aria-hidden="true"
                className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
                  formData.wantsInvoice
                    ? 'border-brand-green bg-brand-green text-primary-foreground'
                    : 'border-foreground bg-card'
                }`}
              >
                {formData.wantsInvoice && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                  </svg>
                )}
              </span>
              <span>Necesito factura electrónica con datos fiscales</span>
            </button>

            {formData.wantsInvoice && (
              <div className="flex flex-col gap-4 pt-2">
                {/* Person type chips */}
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const updated: CheckoutFormData = {
                        ...formData,
                        personType: 'natural',
                        documentType: 'CC',
                      };
                      setFormData(updated);
                      saveCheckoutData(updated);
                    }}
                    className={`min-h-[44px] px-5 rounded-xl border-2 font-bold text-sm uppercase transition-colors ${
                      formData.personType === 'natural'
                        ? 'border-brand-green bg-brand-green text-primary-foreground'
                        : 'border-input bg-card text-foreground'
                    }`}
                  >
                    Persona natural
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const updated: CheckoutFormData = {
                        ...formData,
                        personType: 'legal',
                        documentType: 'NIT',
                      };
                      setFormData(updated);
                      saveCheckoutData(updated);
                    }}
                    className={`min-h-[44px] px-5 rounded-xl border-2 font-bold text-sm uppercase transition-colors ${
                      formData.personType === 'legal'
                        ? 'border-brand-green bg-brand-green text-primary-foreground'
                        : 'border-input bg-card text-foreground'
                    }`}
                  >
                    Empresa
                  </button>
                </div>

                {/* Document Type & Number */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-2">
                    <label htmlFor="invoice-doctype" className="text-base font-bold">
                      Tipo de documento
                    </label>
                    <select
                      id="invoice-doctype"
                      value={formData.documentType}
                      onChange={(e) =>
                        handleChange('documentType', e.target.value as CheckoutFormData['documentType'])
                      }
                      className="w-full h-14 px-4 border-2 border-foreground rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground"
                    >
                      {formData.personType === 'legal' ? (
                        <option value="NIT">NIT</option>
                      ) : (
                        <>
                          <option value="CC">Cédula de ciudadanía</option>
                          <option value="CE">Cédula de extranjería</option>
                          <option value="PP">Pasaporte</option>
                        </>
                      )}
                    </select>
                  </div>

                  <div className="flex flex-col gap-2 md:col-span-2">
                    <label htmlFor="invoice-docnum" className="text-base font-bold">
                      {formData.personType === 'legal' ? 'NIT de la empresa' : 'Número de documento'}
                    </label>
                    <input
                      id="invoice-docnum"
                      type="text"
                      placeholder={formData.personType === 'legal' ? '900.123.456-7' : '1.234.567.890'}
                      value={formData.documentNumber}
                      onChange={(e) => handleChange('documentNumber', e.target.value)}
                      aria-invalid={Boolean(errors.documentNumber)}
                      className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
                        errors.documentNumber ? 'border-destructive' : 'border-foreground'
                      }`}
                    />
                    {errors.documentNumber ? (
                      <span className="flex items-center gap-1.5 text-sm font-bold text-destructive">
                        {errors.documentNumber}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {formData.personType === 'legal'
                          ? 'La factura sale con la razón social que escribiste en Nombre completo.'
                          : `La factura sale a nombre de ${formData.fullName || 'María Gómez'}.`}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Section: Consent */}
          <div className="flex flex-col gap-3 px-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={formData.acceptsDataPolicy}
              onClick={() => handleChange('acceptsDataPolicy', !formData.acceptsDataPolicy)}
              className="flex items-start gap-3 min-h-[44px] cursor-pointer text-left text-base leading-relaxed"
            >
              <span
                aria-hidden="true"
                className={`shrink-0 w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors mt-0.5 ${
                  formData.acceptsDataPolicy
                    ? 'border-brand-green bg-brand-green text-primary-foreground'
                    : errors.acceptsDataPolicy
                      ? 'border-destructive bg-card'
                      : 'border-foreground bg-card'
                }`}
              >
                {formData.acceptsDataPolicy && (
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5"></path>
                  </svg>
                )}
              </span>
              <span>
                Autorizo a Monteluna a tratar mis datos personales para gestionar este pedido, según
                la Política de Tratamiento de Datos Personales.
              </span>
            </button>
            {errors.acceptsDataPolicy && (
              <span className="flex items-center gap-1.5 pl-10 text-sm font-bold text-destructive">
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7.5v5.5M12 16.5v.2"></path>
                </svg>
                {errors.acceptsDataPolicy}
              </span>
            )}
            <span className="pl-10 text-xs text-muted-foreground">
              Lee nuestra política de tratamiento de datos y términos y condiciones.
            </span>
          </div>

          {/* Desktop/Tablet Submit Button */}
          <div className="hidden lg:flex items-center justify-end pt-4">
            <button
              type="submit"
              disabled={quoteLoading}
              className="inline-flex items-center justify-center gap-3 min-h-[64px] px-10 rounded-xl bg-accent text-white font-condensed text-2xl font-extrabold uppercase tracking-wide hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
            >
              Continuar al pago <span aria-hidden="true">→</span>
            </button>
          </div>
        </form>

        {/* Sticky Summary Aside (No coupon field - Finding L22) */}
        <aside
          aria-labelledby="h-pedido-datos"
          className="w-full lg:w-[380px] shrink-0 p-6 md:p-8 bg-card border border-border rounded-2xl flex flex-col gap-5 sticky top-24"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="h-pedido-datos" className="text-2xl font-extrabold">
              Tu pedido
            </h2>
            <a
              href="/carrito"
              className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent"
            >
              Editar
            </a>
          </div>

          {/* Line items list */}
          <div className="flex flex-col gap-4">
            {items.map((item) => {
              const availability = availabilities.get(item.variant_id);
              const unitPrice = availability?.price_amount ?? 0;
              const compareAt = availability?.compare_at_price_amount;
              const hasDiscount = Boolean(compareAt && compareAt > unitPrice);

              return (
                <div key={item.variant_id} className="flex items-center gap-3.5">
                  <div className="relative shrink-0 w-16 h-16 rounded-xl bg-secondary flex items-center justify-center p-1">
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt=""
                        className="w-full h-full object-contain"
                      />
                    ) : (
                      <span className="font-condensed font-bold text-xs">Monteluna</span>
                    )}
                    <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-extrabold flex items-center justify-center">
                      {item.quantity}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col">
                    <span className="text-base font-extrabold truncate">{item.product_name}</span>
                    <span className="text-xs text-muted-foreground">{item.variant_label}</span>
                    {availability?.production_date && item.product_type === 'coffee' && (
                      <span className="text-xs font-semibold text-brand-green">
                        Tostado el {availability.production_date}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col items-end">
                    {hasDiscount && (
                      <s aria-label="Precio regular" className="text-xs text-muted-foreground">
                        {formatMoneyCop(compareAt! * item.quantity)}
                      </s>
                    )}
                    <span className="text-base font-extrabold">
                      {formatMoneyCop(unitPrice * item.quantity)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Totals Breakdown */}
          <div className="flex flex-col gap-2.5 pt-4 border-t border-border text-base">
            <div className="flex justify-between items-center">
              <span>Subtotal</span>
              <span className="font-semibold">
                {quote ? formatMoneyCop(quote.subtotal_amount) : formatMoneyCop(fallbackSubtotalMinor)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span>Envío</span>
              <span
                className={`font-semibold ${
                  quote?.shipping.is_free_shipping
                    ? 'text-success'
                    : quote
                      ? 'text-foreground'
                      : quoteError
                        ? 'text-destructive'
                        : 'text-muted-foreground'
                }`}
              >
                {quote?.shipping.is_free_shipping
                  ? 'Gratis'
                  : quote
                    ? formatMoneyCop(quote.shipping_amount)
                    : quoteError
                      ? 'Sin cobertura'
                      : 'Elige tu municipio'}
              </span>
            </div>
          </div>

          <div className="flex justify-between items-end pt-4 border-t-2 border-dashed border-dashed">
            <div className="flex flex-col">
              <span className="text-base font-bold">{totalLabel}</span>
              <span className="text-xs text-muted-foreground">Pesos colombianos</span>
            </div>
            <span className="text-3xl font-extrabold text-foreground">{totalDisplay}</span>
          </div>
        </aside>
      </main>

      {/* Mobile Sticky Bottom Bar (M-Checkout-Datos-390) */}
      <div className="lg:hidden sticky bottom-0 z-30 flex items-center justify-between gap-4 p-4 bg-card border-t-2 border-foreground">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-muted-foreground">{totalLabel}</span>
          <span className="text-2xl font-extrabold text-foreground">{totalDisplay}</span>
        </div>
        <button
          type="button"
          onClick={handleContinueToPayment}
          disabled={quoteLoading}
          className="flex-1 flex items-center justify-center gap-2 min-h-[56px] px-6 rounded-xl bg-accent text-white font-condensed text-xl font-extrabold uppercase tracking-wide hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
        >
          Continuar al pago <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
