export interface PaymentCtaBlockProps {
  totalDisplay: string;
  onBackToDatos: () => void;
}

export function PaymentCtaBlock({ totalDisplay, onBackToDatos }: PaymentCtaBlockProps) {
  return (
    <div className="flex flex-col gap-4">
      {/* Informative notice that online payment is coming soon (S5) */}
      <div
        role="status"
        aria-live="polite"
        className="flex items-center justify-center p-3 rounded-xl bg-hero/20 border border-hero/40 text-sm font-semibold text-hero text-center"
      >
        <span>El pago en línea estará disponible pronto.</span>
      </div>

      <button
        type="button"
        disabled
        aria-disabled="true"
        className="w-full flex items-center justify-center gap-3 min-h-[64px] px-8 rounded-xl bg-accent text-white font-condensed text-2xl font-extrabold uppercase tracking-wide opacity-50 cursor-not-allowed select-none"
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
          <rect x="5" y="10.5" width="14" height="10" rx="2"></rect>
          <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"></path>
        </svg>
        Pagar {totalDisplay}
      </button>

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
