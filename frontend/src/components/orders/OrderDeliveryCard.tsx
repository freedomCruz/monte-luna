import React from 'react';
import type { components } from '../../generated/orders';

export interface OrderDeliveryCardProps {
  shippingAddress: components['schemas']['GuestShippingAddress'];
  status: string;
  shipment: components['schemas']['Shipment'] | null;
}

export function OrderDeliveryCard({ shippingAddress, status, shipment }: OrderDeliveryCardProps) {
  const isCancelledOrExpired = status === 'cancelled' || status === 'expired';

  const etaTitle = 'Tiempo estimado';
  const etaText = isCancelledOrExpired
    ? 'Sin fecha de entrega'
    : 'Llega en 2 a 4 días hábiles';
  const etaNote = isCancelledOrExpired
    ? 'Este pedido no se va a despachar.'
    : 'Contados desde que sale de nuestra bodega.';

  const fullAddress = [shippingAddress.address_line1, shippingAddress.address_line2]
    .filter(Boolean)
    .join(', ');

  return (
    <section
      aria-labelledby="h-entrega"
      className="flex flex-wrap gap-6 md:gap-12 p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xs"
    >
      <div className="flex-1 min-w-[240px] flex flex-col gap-1">
        <h2
          id="h-entrega"
          className="m-0 mb-1.5 font-condensed text-base md:text-lg font-bold tracking-wider uppercase text-muted-foreground"
        >
          Entrega
        </h2>
        <span className="text-xl md:text-2xl font-extrabold leading-tight">
          {fullAddress}
        </span>
        <span className="text-base md:text-lg text-foreground/90">
          {shippingAddress.municipality_name}, {shippingAddress.department_name}
        </span>
        <span className="text-sm md:text-base text-muted-foreground">
          Recibe {shippingAddress.recipient_name} · {shippingAddress.recipient_phone}
        </span>
        {shippingAddress.delivery_notes && (
          <span className="text-xs md:text-sm text-muted-foreground/90 italic mt-1">
            Indicaciones: {shippingAddress.delivery_notes}
          </span>
        )}
      </div>

      <div className="flex-1 min-w-[200px] flex flex-col gap-1">
        <span className="mb-1.5 font-condensed text-base md:text-lg font-bold tracking-wider uppercase text-muted-foreground">
          {etaTitle}
        </span>
        <span className="text-xl md:text-2xl font-extrabold leading-tight">
          {etaText}
        </span>
        <span className="text-sm md:text-base text-muted-foreground">
          {etaNote}
        </span>

        {shipment && (
          <div className="mt-2 p-3 bg-card rounded-xl border border-border flex flex-col gap-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Guía de transporte
            </span>
            <span className="text-sm font-semibold">
              {shipment.carrier_name}: {shipment.tracking_number}
            </span>
            {shipment.tracking_url && (
              <a
                href={shipment.tracking_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold underline text-primary hover:text-brand-green mt-0.5"
              >
                Rastrear envío →
              </a>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
