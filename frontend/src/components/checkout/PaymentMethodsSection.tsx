import { PaymentMethodsBlock } from './PaymentMethodsBlock';
import { PaymentCtaBlock } from './PaymentCtaBlock';

export interface PaymentMethodsSectionProps {
  totalDisplay: string;
  orderNumber?: string;
  trackingToken?: string;
  onBackToDatos: () => void;
}

export function PaymentMethodsSection({
  totalDisplay,
  orderNumber,
  trackingToken,
  onBackToDatos,
}: PaymentMethodsSectionProps) {
  return (
    <section
      aria-labelledby="h-pago"
      className="flex flex-col gap-6 p-8 md:p-10 bg-foreground text-primary-foreground rounded-2xl"
    >
      <div className="flex flex-col gap-2">
        <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase text-brand-yellow">
          Pago
        </span>
        <h2
          id="h-pago"
          className="font-condensed text-3xl md:text-4xl font-extrabold uppercase tracking-tight"
        >
          Pagas en la ventana segura de Wompi.
        </h2>
        <p className="text-base md:text-lg text-primary-foreground/80 max-w-xl">
          Ahí eliges el medio y escribes sus datos. Monteluna nunca ve ni guarda la
          información de tu tarjeta o de tu banco.
        </p>
      </div>

      {/* Available payment methods */}
      <PaymentMethodsBlock />

      {/* 3-step guarantees */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-primary-foreground/20 text-sm">
        <li className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
          >
            1
          </span>
          <span>
            <strong className="block text-white font-extrabold">Creamos tu pedido</strong>
            <span className="text-primary-foreground/80">con un número para seguirlo.</span>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
          >
            2
          </span>
          <span>
            <strong className="block text-white font-extrabold">Lo apartamos 30 min</strong>
            <span className="text-primary-foreground/80">para que nadie se lleve tu café.</span>
          </span>
        </li>
        <li className="flex items-start gap-3">
          <span
            aria-hidden="true"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-full bg-brand-yellow text-foreground font-condensed text-lg font-extrabold"
          >
            3
          </span>
          <span>
            <strong className="block text-white font-extrabold">Pagas y te confirmamos</strong>
            <span className="text-primary-foreground/80">por correo con tu enlace.</span>
          </span>
        </li>
      </ol>

      {/* Disabled CTA block with notice */}
      <PaymentCtaBlock
        totalDisplay={totalDisplay}
        orderNumber={orderNumber}
        trackingToken={trackingToken}
        onBackToDatos={onBackToDatos}
      />
    </section>
  );
}
