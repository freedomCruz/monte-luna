import * as React from 'react';
import { isValidRange } from '../../../lib/admin/orders-query';

const INPUT = 'h-11 rounded-sm border border-muted-foreground bg-card px-2.5 font-sans text-[15px] font-normal';

/**
 * Desde / Hasta calendar dates with "Aplicar rango", shared by the Pedidos date filter
 * and the Inicio "Rango" period. Native date inputs: no date picker dependency.
 */
export function DateRangeFields({ initialFrom = '', initialTo = '', max, onApply }: { initialFrom?: string; initialTo?: string; max?: string; onApply: (from: string, to: string) => void }) {
  const [from, setFrom] = React.useState(initialFrom);
  const [to, setTo] = React.useState(initialTo);
  const valid = isValidRange(from, to) && (max === undefined || to <= max);
  return (
    <div className="flex flex-col gap-2 px-2.5 pb-2 pt-1">
      <label className="flex flex-col gap-1 text-sm font-bold">Desde
        <input type="date" value={from} max={to || max} onChange={(event) => setFrom(event.target.value)} className={INPUT} />
      </label>
      <label className="flex flex-col gap-1 text-sm font-bold">Hasta
        <input type="date" value={to} min={from || undefined} max={max} onChange={(event) => setTo(event.target.value)} className={INPUT} />
      </label>
      <button type="button" disabled={!valid} onClick={() => onApply(from, to)} className="h-11 cursor-pointer rounded-sm border-0 bg-primary font-sans text-sm font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50">Aplicar rango</button>
    </div>
  );
}
