

export interface QuantityStepperProps {
  quantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  min?: number;
  disabled?: boolean;
  isIncrementDisabled?: boolean;
  isDecrementDisabled?: boolean;
  label?: string;
  decrementLabel?: string;
  incrementLabel?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  decrementButtonClassName?: string;
  incrementButtonClassName?: string;
  valueClassName?: string;
}

export function QuantityStepper({
  quantity,
  onIncrement,
  onDecrement,
  min = 1,
  disabled = false,
  isIncrementDisabled = false,
  isDecrementDisabled = false,
  label = 'Cantidad',
  decrementLabel,
  incrementLabel,
  size = 'md',
  className = '',
  decrementButtonClassName = '',
  incrementButtonClassName = '',
  valueClassName = '',
}: QuantityStepperProps) {
  const isDecDisabled = disabled || isDecrementDisabled || quantity <= min;
  const isIncDisabled = disabled || isIncrementDisabled;
  const decLabel = decrementLabel || 'Quitar una unidad';
  const incLabel = incrementLabel || 'Agregar una unidad';

  // Size variations matching Monteluna design tokens & canvas specs:
  // - sm / compact (CartPanel: h-10 md:h-11, w-10 buttons)
  // - md (CartPage: h-11 sm:h-12, w-11 sm:w-12 buttons)
  // - lg (ProductPurchaseIsland: h-[54px] sm:h-[60px], w-12 buttons)
  const sizeClasses = {
    sm: 'h-10 md:h-11',
    md: 'h-11 sm:h-12',
    lg: 'h-[54px] sm:h-[60px]',
  }[size];

  const buttonSizeClasses = {
    sm: 'w-10 text-xl',
    md: 'w-11 sm:w-12 text-xl',
    lg: 'w-12 text-xl sm:text-2xl',
  }[size];

  const valueSizeClasses = {
    sm: 'min-w-6 text-sm md:text-base',
    md: 'min-w-6 text-base sm:text-lg',
    lg: 'min-w-8 text-lg sm:text-xl',
  }[size];

  return (
    <div
      role="group"
      aria-label={label}
      className={`flex items-center border-2 border-foreground rounded-xl bg-card ${sizeClasses} ${className}`}
    >
      <button
        type="button"
        aria-label={decLabel}
        onClick={onDecrement}
        disabled={isDecDisabled}
        className={`${buttonSizeClasses} h-full border-0 rounded-l-lg bg-transparent text-foreground font-sans font-bold cursor-pointer hover:bg-secondary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-foreground ${decrementButtonClassName}`}
      >
        −
      </button>
      <span
        aria-live="polite"
        className={`${valueSizeClasses} text-center font-extrabold text-foreground font-sans ${valueClassName}`}
      >
        {quantity}
      </span>
      <button
        type="button"
        aria-label={incLabel}
        onClick={onIncrement}
        disabled={isIncDisabled}
        className={`${buttonSizeClasses} h-full border-0 rounded-r-lg bg-transparent text-foreground font-sans font-bold cursor-pointer hover:bg-secondary/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-foreground ${incrementButtonClassName}`}
      >
        +
      </button>
    </div>
  );
}
