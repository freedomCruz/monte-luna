import type { CheckoutFormData } from '../../lib/checkout/state';
import type { OrderQuoteResponse } from '../../lib/orders/client';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import { formatMoneyCop } from '../../lib/shared/formatters';

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
      className="flex flex-col px-4 sm:px-6 md:px-8 py-2 md:py-3 bg-card border border-border rounded-2xl shadow-xs overflow-hidden"
    >
      <h2 id="h-revisa" className="sr-only">
        Tus datos
      </h2>

      {/* Contact */}
      <div className="flex flex-wrap md:flex-nowrap items-center md:items-start justify-between gap-x-3 gap-y-1 py-3.5 md:py-5 border-b border-border">
        <span className="font-condensed text-base md:text-[17px] font-bold tracking-wider uppercase text-muted-foreground order-1 md:w-28 md:pt-1 shrink-0">
          Contacto
        </span>
        <button
          type="button"
          onClick={onBackToDatos}
          aria-label="Cambiar los datos de contacto"
          className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer order-2 md:order-3 shrink-0"
        >
          Cambiar
        </button>
        <div className="w-full md:w-auto md:flex-1 min-w-0 flex flex-col gap-0.5 order-3 md:order-2">
          <span className="text-lg md:text-xl font-extrabold truncate md:overflow-visible md:whitespace-normal">
            {formData.fullName}
          </span>
          <span className="text-base text-foreground/80 break-all md:break-normal">
            {formData.email}
          </span>
        </div>
      </div>

      {/* Shipping Address */}
      <div className="flex flex-wrap md:flex-nowrap items-center md:items-start justify-between gap-x-3 gap-y-1 py-3.5 md:py-5 border-b border-border">
        <span className="font-condensed text-base md:text-[17px] font-bold tracking-wider uppercase text-muted-foreground order-1 md:w-28 md:pt-1 shrink-0">
          Envío a
        </span>
        <button
          type="button"
          onClick={onBackToDatos}
          aria-label="Cambiar la dirección de entrega"
          className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer order-2 md:order-3 shrink-0"
        >
          Cambiar
        </button>
        <div className="w-full md:w-auto md:flex-1 min-w-0 flex flex-col gap-0.5 order-3 md:order-2">
          <span className="text-lg md:text-xl font-extrabold break-words">
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
      </div>

      {/* Shipping info */}
      <div className="flex flex-col md:flex-row md:items-start gap-2 md:gap-4 py-3.5 md:py-5 border-b border-border">
        <span className="font-condensed text-base md:text-[17px] font-bold tracking-wider uppercase text-muted-foreground md:w-28 md:pt-1 shrink-0">
          Envío
        </span>
        <div className="flex-1 min-w-0 flex flex-wrap items-center gap-2 md:gap-3">
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
      <div className="flex flex-wrap md:flex-nowrap items-center md:items-start justify-between gap-x-3 gap-y-1 py-3.5 md:py-5">
        <span className="font-condensed text-base md:text-[17px] font-bold tracking-wider uppercase text-muted-foreground order-1 md:w-28 md:pt-1 shrink-0">
          Factura
        </span>
        <button
          type="button"
          onClick={onBackToDatos}
          aria-label="Agregar o cambiar datos de factura"
          className="min-h-[44px] inline-flex items-center text-sm font-bold uppercase underline underline-offset-4 hover:text-accent cursor-pointer order-2 md:order-3 shrink-0"
        >
          {formData.wantsInvoice ? 'Cambiar' : 'Agregar'}
        </button>
        <div className="w-full md:w-auto md:flex-1 min-w-0 flex flex-col gap-0.5 order-3 md:order-2">
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
      </div>
    </section>
  );
}
