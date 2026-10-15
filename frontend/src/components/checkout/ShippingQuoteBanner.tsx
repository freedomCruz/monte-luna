import React from 'react';
import type { OrderQuote } from '../../lib/orders/client';
import { formatMoneyCop } from '../../lib/shared/formatters';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';

export interface ShippingQuoteBannerProps {
  quote: OrderQuote | null;
  quoteLoading: boolean;
  quoteError: string | null;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  onRetry: () => void;
}

export function ShippingQuoteBanner({
  quote,
  quoteLoading,
  quoteError,
  selectedDept,
  selectedMuni,
  onRetry,
}: ShippingQuoteBannerProps) {
  return (
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
                Llega en {quote.shipping.estimated_days_min} a {quote.shipping.estimated_days_max} días
                hábiles
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
                <s aria-label="Costo normal" className="text-base text-primary-foreground/70">
                  $9.500
                </s>
                <span className="text-3xl md:text-4xl font-extrabold tracking-tight">Gratis</span>
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
            className="text-destructive shrink-0 mt-0.5"
          >
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 7.5v5.5M12 16.5v.2"></path>
          </svg>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-base font-bold text-destructive">
              {quoteError === 'unsupported_destination' || quoteError.includes('municipio')
                ? `Todavía no llegamos a ${selectedMuni?.display_name || 'este municipio'}`
                : 'No pudimos calcular el envío'}
            </span>
            <span className="text-sm text-foreground/80">
              {quoteError === 'unsupported_destination' || quoteError.includes('municipio')
                ? 'No podemos seguir con esta dirección. Prueba con otro municipio o escríbenos.'
                : quoteError}
            </span>
            <button
              type="button"
              onClick={onRetry}
              className="self-start mt-2 px-3 py-1 text-xs font-bold rounded-md bg-secondary text-foreground hover:bg-secondary/80 cursor-pointer"
            >
              Reintentar cotización
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-3 p-4 bg-secondary rounded-xl text-muted-foreground text-sm">
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 7.5v5.5M12 16.5v.2"></path>
          </svg>
          <span>
            {quoteLoading
              ? 'Cotizando flete y tiempos de entrega...'
              : 'Elige tu departamento y municipio arriba para calcular el costo de envío y el tiempo de entrega.'}
          </span>
        </div>
      )}
    </div>
  );
}
