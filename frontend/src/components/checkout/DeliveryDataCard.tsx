import type { CheckoutFormData } from '../../lib/checkout/state';
import type { OrderQuoteResponse } from '../../lib/orders/client';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import { formatMoneyCop } from '../../lib/formatters';

export interface DeliveryDataCardProps {
  formData: CheckoutFormData;
  quote: OrderQuoteResponse | null;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  onBackToDatos: () => void;
}

export function DeliveryDataCard({
  formData,
  quote,
  selectedDept,
  selectedMuni,
  onBackToDatos,
}: DeliveryDataCardProps) {
  return (
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
          Envío a
        </span>
        <div className="flex-1 flex flex-col gap-0.5">
          <span className="text-lg md:text-xl font-extrabold">
            {formData.addressLine1}
            {formData.addressLine2 ? `, ${formData.addressLine2}` : ''}
          </span>
          <span className="text-base text-foreground/80">
            {selectedMuni?.display_name || formData.municipalityCode},{' '}
            {selectedDept?.display_name || formData.departmentCode}
          </span>
          <span className="text-sm text-muted-foreground">
            Recibe:{' '}
            {formData.sameRecipient
              ? `${formData.fullName} (comprador)`
              : formData.recipientName || 'Otra persona'}{' '}
            · Tel: {formData.recipientPhone}
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
          {quote ? (
            <>
              <span className="text-lg md:text-xl font-extrabold">
                Llega en {quote.shipping.estimated_days_min} a{' '}
                {quote.shipping.estimated_days_max} días hábiles
              </span>
              <span className="px-3 py-1 rounded-lg bg-brand-green text-primary-foreground text-sm font-bold">
                {quote.shipping.is_free_shipping
                  ? 'Gratis'
                  : formatMoneyCop(quote.shipping_amount)}
              </span>
            </>
          ) : (
            <span className="text-base text-muted-foreground font-medium">Sin cotizar</span>
          )}
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
  );
}
