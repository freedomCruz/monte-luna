import type { ReactNode } from 'react';
import { formatMoneyCop } from '../../lib/shared/formatters';

export interface OrderLineItemProps {
  id?: string;
  variantId?: string;
  image?: string;
  title: string;
  titleHref?: string;
  variantLabel?: string;
  quantity: number;
  amountMinor?: number | null;
  compareAtAmountMinor?: number | null;
  productionDate?: string | null;
  originSlug?: string;
  originName?: string;
  isCoffee?: boolean;
  variant?: 'compact' | 'panel' | 'page';
  onTitleClick?: () => void;
  onOriginClick?: () => void;
  onRemove?: () => void;
  controlsSlot?: ReactNode;
}

export function OrderLineItem({
  id,
  image,
  title,
  titleHref,
  variantLabel,
  quantity,
  amountMinor,
  compareAtAmountMinor,
  productionDate,
  originSlug,
  originName,
  isCoffee = false,
  variant = 'compact',
  onTitleClick,
  onOriginClick,
  onRemove,
  controlsSlot,
}: OrderLineItemProps) {
  const hasDiscount = Boolean(
    compareAtAmountMinor &&
      amountMinor !== null &&
      amountMinor !== undefined &&
      compareAtAmountMinor > amountMinor
  );

  const formattedTotal =
    amountMinor !== null && amountMinor !== undefined
      ? formatMoneyCop(amountMinor * quantity)
      : '...';

  const formattedCompareTotal =
    compareAtAmountMinor !== null && compareAtAmountMinor !== undefined
      ? formatMoneyCop(compareAtAmountMinor * quantity)
      : null;

  // 1. COMPACT VARIANT: Used in CheckoutSummaryAside (and other tight review asides)
  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3.5">
        <div className="relative shrink-0 w-16 h-16 rounded-xl bg-secondary flex items-center justify-center p-1">
          {image ? (
            <img src={image} alt="" className="w-full h-full object-contain" />
          ) : (
            <span className="font-condensed font-bold text-xs">Monteluna</span>
          )}
          <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1.5 rounded-full bg-foreground text-background text-xs font-extrabold flex items-center justify-center">
            {quantity}
          </span>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <span className="text-base font-extrabold truncate">{title}</span>
          {variantLabel && <span className="text-xs text-muted-foreground">{variantLabel}</span>}
          {productionDate && isCoffee && (
            <span className="text-xs font-semibold text-brand-green">
              Tostado el {productionDate}
            </span>
          )}
          {controlsSlot}
        </div>

        <div className="flex flex-col items-end">
          {hasDiscount && (
            <s aria-label="Precio regular" className="text-xs text-muted-foreground">
              {formattedCompareTotal}
            </s>
          )}
          <span className="text-base font-extrabold">{formattedTotal}</span>
        </div>
      </div>
    );
  }

  // 2. PANEL VARIANT: Matches M-Carrito-Panel (Slide-over drawer)
  if (variant === 'panel') {
    return (
      <article
        key={id}
        className="relative flex flex-col gap-2 pt-4 pb-4 pr-3 pl-28 md:pl-32 bg-card rounded-[20px] shadow-sm border border-foreground/5 mt-4"
      >
        {image && (
          <img
            src={image}
            alt={title}
            className="absolute left-1 md:left-2 -top-5 h-36 md:h-40 object-contain -rotate-6 drop-shadow-md pointer-events-none"
          />
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="flex flex-col gap-0.5 min-w-0">
            <h3 className="m-0 text-lg md:text-[21px] font-extrabold leading-tight text-foreground truncate">
              {titleHref ? (
                <a
                  href={titleHref}
                  onClick={onTitleClick}
                  className="hover:text-accent transition-colors no-underline text-foreground"
                >
                  {title}
                </a>
              ) : (
                title
              )}
            </h3>
            {variantLabel && (
              <span className="text-sm md:text-[15px] font-medium text-muted-foreground">
                {variantLabel}
              </span>
            )}
          </div>

          {onRemove && (
            <button
              type="button"
              aria-label={`Quitar ${title} del carrito`}
              onClick={onRemove}
              className="flex-none inline-flex items-center justify-center w-10 h-10 -mr-1 -mt-1 rounded-xl bg-transparent text-muted-foreground hover:text-accent cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
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
                <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
              </svg>
            </button>
          )}
        </div>

        {/* Metadata tags: roast date or origin if coffee */}
        <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
          {isCoffee && productionDate && (
            <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs md:text-sm font-semibold">
              Tostado el {productionDate}
            </span>
          )}
          {originSlug && (
            <a
              href={`/origenes/${originSlug}`}
              onClick={onOriginClick}
              className="text-xs md:text-sm font-bold uppercase underline decoration-2 underline-offset-4 text-foreground hover:text-accent"
            >
              Su origen →
            </a>
          )}
        </div>

        {/* Quantity controls and Line price */}
        <div className="flex items-center justify-between gap-3 pt-1">
          {controlsSlot}

          <div className="flex flex-col items-end gap-0.5">
            {hasDiscount && (
              <s
                aria-label="Precio anterior"
                className="text-xs md:text-sm font-medium text-muted-foreground"
              >
                {formattedCompareTotal}
              </s>
            )}
            <span className="text-lg md:text-[22px] font-extrabold tracking-tight text-foreground leading-none">
              {formattedTotal}
            </span>
          </div>
        </div>
      </article>
    );
  }

  // 3. PAGE VARIANT: Matches M-Carrito (/carrito full page)
  return (
    <article
      key={id}
      className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4 sm:gap-7 mt-8 sm:mt-9 pt-6 pb-6 pr-4 sm:pr-16 pl-28 sm:pl-48 bg-card rounded-[20px] shadow-sm border border-foreground/5 min-h-[170px]"
    >
      {image && (
        <img
          src={image}
          alt={title}
          className="absolute left-1 sm:left-3 -top-6 h-40 sm:h-52 object-contain -rotate-6 drop-shadow-md pointer-events-none"
        />
      )}

      <div className="flex flex-col gap-1.5 min-w-0 flex-1">
        <span className="font-condensed text-sm sm:text-base font-bold tracking-wider uppercase text-brand-green">
          {isCoffee ? 'Café · Origen' : 'Cacao fino'}
        </span>
        <h2 className="m-0 text-xl sm:text-[26px] font-extrabold leading-tight text-foreground truncate">
          {titleHref ? (
            <a
              href={titleHref}
              className="hover:text-accent transition-colors no-underline text-foreground"
            >
              {title}
            </a>
          ) : (
            title
          )}
        </h2>
        {variantLabel && (
          <span className="text-sm sm:text-[16px] font-medium text-muted-foreground">
            {variantLabel}
          </span>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isCoffee && productionDate && (
            <span className="px-2.5 py-1 rounded-lg bg-secondary text-foreground text-xs sm:text-sm font-semibold">
              Tostado el {productionDate}
            </span>
          )}
          {originSlug && (
            <a
              href={`/origenes/${originSlug}`}
              className="text-xs sm:text-sm font-bold uppercase underline decoration-2 underline-offset-4 text-foreground hover:text-accent transition-colors"
            >
              De {originName || originSlug} →
            </a>
          )}
        </div>
      </div>

      <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center gap-3">
        <div className="flex items-baseline gap-2">
          {hasDiscount && (
            <s
              aria-label="Precio anterior"
              className="text-sm sm:text-base font-medium text-muted-foreground"
            >
              {formattedCompareTotal}
            </s>
          )}
          <span className="text-2xl sm:text-[28px] font-extrabold tracking-tight text-foreground leading-none">
            {formattedTotal}
          </span>
        </div>

        {controlsSlot}
      </div>

      {onRemove && (
        <button
          type="button"
          aria-label={`Quitar ${title} del carrito`}
          onClick={onRemove}
          className="absolute top-2.5 right-2.5 inline-flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-transparent text-muted-foreground hover:text-accent cursor-pointer transition-colors focus-visible:outline-3 focus-visible:outline-foreground"
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
            <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" />
          </svg>
        </button>
      )}
    </article>
  );
}
