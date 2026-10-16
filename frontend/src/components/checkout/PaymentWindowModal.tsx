import React from 'react';
import { OrderCountdownTimer } from '../orders/OrderCountdownTimer';

export interface PaymentWindowModalProps {
  orderNumber: string;
  totalDisplay: string;
  reservationExpiresAt: string;
  onClose: () => void;
}

export function PaymentWindowModal({
  orderNumber,
  totalDisplay,
  reservationExpiresAt,
  onClose,
}: PaymentWindowModalProps) {
  return (
    <div
      role="presentation"
      className="fixed inset-0 z-50 flex items-end md:items-start justify-center p-0 md:p-6 md:pt-24 bg-[#1B1510]/60 backdrop-blur-xs overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="h-ventana"
        className="w-full max-w-[430px] md:max-w-[520px] bg-card text-foreground rounded-t-[24px] md:rounded-[20px] p-4 pt-3 pb-6 md:p-7 flex flex-col gap-3.5 md:gap-4.5 shadow-2xl border border-border"
      >
        {/* Mobile handle */}
        <span
          aria-hidden="true"
          className="md:hidden self-center w-11 h-1.5 rounded-full bg-[#D9CBA8]"
        />

        {/* Header: title + close button */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5 md:gap-1">
            <span className="font-condensed text-[15px] md:text-[17px] font-bold tracking-widest uppercase text-muted-foreground">
              Pedido creado
            </span>
            <h2
              id="h-ventana"
              className="m-0 font-condensed text-[34px] md:text-[40px] leading-none font-extrabold tracking-wide"
            >
              {orderNumber}
            </h2>
          </div>
          <button
            type="button"
            aria-label="Cerrar la ventana de pago"
            onClick={onClose}
            className="shrink-0 inline-flex items-center justify-center w-11 h-11 md:w-12 md:h-12 rounded-xl bg-primary text-primary-foreground hover:opacity-90 cursor-pointer"
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
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {/* 30-min reservation timer */}
        {reservationExpiresAt && (
          <OrderCountdownTimer
            expiresAt={reservationExpiresAt}
            onExpire={() => {
              // Timer expiry in modal
            }}
          />
        )}

        {/* Dashed placeholder box representing Wompi checkout modal opening */}
        <div className="flex flex-col items-center justify-center gap-2 min-h-[240px] md:min-h-[260px] p-5 md:p-6 border-2 border-dashed border-[#A8997C] rounded-2xl text-center text-muted-foreground">
          <svg
            width="36"
            height="36"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <rect x="5" y="10.5" width="14" height="10" rx="2" />
            <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
          </svg>
          <span className="text-base md:text-lg font-extrabold text-foreground">
            [Aquí se abre la ventana de pago de Wompi]
          </span>
          <span className="max-w-[340px] text-sm md:text-base leading-relaxed">
            El medio de pago y sus datos se escriben ahí, no en Monteluna. Total a pagar: {totalDisplay}.
          </span>
        </div>

        <span className="text-xs md:text-sm text-center text-muted-foreground leading-relaxed">
          Si cierras esta ventana, tu pedido sigue apartado hasta que se acabe el tiempo y puedes volver a intentar el pago.
        </span>
      </div>
    </div>
  );
}
