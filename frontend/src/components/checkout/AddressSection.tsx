import { FormInput } from '../ui/form-input';
import { RecipientSection } from './RecipientSection';
import { DepartmentMunicipalityField } from './DepartmentMunicipalityField';
import { ShippingQuoteBanner } from './ShippingQuoteBanner';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import type { OrderQuoteResponse } from '../../lib/orders/client';

export interface AddressSectionProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  departments: DivipolaDepartment[];
  municipalities: DivipolaMunicipality[];
  quote: OrderQuoteResponse | null;
  quoteLoading: boolean;
  quoteError: string | null;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
  onRetryQuote: () => void;
}

export function AddressSection({
  formData,
  errors,
  departments,
  municipalities,
  quote,
  quoteLoading,
  quoteError,
  selectedDept,
  selectedMuni,
  onChange,
  onRetryQuote,
}: AddressSectionProps) {
  return (
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

      {/* Recipient Toggle and Details */}
      <RecipientSection formData={formData} errors={errors} onChange={onChange} />

      {/* Department & Municipality Selectors (DIVIPOLA) */}
      <DepartmentMunicipalityField
        departmentCode={formData.departmentCode}
        municipalityCode={formData.municipalityCode}
        departments={departments}
        municipalities={municipalities}
        departmentError={errors.departmentCode}
        municipalityError={errors.municipalityCode}
        onDepartmentChange={(code) => {
          onChange('departmentCode', code);
          onChange('municipalityCode', '');
        }}
        onMunicipalityChange={(code) => onChange('municipalityCode', code)}
      />

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
  );
}
