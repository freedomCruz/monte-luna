import { FormInput } from '../ui/form-input';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';

export interface BuyerSectionProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
}

export function BuyerSection({ formData, errors, onChange }: BuyerSectionProps) {
  return (
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
  );
}
