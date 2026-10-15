import type { FormEvent } from 'react';
import type { CartItem } from '../../lib/cart-store';
import type { VariantAvailability } from '../../lib/availabilities-client';
import type { OrderQuoteResponse } from '../../lib/orders/client';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';
import { PurchaseSteps } from '../ui/purchase-steps';
import { BuyerSection } from './BuyerSection';
import { AddressSection } from './AddressSection';
import { InvoiceSection } from './InvoiceSection';
import { ConsentField } from './ConsentField';
import { CheckoutSummaryAside } from './CheckoutSummaryAside';

export interface CheckoutDatosStepProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  hasAttemptedSubmit: boolean;
  departments: DivipolaDepartment[];
  municipalities: DivipolaMunicipality[];
  quote: OrderQuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  totalLabel: string;
  totalDisplay: string;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
  onSubmit: (e: FormEvent) => void;
  onRetryQuote: () => void;
}

export function CheckoutDatosStep({
  formData,
  errors,
  hasAttemptedSubmit,
  departments,
  municipalities,
  quote,
  quoteLoading,
  quoteError,
  selectedDept,
  selectedMuni,
  items,
  availabilities,
  totalLabel,
  totalDisplay,
  onChange,
  onSubmit,
  onRetryQuote,
}: CheckoutDatosStepProps) {
  const errorCount = Object.keys(errors).length;
  const hasErrors = hasAttemptedSubmit && errorCount > 0;

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

      <div className="bg-hero">
        <div className="max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-12 flex flex-wrap items-end justify-between gap-6 md:gap-12">
          <div className="flex flex-col gap-2">
            <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
              Paso 2 de 3
            </span>
            <h1 className="font-condensed text-4xl md:text-6xl font-extrabold uppercase tracking-tight">
              ¿A dónde lo enviamos?
            </h1>
          </div>
          <div className="flex-1 max-w-[520px]">
            <PurchaseSteps currentStep={2} variant="full" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-[1320px] w-full mx-auto px-6 md:px-12 py-8 md:py-12 flex-1 flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
        {/* Form container */}
        <form onSubmit={onSubmit} noValidate className="flex-1 w-full flex flex-col gap-8">
          {/* Error Banner when validation fails */}
          {hasErrors && (
            <div
              role="alert"
              className="flex items-start gap-3.5 p-5 bg-card border-2 border-destructive rounded-2xl"
            >
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
                <span className="text-base font-bold text-destructive">
                  Faltan datos requeridos para continuar
                </span>
                <span className="text-sm text-foreground/80">
                  Revisa los campos resaltados en rojo en el formulario.
                </span>
              </div>
            </div>
          )}

          {/* Section 1: Buyer Contact */}
          <BuyerSection formData={formData} errors={errors} onChange={onChange} />

          {/* Section 2: Address & Recipient */}
          <AddressSection
            formData={formData}
            errors={errors}
            departments={departments}
            municipalities={municipalities}
            quote={quote}
            quoteLoading={quoteLoading}
            quoteError={quoteError}
            selectedDept={selectedDept}
            selectedMuni={selectedMuni}
            onChange={onChange}
            onRetryQuote={onRetryQuote}
          />

          {/* Section 3: Invoicing (Optional) */}
          <InvoiceSection formData={formData} errors={errors} onChange={onChange} />

          {/* Section 4: Consent & Data Policy */}
          <ConsentField
            checked={formData.acceptsDataPolicy}
            error={errors.acceptsDataPolicy}
            onChange={(checked) => onChange('acceptsDataPolicy', checked)}
          />

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

        {/* Sticky Summary Aside */}
        <CheckoutSummaryAside
          id="h-pedido-datos"
          items={items}
          availabilities={availabilities}
          quote={quote}
          quoteLoading={quoteLoading}
          quoteError={quoteError}
          totalLabel={totalLabel}
          totalDisplay={totalDisplay}
        />
      </main>

      {/* Mobile Sticky Bottom Bar (M-Checkout-Datos-390) */}
      <div className="lg:hidden sticky bottom-0 z-30 flex items-center justify-between gap-4 p-4 bg-card border-t-2 border-foreground">
        <div className="flex flex-col">
          <span className="text-xs font-bold text-muted-foreground">{totalLabel}</span>
          <span className="text-2xl font-extrabold text-foreground">{totalDisplay}</span>
        </div>
        <button
          type="button"
          onClick={onSubmit}
          disabled={quoteLoading}
          className="flex-1 flex items-center justify-center gap-2 min-h-[56px] px-6 rounded-xl bg-accent text-white font-condensed text-xl font-extrabold uppercase tracking-wide hover:opacity-95 transition-opacity cursor-pointer disabled:opacity-50"
        >
          Continuar al pago <span aria-hidden="true">→</span>
        </button>
      </div>
    </div>
  );
}
