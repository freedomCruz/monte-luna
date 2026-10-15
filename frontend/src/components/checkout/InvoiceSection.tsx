import { Checkbox } from '../ui/checkbox';
import { RadioGroup } from '../ui/radio-group';
import { FormSelect } from '../ui/form-select';
import { FormInput } from '../ui/form-input';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';

export interface InvoiceSectionProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
}

export function InvoiceSection({ formData, errors, onChange }: InvoiceSectionProps) {
  return (
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

      <Checkbox
        id="checkout-wants-invoice"
        label="Necesito la factura con mi documento o a nombre de empresa"
        checked={formData.wantsInvoice}
        onChange={(e) => onChange('wantsInvoice', e.target.checked)}
      />

      {formData.wantsInvoice && (
        <div className="flex flex-col gap-5 pt-4 border-t border-border">
          <RadioGroup
            name="person-type"
            label="Tipo de persona"
            value={formData.personType}
            onChange={(val) => {
              const pType = val as 'natural' | 'legal';
              onChange('personType', pType);
              onChange('documentType', pType === 'legal' ? 'NIT' : 'CC');
            }}
            options={[
              { value: 'natural', label: 'Persona natural' },
              { value: 'legal', label: 'Persona jurídica (empresa)' },
            ]}
          />

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
  );
}
