import { FormInput } from '../ui/form-input';
import { RadioGroup } from '../ui/radio-group';
import type { CheckoutFormData, CheckoutFormErrors } from '../../lib/checkout/state';

export interface RecipientSectionProps {
  formData: CheckoutFormData;
  errors: CheckoutFormErrors;
  onChange: <K extends keyof CheckoutFormData>(field: K, value: CheckoutFormData[K]) => void;
}

export function RecipientSection({ formData, errors, onChange }: RecipientSectionProps) {
  return (
    <div className="flex flex-col gap-5 p-5 bg-secondary/50 rounded-xl border border-border">
      <RadioGroup
        name="recipient-selection"
        label="¿Quién recibe el paquete?"
        value={formData.sameRecipient ? 'same' : 'different'}
        onChange={(val) => onChange('sameRecipient', val === 'same')}
        options={[
          {
            value: 'same',
            label: `Lo recibo yo (${formData.fullName || 'el comprador'})`,
          },
          {
            value: 'different',
            label: 'Recibe otra persona (o es un regalo)',
          },
        ]}
      />

      {/* Recipient name if different */}
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

      {/* Recipient phone (Carrier requirement) */}
      <FormInput
        id="checkout-recipient-phone"
        label="Celular de quien recibe"
        type="tel"
        inputMode="tel"
        placeholder="310 555 0142"
        description="La transportadora llama a este número para coordinar la entrega."
        value={formData.recipientPhone}
        onChange={(e) => onChange('recipientPhone', e.target.value)}
        error={errors.recipientPhone}
      />
    </div>
  );
}
