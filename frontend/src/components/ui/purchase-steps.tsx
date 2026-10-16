import React from 'react';

export interface PurchaseStepsProps {
  currentStep: 1 | 2 | 3;
  variant?: 'breadcrumbs' | 'full';
}

export function PurchaseSteps({ currentStep, variant = 'full' }: PurchaseStepsProps) {
  if (variant === 'breadcrumbs') {
    return (
      <nav
        aria-label="Pasos de compra"
        className="flex items-center gap-2 text-xs md:text-sm font-semibold text-muted-foreground uppercase tracking-wider"
      >
        <span className={currentStep === 1 ? 'text-foreground font-extrabold' : 'text-foreground/80'}>
          1. Carrito
        </span>
        <span aria-hidden="true" className="text-muted-foreground/60">
          /
        </span>
        <span
          className={
            currentStep === 2
              ? 'text-foreground font-extrabold'
              : currentStep > 2
                ? 'text-foreground/80'
                : 'text-muted-foreground/60'
          }
        >
          2. Datos y envío
        </span>
        <span aria-hidden="true" className="text-muted-foreground/60">
          /
        </span>
        <span className={currentStep === 3 ? 'text-foreground font-extrabold' : 'text-muted-foreground/60'}>
          3. Pago
        </span>
      </nav>
    );
  }

  return (
    <ol
      aria-label="Pasos de compra"
      className="list-none m-0 p-0 flex-1 max-w-[520px] flex items-center gap-2 md:gap-3 text-sm md:text-[17px] font-bold"
    >
      <li
        aria-current={currentStep === 1 ? 'step' : undefined}
        className={`flex items-center gap-2 md:gap-2.5 ${
          currentStep === 1 ? 'text-foreground' : 'text-foreground/80'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-condensed text-lg md:text-[22px] font-extrabold ${
            currentStep === 1
              ? 'bg-foreground text-primary-foreground'
              : 'border-2 border-foreground bg-card text-foreground'
          }`}
        >
          1
        </span>
        <span>Carrito</span>
      </li>

      <li
        aria-hidden="true"
        className={`flex-1 h-0.5 ${currentStep >= 2 ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
      />

      <li
        aria-current={currentStep === 2 ? 'step' : undefined}
        className={`flex items-center gap-2 md:gap-2.5 ${
          currentStep === 2 ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-condensed text-lg md:text-[22px] font-extrabold ${
            currentStep === 2
              ? 'bg-foreground text-primary-foreground'
              : currentStep > 2
                ? 'border-2 border-foreground bg-card text-foreground'
                : 'border-2 border-muted-foreground bg-card text-muted-foreground'
          }`}
        >
          2
        </span>
        <span className="hidden sm:inline">Datos y envío</span>
        <span className="sm:hidden">Datos</span>
      </li>

      <li
        aria-hidden="true"
        className={`flex-1 h-0.5 ${currentStep >= 3 ? 'bg-foreground' : 'bg-muted-foreground/40'}`}
      />

      <li
        aria-current={currentStep === 3 ? 'step' : undefined}
        className={`flex items-center gap-2 md:gap-2.5 ${
          currentStep === 3 ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        <span
          className={`inline-flex items-center justify-center w-8 h-8 md:w-10 md:h-10 rounded-full font-condensed text-lg md:text-[22px] font-extrabold ${
            currentStep === 3
              ? 'bg-foreground text-primary-foreground'
              : 'border-2 border-muted-foreground bg-card text-muted-foreground'
          }`}
        >
          3
        </span>
        <span>Pago</span>
      </li>
    </ol>
  );
}
