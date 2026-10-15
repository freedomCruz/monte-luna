import React from 'react';
import type { CheckoutFormData } from '../../lib/checkout/state';
import type { OrderQuote } from '../../lib/orders/client';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import type { CartItem } from '../../lib/cart-store';
import type { VariantAvailability } from '../../lib/availabilities-client';
import { formatMoneyCop } from '../../lib/formatters';
import { PurchaseSteps } from '../ui/purchase-steps';
import { CheckoutSummaryAside } from './CheckoutSummaryAside';

export interface CheckoutPaymentStepProps {
  formData: CheckoutFormData;
  quote: OrderQuote | null;
  quoteError: string | null;
  quoteLoading: boolean;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  fallbackSubtotalMinor: number;
  totalDisplay: string;
  onBackToDatos: () => void;
}

export function CheckoutPaymentStep({
  formData,
  quote,
  quoteError,
  quoteLoading,
  selectedDept,
  selectedMuni,
  items,
  availabilities,
  fallbackSubtotalMinor,
  totalDisplay,
  onBackToDatos,
}: CheckoutPaymentStepProps) {
  const recipientDisplayName = formData.sameRecipient
    ? formData.fullName
    : formData.recipientName || 'Destinatario';
  const recipientPhoneDisplay = formData.sameRecipient
    ? formData.phone || formData.recipientPhone
    : formData.recipientPhone;

  return (
    <div className="w-full bg-background text-foreground min-h-screen flex flex-col font-sans">
      {/* Top reassurance banner */}
      <div className="bg-brand-green text-primary-foreground px-6 py-2.5 text-sm md:text-base font-medium flex flex-wrap justify-center items-center gap-x-6 gap-y-1 text-center">
        <span>Sin crear cuenta</span>
        <span aria-hidden="true" className="text-brand-yellow">
          •
        </span>
        <span>Pago seguro con Wompi</span>
        <span aria-hidden="true" className="text-brand-yellow">
          •
        </span>
        <span>Envíos a toda Colombia</span>
      </div>

      {/* Gold Hero Step Header */}
      <div className="bg-hero">
        <div className="max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-12 flex flex-wrap items-end justify-between gap-6 md:gap-12">
          <div className="flex flex-col gap-2">
            <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
              Paso 3 de 3
            </span>
            <h1 className="font-condensed text-4xl md:text-6xl font-extrabold uppercase tracking-tight">
              Revisa y paga
            </h1>
          </div>
          <div className="flex-1 max-w-[520px]">
            <PurchaseSteps currentStep={3} variant="full" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-[1320px] w-full mx-auto px-6 md:px-12 py-8 md:py-12 flex-1 flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
        <div className="flex-1 w-full flex flex-col gap-8">

          {/* S5 Out-of-Stock / Insufficient Stock Alert */}
          {quoteError === 'insufficient_stock' && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 p-5 bg-card border-2 border-destructive rounded-2xl"
            >
              <div className="flex items-start gap-3">
                <svg
                  width="28"
                  height="28"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  aria-hidden="true"
                  className="text-destructive shrink-0 mt-0.5"
                >
                  <circle cx="12" cy="12" r="9"></circle>
                  <path d="M12 7.5v5.5M12 16.5v.2"></path>
                </svg>
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-destructive">
                    Inventario no disponible
                  </span>
                  <p className="text-sm text-foreground/80">
                    Uno o más productos de tu carrito ya no tienen stock disponible. Por favor regresa
                    al carrito para ajustar las cantidades.
                  </p>
                </div>
              </div>
              <a
                href="/carrito"
                className="shrink-0 px-4 py-2 rounded-xl bg-destructive text-white text-sm font-bold uppercase"
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
                onClick={onBackToDatos}
                aria-label="Cambiar los datos de contacto"
                className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer"
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
                onClick={onBackToDatos}
                aria-label="Cambiar la dirección de entrega"
                className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer"
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
                onClick={onBackToDatos}
                aria-label="Agregar o cambiar datos de factura"
                className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer"
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
              onClick={onBackToDatos}
              className="self-center min-h-[44px] inline-flex items-center text-sm font-bold uppercase text-primary-foreground underline underline-offset-4 hover:text-brand-yellow cursor-pointer"
            >
              ← Volver a datos y envío
            </button>
          </section>
        </div>

        {/* Sticky Summary Aside */}
        <CheckoutSummaryAside
          id="h-pedido-pago"
          items={items}
          availabilities={availabilities}
          quote={quote}
          quoteError={quoteError}
          fallbackSubtotalMinor={fallbackSubtotalMinor}
          totalLabel="Total"
          totalDisplay={totalDisplay}
        />
      </main>
    </div>
  );
}
