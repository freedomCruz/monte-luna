import React from 'react';

export interface PaymentCtaBlockProps {
  totalDisplay: string;
  orderNumber?: string;
  trackingToken?: string;
  onBackToDatos: () => void;
  onPay?: () => void;
  isLoading?: boolean;
  errorMessage?: string | null;
  reservationExpired?: boolean;
}

export function PaymentCtaBlock({
  totalDisplay,
  orderNumber,
  trackingToken,
  onBackToDatos,
  onPay,
  isLoading,
  errorMessage,
  reservationExpired,
}: PaymentCtaBlockProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Expiry alert if reservation time ran out */}
      {reservationExpired && (
        <div
          role="alert"
          className="flex flex-col items-center justify-center p-4 rounded-xl bg-destructive/15 border-2 border-destructive text-center gap-1.5"
        >
          <span className="text-sm font-bold text-destructive">
            Se acabó el tiempo de reserva de este pedido.
          </span>
          <span className="text-xs text-primary-foreground/90">
            El inventario fue liberado. Por favor regresa al carrito para armar tu pedido de nuevo.
          </span>
        </div>
      )}

      {/* Error message alert */}
      {errorMessage && (
        <div
          role="alert"
          className="flex items-center gap-3 p-4 rounded-xl bg-destructive/15 border border-destructive text-destructive text-sm font-medium"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" />
          </svg>
          <span className="flex-1">{errorMessage}</span>
        </div>
      )}

      {/* Active Pagar CTA */}
      <button
        type="button"
        disabled={isLoading || reservationExpired}
        aria-busy={isLoading ? 'true' : undefined}
        onClick={onPay}
        className="w-full flex items-center justify-center gap-3 min-h-[64px] md:min-h-[72px] px-8 rounded-xl bg-[#C1272D] hover:bg-[#a81f25] text-white font-condensed text-2xl font-extrabold uppercase tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed transition-colors select-none"
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <rect x="5" y="10.5" width="14" height="10" rx="2" />
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
        </svg>
        {isLoading ? 'Abriendo Wompi…' : `Pagar ${totalDisplay}`}
      </button>

      {trackingToken && (
        <a
          href={`/pedido?token=${encodeURIComponent(trackingToken)}`}
          className="self-center min-h-[44px] inline-flex items-center text-sm font-bold uppercase text-brand-yellow hover:underline underline-offset-4 cursor-pointer text-center"
        >
          Ir a seguimiento de pedido ({orderNumber}) →
        </a>
      )}

      <button
        type="button"
        onClick={onBackToDatos}
        className="self-center min-h-[44px] inline-flex items-center text-sm font-bold uppercase text-primary-foreground underline underline-offset-4 hover:text-brand-yellow cursor-pointer"
      >
        ← Volver a datos y envío
      </button>
    </div>
  );
}
