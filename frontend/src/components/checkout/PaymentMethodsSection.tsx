import { PaymentCtaBlock } from './PaymentCtaBlock';

export interface PaymentMethodsSectionProps {
  totalDisplay: string;
  orderNumber?: string;
  trackingToken?: string;
  onBackToDatos: () => void;
  onPay?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  reservationExpired?: boolean;
}

export function PaymentMethodsSection({
  totalDisplay,
  orderNumber,
  trackingToken,
  onBackToDatos,
  onPay,
  isLoading,
  errorMessage,
  reservationExpired,
}: PaymentMethodsSectionProps) {
  return (
    <section
      aria-labelledby="h-pago-metodos"
      className="p-6 md:p-10 bg-primary text-primary-foreground rounded-2xl flex flex-col gap-6.5"
    >
      <div className="flex flex-col gap-2">
        <span className="font-condensed text-base font-bold tracking-widest uppercase text-brand-yellow">
          Pago
        </span>
        <h2 id="h-pago-metodos" className="font-condensed text-3xl md:text-5xl font-extrabold tracking-tight text-primary-foreground">
          Pagas en la ventana segura de Wompi.
        </h2>
        <p className="text-base md:text-lg text-primary-foreground/90 max-w-[600px] leading-relaxed">
          Ahí eliges el medio y escribes sus datos. Monteluna nunca ve ni guarda la información de
          tu tarjeta o de tu banco.
        </p>
      </div>

      {/* Available payment methods grid */}
      <ul
        aria-label="Medios de pago disponibles"
        className="grid grid-cols-1 sm:grid-cols-2 gap-3 list-none p-0 m-0"
      >
        <li className="flex items-center gap-3.5 p-4 rounded-xl bg-muted text-foreground">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="2.5" y="5" width="19" height="14" rx="2.5"></rect>
            <path d="M2.5 10h19M6 15h4"></path>
          </svg>
          <div className="flex flex-col">
            <strong className="text-base font-extrabold">Tarjeta</strong>
            <span className="text-xs text-muted-foreground">Crédito o débito</span>
          </div>
        </li>

        <li className="flex items-center gap-3.5 p-4 rounded-xl bg-muted text-foreground">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d="M3 9.5l9-5 9 5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 19.5h18"></path>
          </svg>
          <div className="flex flex-col">
            <strong className="text-base font-extrabold">PSE</strong>
            <span className="text-xs text-muted-foreground">Débito desde tu banco</span>
          </div>
        </li>

        <li className="flex items-center gap-3.5 p-4 rounded-xl bg-muted text-foreground">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <rect x="6" y="2.5" width="12" height="19" rx="2.5"></rect>
            <path d="M10.5 18h3"></path>
          </svg>
          <div className="flex flex-col">
            <strong className="text-base font-extrabold">Nequi</strong>
            <span className="text-xs text-muted-foreground">Lo apruebas en la app</span>
          </div>
        </li>

        <li className="flex items-center gap-3.5 p-4 rounded-xl bg-muted text-foreground">
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className="shrink-0"
          >
            <path d="M4 8h13l-3-3M20 16H7l3 3"></path>
          </svg>
          <div className="flex flex-col">
            <strong className="text-base font-extrabold">Bancolombia</strong>
            <span className="text-xs text-muted-foreground">Transferencia desde tu cuenta</span>
          </div>
        </li>
      </ul>

      {/* 3 Steps summary */}
      <ol className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-primary-foreground/20 list-none p-0 m-0 text-sm">
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

      {/* CTA block */}
      <PaymentCtaBlock
        totalDisplay={totalDisplay}
        orderNumber={orderNumber}
        trackingToken={trackingToken}
        onBackToDatos={onBackToDatos}
        onPay={onPay}
        isLoading={isLoading}
        errorMessage={errorMessage}
        reservationExpired={reservationExpired}
      />
    </section>
  );
}
