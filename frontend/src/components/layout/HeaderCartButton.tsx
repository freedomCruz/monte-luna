import { useStore } from '@nanostores/react';
import { $totalItems, openCart } from '../../lib/cart/store';

export function HeaderCartButton() {
  const total = useStore($totalItems);

  return (
    <>
      {/* Desktop version (>= 768px): text button with count "Carrito (N)" */}
      <button
        type="button"
        data-testid="header-cart-desktop"
        onClick={openCart}
        aria-haspopup="dialog"
        aria-label={`Abrir el carrito (${total} ${total === 1 ? 'producto' : 'productos'})`}
        className="hidden md:inline-flex items-center gap-2.5 min-h-[48px] px-5 rounded-xl bg-foreground text-primary-foreground text-sm font-bold uppercase cursor-pointer hover:bg-foreground/90 transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 8h14l-1 12H6L5 8z"></path>
          <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
        </svg>
        <span>Carrito ({total})</span>
      </button>

      {/* Mobile version (< 768px): icon button with circular red badge */}
      <button
        type="button"
        data-testid="header-cart-mobile"
        onClick={openCart}
        aria-haspopup="dialog"
        aria-label={`Abrir el carrito (${total} ${total === 1 ? 'producto' : 'productos'})`}
        className="relative md:hidden inline-flex items-center justify-center w-[46px] h-[46px] rounded-xl bg-foreground text-primary-foreground cursor-pointer focus-visible:outline-3 focus-visible:outline-foreground"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 8h14l-1 12H6L5 8z"></path>
          <path d="M9 8V6a3 3 0 0 1 6 0v2"></path>
        </svg>
        <span
          className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-accent text-white text-[13px] leading-[22px] font-extrabold text-center box-border pointer-events-none"
        >
          {total}
        </span>
      </button>
    </>
  );
}
