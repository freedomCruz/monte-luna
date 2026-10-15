import React from 'react';
import type { OrderStepItem } from '../../lib/orders/tracking';

export interface OrderTrackingStepsSectionProps {
  steps: OrderStepItem[];
  subtitle?: string;
}

export function OrderTrackingStepsSection({
  steps,
  subtitle = 'Te avisamos por correo en cada cambio.',
}: OrderTrackingStepsSectionProps) {
  if (steps.length === 0) return null;

  return (
    <section
      aria-labelledby="h-seguimiento"
      className="flex flex-col gap-6 p-6 md:p-8 bg-card border border-border rounded-2xl shadow-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
        <h2 id="h-seguimiento" className="font-sans text-2xl md:text-3xl font-extrabold m-0">
          Así va tu pedido
        </h2>
        {subtitle && (
          <span className="text-sm md:text-base text-muted-foreground">{subtitle}</span>
        )}
      </div>

      <ol className="list-none m-0 p-0 flex flex-col md:flex-row items-stretch md:items-start gap-6 md:gap-0">
        {steps.map((p, i) => (
          <li
            key={p.label}
            aria-current={p.actual ? 'step' : undefined}
            className="relative flex-1 flex flex-row md:flex-col items-center md:items-center gap-3.5 md:gap-2.5 text-left md:text-center"
          >
            {/* Desktop horizontal connecting line */}
            {i > 0 && (
              <span
                aria-hidden="true"
                className={`hidden md:block absolute top-[23px] left-[-50%] w-full h-0.5 ${p.linea}`}
              />
            )}

            {/* Step marker circle */}
            <span
              className={`relative inline-flex items-center justify-center w-11 h-11 md:w-12 md:h-12 shrink-0 rounded-full border-2 font-condensed text-xl md:text-2xl font-extrabold ${p.bg} ${p.fg} ${p.bc}`}
            >
              {p.marca}
            </span>

            {/* Label and note */}
            <div className="flex flex-col md:items-center gap-0.5">
              <span className={`text-base md:text-lg font-extrabold ${p.txt}`}>{p.label}</span>
              <span className="max-w-[200px] text-xs md:text-sm leading-snug text-muted-foreground">
                {p.nota}
              </span>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
