import { PAGE_SIZES, type PageSize } from '../../../lib/admin/orders-query';

interface ListPaginationProps {
  /** 1-based position of the first row on this page. */
  start: number;
  count: number;
  total: number;
  limit: PageSize;
  onLimit: (limit: PageSize) => void;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  /** Singular and plural of the listed record, for the counter. Defaults to orders. */
  noun?: { singular: string; plural: string };
}

const BUTTON = 'h-11 rounded-sm px-3.5 font-sans text-sm font-bold';

/** Footer of an admin table: counter, rows per page and Anterior / Siguiente (cursor pagination). */
export function ListPagination({ start, count, total, limit, onLimit, hasPrevious, hasNext, onPrevious, onNext, noun = { singular: 'pedido', plural: 'pedidos' } }: ListPaginationProps) {
  const counter = total === 1 ? `1 ${noun.singular}` : `${start}–${start + count - 1} de ${total} ${noun.plural}`;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-2.5 text-sm">
      <span role="status" className="font-bold text-foreground">{counter}</span>
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="inline-flex items-center gap-2">
          Filas por página
          <span className="relative inline-block">
            <select value={limit} onChange={(event) => onLimit(Number(event.target.value) as PageSize)} className="h-11 appearance-none rounded-sm border border-muted-foreground bg-card py-0 pl-2.5 pr-[30px] font-sans text-sm font-bold text-foreground">
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-2.5 top-[15px]"><path d="M6 9l6 6 6-6" /></svg>
          </span>
        </label>
        <button type="button" disabled={!hasPrevious} onClick={onPrevious} className={`${BUTTON} border border-dashed border-[color:var(--dashed)] bg-secondary text-muted-foreground enabled:cursor-pointer enabled:border-solid enabled:border-muted-foreground enabled:bg-card enabled:text-foreground`}>‹ Anterior</button>
        <button type="button" disabled={!hasNext} onClick={onNext} className={`${BUTTON} border border-dashed border-[color:var(--dashed)] bg-secondary text-muted-foreground enabled:cursor-pointer enabled:border-solid enabled:border-muted-foreground enabled:bg-card enabled:text-foreground`}>Siguiente ›</button>
      </div>
    </div>
  );
}
