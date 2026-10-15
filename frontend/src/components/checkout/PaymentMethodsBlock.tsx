export function PaymentMethodsBlock() {
  return (
    <ul
      aria-label="Medios de pago disponibles"
      className="grid grid-cols-1 sm:grid-cols-2 gap-3"
    >
      <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect x="2.5" y="5" width="19" height="14" rx="2.5"></rect>
          <path d="M2.5 10h19M6 15h4"></path>
        </svg>
        <div className="flex flex-col">
          <span className="text-base font-extrabold">Tarjeta</span>
          <span className="text-xs text-muted-foreground">Crédito o débito</span>
        </div>
      </li>
      <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M3 9.5l9-5 9 5M5 10v7M9.5 10v7M14.5 10v7M19 10v7M3 19.5h18"></path>
        </svg>
        <div className="flex flex-col">
          <span className="text-base font-extrabold">PSE</span>
          <span className="text-xs text-muted-foreground">Débito desde tu banco</span>
        </div>
      </li>
      <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <rect x="6" y="2.5" width="12" height="19" rx="2.5"></rect>
          <path d="M10.5 18h3"></path>
        </svg>
        <div className="flex flex-col">
          <span className="text-base font-extrabold">Nequi</span>
          <span className="text-xs text-muted-foreground">Lo apruebas en la app</span>
        </div>
      </li>
      <li className="flex items-center gap-3.5 min-h-[64px] px-4 rounded-xl bg-background text-foreground">
        <svg
          width="26"
          height="26"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0"
        >
          <path d="M4 8h13l-3-3M20 16H7l3 3"></path>
        </svg>
        <div className="flex flex-col">
          <span className="text-base font-extrabold">Bancolombia</span>
          <span className="text-xs text-muted-foreground">Transferencia desde tu cuenta</span>
        </div>
      </li>
    </ul>
  );
}
