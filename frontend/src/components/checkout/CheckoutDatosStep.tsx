import React from 'react';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import type { OrderQuote } from '../../lib/orders/client';
import type { CartItem } from '../../lib/cart-store';
import type { VariantAvailability } from '../../lib/availabilities-client';
import { FormInput } from '../ui/form-input';
import { FormSelect } from '../ui/form-select';
import { FieldError } from '../ui/field-error';
import { PurchaseSteps } from '../ui/purchase-steps';
import { ShippingQuoteBanner } from './ShippingQuoteBanner';
import { CheckoutSummaryAside } from './CheckoutSummaryAside';

export interface CheckoutDatosStepProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  hasAttemptedSubmit: boolean;
  departments: DivipolaDepartment[];
  municipalities: DivipolaMunicipality[];
  quote: OrderQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  fallbackSubtotalMinor: number;
  totalLabel: string;
  totalDisplay: string;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
  onSubmit: (e: React.FormEvent) => void;
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
  fallbackSubtotalMinor,
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

          {/* Section: Buyer Contact */}
          <section
            aria-labelledby="h-contacto"
            className="flex flex-col gap-6 p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-brand-green text-primary-foreground font-condensed font-extrabold flex items-center justify-center text-lg"
              >
                1
              </span>
              <h2 id="h-contacto" className="font-condensed text-2xl font-extrabold uppercase">
                Tus datos de contacto
              </h2>
            </div>

            <div className="flex flex-col gap-5">
              <FormInput
                id="checkout-email"
                label="Correo electrónico"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="tu@correo.com"
                value={formData.email}
                onChange={(e) => onChange('email', e.target.value)}
                error={errors.email}
              />

              <FormInput
                id="checkout-fullname"
                label="Nombre y apellido completos"
                type="text"
                autoComplete="name"
                placeholder="María Gómez"
                value={formData.fullName}
                onChange={(e) => onChange('fullName', e.target.value)}
                error={errors.fullName}
              />

              <FormInput
                id="checkout-phone"
                label="Número de celular"
                optional
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="300 123 4567"
                value={formData.phone}
                onChange={(e) => onChange('phone', e.target.value)}
                error={errors.phone}
              />
            </div>
          </section>

          {/* Section: Shipping Address & Recipient */}
          <section
            aria-labelledby="h-entrega"
            className="flex flex-col gap-6 p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xs"
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="w-8 h-8 rounded-full bg-brand-green text-primary-foreground font-condensed font-extrabold flex items-center justify-center text-lg"
              >
                2
              </span>
              <h2 id="h-entrega" className="font-condensed text-2xl font-extrabold uppercase">
                Dirección de entrega
              </h2>
            </div>

            {/* Recipient Toggle */}
            <div className="flex flex-col gap-3 p-4 bg-secondary rounded-xl">
              <span className="text-base font-bold">¿Quién recibe el paquete?</span>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="recipient-type"
                    checked={formData.sameRecipient}
                    onChange={() => onChange('sameRecipient', true)}
                    className="w-5 h-5 accent-brand-green"
                  />
                  <span>Recibo yo ({formData.fullName || 'el comprador'})</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer font-medium">
                  <input
                    type="radio"
                    name="recipient-type"
                    checked={!formData.sameRecipient}
                    onChange={() => onChange('sameRecipient', false)}
                    className="w-5 h-5 accent-brand-green"
                  />
                  <span>Recibe otra persona (o es un regalo)</span>
                </label>
              </div>
            </div>

            {/* Conditional recipient name */}
            {!formData.sameRecipient && (
              <FormInput
                id="checkout-recipient-name"
                label="Nombre de quien recibe"
                type="text"
                placeholder="Carlos Gómez"
                value={formData.recipientName}
                onChange={(e) => onChange('recipientName', e.target.value)}
                error={errors.recipientName}
              />
            )}

            {/* Recipient Phone (Carrier requirement) */}
            <FormInput
              id="checkout-recipient-phone"
              label="Celular de quien recibe"
              type="tel"
              inputMode="tel"
              placeholder="310 555 0142"
              value={formData.recipientPhone}
              onChange={(e) => onChange('recipientPhone', e.target.value)}
              error={errors.recipientPhone}
            />

            {/* Department & Municipality Selectors (DIVIPOLA dataset) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormSelect
                id="checkout-department"
                label="Departamento"
                value={formData.departmentCode}
                onChange={(e) => {
                  onChange('departmentCode', e.target.value);
                  onChange('municipalityCode', '');
                }}
                error={errors.departmentCode}
              >
                <option value="">Selecciona un departamento</option>
                {departments.map((dept) => (
                  <option key={dept.code} value={dept.code}>
                    {dept.display_name}
                  </option>
                ))}
              </FormSelect>

              <FormSelect
                id="checkout-municipality"
                label="Municipio o ciudad"
                disabled={!formData.departmentCode}
                value={formData.municipalityCode}
                onChange={(e) => onChange('municipalityCode', e.target.value)}
                error={errors.municipalityCode}
              >
                <option value="">
                  {formData.departmentCode ? 'Selecciona tu municipio' : 'Primero elige departamento'}
                </option>
                {municipalities.map((muni) => (
                  <option key={muni.code} value={muni.code}>
                    {muni.display_name}
                  </option>
                ))}
              </FormSelect>
            </div>

            {/* DIVIPOLA CC BY-SA 4.0 Attribution notice (S6) */}
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span>División político-administrativa de Colombia basada en datos oficiales de DANE (DIVIPOLA)</span>
              <span aria-hidden="true">·</span>
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/deed.es"
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Licencia CC BY-SA 4.0
              </a>
            </p>

            {/* Address Line 1 */}
            <FormInput
              id="checkout-address1"
              label="Dirección principal"
              type="text"
              autoComplete="address-line1"
              placeholder="Calle 5 # 12-34, Barrio El Mirador"
              value={formData.addressLine1}
              onChange={(e) => onChange('addressLine1', e.target.value)}
              error={errors.addressLine1}
            />

            {/* Address Line 2 & Postal Code */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormInput
                id="checkout-address2"
                label="Apartamento, torre u oficina"
                optional
                type="text"
                autoComplete="address-line2"
                placeholder="Apto 302"
                value={formData.addressLine2}
                onChange={(e) => onChange('addressLine2', e.target.value)}
              />

              <FormInput
                id="checkout-postal"
                label="Código postal"
                optional
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="417030"
                value={formData.postalCode}
                onChange={(e) => onChange('postalCode', e.target.value)}
                error={errors.postalCode}
              />
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
                onChange={(e) => onChange('deliveryNotes', e.target.value)}
                className="w-full min-h-[88px] p-4 border-2 border-foreground rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground resize-y leading-relaxed"
              ></textarea>
            </div>

            {/* Live shipping calculation quote banner */}
            <ShippingQuoteBanner
              quote={quote}
              quoteLoading={quoteLoading}
              quoteError={quoteError}
              selectedDept={selectedDept}
              selectedMuni={selectedMuni}
              onRetry={onRetryQuote}
            />
          </section>

          {/* Section: Invoicing (Optional) */}
          <section
            aria-labelledby="h-factura"
            className="flex flex-col gap-6 p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xs"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="w-8 h-8 rounded-full bg-brand-green text-primary-foreground font-condensed font-extrabold flex items-center justify-center text-lg"
                >
                  3
                </span>
                <h2 id="h-factura" className="font-condensed text-2xl font-extrabold uppercase">
                  Datos de facturación
                </h2>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-md bg-secondary text-muted-foreground uppercase">
                Opcional
              </span>
            </div>

            <p className="text-sm text-muted-foreground leading-relaxed">
              Siempre enviamos la confirmación del pedido y el comprobante por correo. Si necesitas
              factura electrónica con NIT o cédula específica para contabilidad, activa esta casilla.
            </p>

            <label className="flex items-center gap-3 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={formData.wantsInvoice}
                onChange={(e) => onChange('wantsInvoice', e.target.checked)}
                className="w-6 h-6 rounded-md accent-brand-green cursor-pointer"
              />
              <span className="text-base font-bold">
                Necesito factura electrónica a nombre de empresa o documento específico
              </span>
            </label>

            {formData.wantsInvoice && (
              <div className="flex flex-col gap-5 pt-4 border-t border-border">
                <div className="flex flex-col gap-2">
                  <span className="text-base font-bold">Tipo de persona</span>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="person-type"
                        checked={formData.personType === 'natural'}
                        onChange={() => {
                          onChange('personType', 'natural');
                          onChange('documentType', 'CC');
                        }}
                        className="w-5 h-5 accent-brand-green"
                      />
                      <span>Persona natural</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="person-type"
                        checked={formData.personType === 'legal'}
                        onChange={() => {
                          onChange('personType', 'legal');
                          onChange('documentType', 'NIT');
                        }}
                        className="w-5 h-5 accent-brand-green"
                      />
                      <span>Persona jurídica (empresa)</span>
                    </label>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormSelect
                    id="checkout-doc-type"
                    label="Tipo de documento"
                    value={formData.documentType}
                    onChange={(e) =>
                      onChange('documentType', e.target.value as CheckoutFormData['documentType'])
                    }
                  >
                    {formData.personType === 'legal' ? (
                      <option value="NIT">NIT - Número de Identificación Tributaria</option>
                    ) : (
                      <>
                        <option value="CC">Cédula de Ciudadanía (CC)</option>
                        <option value="CE">Cédula de Extranjería (CE)</option>
                        <option value="PP">Pasaporte (PP)</option>
                      </>
                    )}
                  </FormSelect>

                  <div className="md:col-span-2">
                    <FormInput
                      id="checkout-doc-number"
                      label={
                        formData.personType === 'legal'
                          ? 'Número de NIT (con dígito de verificación)'
                          : 'Número de documento'
                      }
                      type="text"
                      placeholder={formData.personType === 'legal' ? '900.123.456-7' : '1098765432'}
                      value={formData.documentNumber}
                      onChange={(e) => onChange('documentNumber', e.target.value)}
                      error={errors.documentNumber}
                    />
                    {!errors.documentNumber && (
                      <span className="text-xs text-muted-foreground mt-1 block">
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
              onClick={() => onChange('acceptsDataPolicy', !formData.acceptsDataPolicy)}
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
            <FieldError error={errors.acceptsDataPolicy} className="pl-10" />
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

        {/* Sticky Summary Aside */}
        <CheckoutSummaryAside
          id="h-pedido-datos"
          items={items}
          availabilities={availabilities}
          quote={quote}
          quoteError={quoteError}
          fallbackSubtotalMinor={fallbackSubtotalMinor}
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
