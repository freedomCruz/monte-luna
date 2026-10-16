import type { CartItem } from '../../lib/cart/store';
import type { VariantAvailability } from '../../lib/catalog/availabilities';
import type { OrderQuoteResponse } from '../../lib/orders/client';
import type { DivipolaDepartment, DivipolaMunicipality } from '../../lib/checkout/divipola';
import type { CheckoutFormData } from '../../lib/checkout/state';
import { PurchaseSteps } from '../ui/purchase-steps';
import { DeliveryDataCard } from './DeliveryDataCard';
import { PaymentMethodsSection } from './PaymentMethodsSection';
import { CheckoutSummaryAside } from './CheckoutSummaryAside';
import { PaymentWindowModal } from './PaymentWindowModal';

export interface CheckoutPaymentStepProps {
  formData: CheckoutFormData;
  quote: OrderQuoteResponse | null;
  quoteError: string | null;
  quoteLoading: boolean;
  selectedDept?: DivipolaDepartment;
  selectedMuni?: DivipolaMunicipality;
  items: CartItem[];
  availabilities: Map<string, VariantAvailability>;
  totalDisplay: string;
  orderNumber?: string;
  trackingToken?: string;
  reservationExpiresAt?: string;
  onBackToDatos: () => void;
  onPay?: () => void;
  isPaymentLoading?: boolean;
  paymentError?: string | null;
  isPaymentWindowOpen?: boolean;
  onClosePaymentWindow?: () => void;
}

export function CheckoutPaymentStep({
  formData,
  quote,
  quoteError,
  quoteLoading,
  selectedDept,
  selectedMuni,
  items,
  availabilities,
  totalDisplay,
  orderNumber,
  trackingToken,
  reservationExpiresAt,
  onBackToDatos,
  onPay,
  isPaymentLoading,
  paymentError,
  isPaymentWindowOpen,
  onClosePaymentWindow,
}: CheckoutPaymentStepProps) {
  const isExpired = reservationExpiresAt
    ? new Date(reservationExpiresAt).getTime() <= Date.now()
    : false;

  return (
    <div className="w-full bg-background text-foreground min-h-screen flex flex-col font-sans">
      {/* Top reassurance banner */}
      <div className="bg-brand-green text-primary-foreground px-6 py-2.5 text-sm md:text-base font-medium flex flex-wrap justify-center items-center gap-x-6 gap-y-1 text-center">
        <span>Sin crear cuenta</span>
        <span aria-hidden="true" className="text-brand-yellow">
          •
        </span>
        <span>Pago seguro con Wompi</span>
        <span aria-hidden="true" className="text-brand-yellow">
          •
        </span>
        <span>Envíos a toda Colombia</span>
      </div>

      <div className="bg-hero">
        <div className="max-w-[1320px] mx-auto px-6 md:px-12 py-10 md:py-12 flex flex-wrap items-end justify-between gap-6 md:gap-12">
          <div className="flex flex-col gap-2">
            <span className="font-condensed text-base md:text-lg font-bold tracking-widest uppercase">
              Paso 3 de 3
            </span>
            <h1 className="font-condensed text-4xl md:text-6xl font-extrabold uppercase tracking-tight">
              Revisa y paga
            </h1>
          </div>
          <div className="flex-1 max-w-[520px]">
            <PurchaseSteps currentStep={3} variant="full" />
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="max-w-[1320px] w-full mx-auto px-4 sm:px-6 md:px-12 py-8 md:py-12 flex-1 flex flex-col lg:flex-row items-start gap-8 lg:gap-12">
        {/* Left Column: Customer Review + Wompi Box */}
        <div className="flex-1 w-full flex flex-col gap-8">
          {/* S5 Out-of-Stock / Insufficient Stock Alert */}
          {(quoteError === 'insufficient_stock' || isExpired) && (
            <div
              role="alert"
              className="flex items-start justify-between gap-4 p-5 bg-card border-2 border-destructive rounded-2xl"
            >
              <div className="flex items-start gap-3">
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
                <div className="flex flex-col gap-1">
                  <span className="text-lg font-bold text-destructive">
                    {isExpired ? 'Tiempo de reserva agotado' : 'Inventario no disponible'}
                  </span>
                  <p className="text-sm text-foreground/80">
                    {isExpired
                      ? 'Pasó el tiempo de reserva sin recibir el pago y liberamos el inventario. Puedes armarlo de nuevo en un minuto.'
                      : 'Uno o más productos de tu carrito ya no tienen stock disponible. Por favor regresa al carrito para ajustar las cantidades.'}
                  </p>
                </div>
              </div>
              <a
                href="/carrito"
                className="shrink-0 px-4 py-2 rounded-xl bg-destructive text-white text-sm font-bold uppercase"
              >
                Ajustar el carrito
              </a>
            </div>
          )}

          {/* Delivery & Billing Data Card */}
          <DeliveryDataCard
            formData={formData}
            quote={quote}
            selectedDept={selectedDept}
            selectedMuni={selectedMuni}
            onBackToDatos={onBackToDatos}
          />

          {/* Wompi Payment Information Section */}
          <PaymentMethodsSection
            totalDisplay={totalDisplay}
            orderNumber={orderNumber}
            trackingToken={trackingToken}
            onBackToDatos={onBackToDatos}
            onPay={onPay}
            isLoading={isPaymentLoading}
            errorMessage={paymentError}
            reservationExpired={isExpired}
          />
        </div>

        {/* Sticky Summary Aside */}
        <CheckoutSummaryAside
          id="h-pedido-pago"
          items={items}
          availabilities={availabilities}
          quote={quote}
          quoteLoading={quoteLoading}
          quoteError={quoteError}
          totalLabel="Total"
          totalDisplay={totalDisplay}
        />
      </main>

      {/* Mobile Sticky Bar (M-Checkout-Pago-390 canvas) */}
      <div className="md:hidden sticky bottom-0 z-10 flex items-center gap-3.5 px-4 py-3 bg-card border-t-2 border-primary shadow-lg">
        <span className="flex flex-col">
          <span className="text-xs font-bold text-muted-foreground">Total</span>
          <span className="text-2xl font-extrabold tracking-tight leading-none">
            {totalDisplay}
          </span>
        </span>
        <button
          type="button"
          disabled={isPaymentLoading || isExpired}
          onClick={onPay}
          className="flex-1 inline-flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-[#C1272D] hover:bg-[#a81f25] text-white font-condensed text-lg font-extrabold uppercase tracking-wide cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed select-none"
        >
          <svg
            width="18"
            height="18"
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
          {isPaymentLoading ? 'Abriendo…' : 'Pagar'}
        </button>
      </div>

      {/* Payment Window Modal ("Ventana de pago" state in M-Checkout-Pago canvas) */}
      {isPaymentWindowOpen && orderNumber && (
        <PaymentWindowModal
          orderNumber={orderNumber}
          totalDisplay={totalDisplay}
          reservationExpiresAt={reservationExpiresAt || ''}
          onClose={() => {
            if (onClosePaymentWindow) onClosePaymentWindow();
          }}
        />
      )}
    </div>
  );
}
