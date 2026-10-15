import type { ReactNode } from 'react';
import { formatMoneyCop } from '../../lib/formatters';

export interface OrderLineItemProps {
  id?: string;
  image?: string;
  title: string;
  variantLabel?: string;
  quantity: number;
  amountMinor?: number | null;
  compareAtAmountMinor?: number | null;
  productionDate?: string | null;
  isCoffee?: boolean;
  controlsSlot?: ReactNode;
}

export function OrderLineItem({
  image,
  title,
  variantLabel,
  quantity,
  amountMinor,
  compareAtAmountMinor,
  productionDate,
  isCoffee,
  controlsSlot,
}: OrderLineItemProps) {
  const hasDiscount = Boolean(
    compareAtAmountMinor &&
      amountMinor !== null &&
      amountMinor !== undefined &&
      compareAtAmountMinor > amountMinor
  );

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
            {formatMoneyCop(compareAtAmountMinor! * quantity)}
          </s>
        )}
        <span className="text-base font-extrabold">
          {amountMinor !== null && amountMinor !== undefined
            ? formatMoneyCop(amountMinor * quantity)
            : '...'}
        </span>
      </div>
    </div>
  );
}
