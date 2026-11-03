import * as React from 'react';
import { Popover } from 'radix-ui';
import { DateRangeFields } from '../shared/DateRangeFields';
import { formatRangeLabel } from '../../../lib/admin/order-format';
import { orderStatusPresentation, paymentMethodLabel } from '../../../lib/admin/order-status';
import {
  ORDER_STATUSES,
  PAYMENT_METHODS,
  hasActiveFilters,
  type DateFilter,
  type OrderFilters,
} from '../../../lib/admin/orders-query';

interface OrdersFiltersProps {
  searchText: string;
  onSearchText: (value: string) => void;
  filters: OrderFilters;
  onChange: (patch: Partial<OrderFilters>) => void;
  onClear: () => void;
}

const CHEVRON = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>;
const CROSS = <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>;

const CHIP = 'inline-flex h-11 items-center rounded-sm border text-sm font-bold';
const CHIP_OFF = 'border-muted-foreground bg-card text-foreground';
const CHIP_ON = 'border-brand-green bg-brand-green text-background';
const CHIP_BUTTON = 'inline-flex h-full cursor-pointer items-center gap-2 border-0 bg-transparent font-sans text-sm font-bold text-inherit';
const CLEAR_BOX = 'mr-[7px] inline-flex size-[26px] cursor-pointer items-center justify-center rounded-[6px] border-0 bg-[rgba(250,243,227,0.16)] text-inherit';

/**
 * A filter chip that opens a menu (A-Pedidos canvas). While active it is green and
 * carries a separate control that removes the filter.
 */
function FilterChip({ label, active, onClear, clearLabel, open, onOpenChange, children }: {
  label: string;
  active: boolean;
  onClear?: () => void;
  clearLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  return (
    <Popover.Root open={open} onOpenChange={onOpenChange}>
      <span className={`${CHIP} ${active ? CHIP_ON : CHIP_OFF}`}>
        <Popover.Trigger asChild>
          <button type="button" className={`${CHIP_BUTTON} pl-3.5 ${active && onClear ? 'pr-2' : 'pr-3.5'}`}>{label}{!(active && onClear) && CHEVRON}</button>
        </Popover.Trigger>
        {active && onClear && <button type="button" aria-label={clearLabel} onClick={onClear} className={CLEAR_BOX}>{CROSS}</button>}
      </span>
      <Popover.Portal>
        <Popover.Content align="start" sideOffset={6} className="z-50 flex w-64 flex-col rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
          {children}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

const OPTION = 'flex min-h-11 cursor-pointer items-center gap-3 rounded-sm px-2.5 text-[15px] hover:bg-secondary';
const INPUT = 'size-5 shrink-0 cursor-pointer accent-brand-green';

function CheckList<T extends string>({ values, selected, labelOf, onToggle }: { values: T[]; selected: T[]; labelOf: (value: T) => string; onToggle: (next: T[]) => void }) {
  return (
    <>
      {values.map((value) => (
        <label key={value} className={OPTION}>
          <input
            type="checkbox"
            className={INPUT}
            checked={selected.includes(value)}
            onChange={(event) => onToggle(event.target.checked ? [...selected, value] : selected.filter((item) => item !== value))}
          />
          {labelOf(value)}
        </label>
      ))}
    </>
  );
}

function summary(prefix: string, labels: string[]): string {
  return labels.length <= 1 ? `${prefix}: ${labels[0]}` : `${prefix}: ${labels[0]} +${labels.length - 1}`;
}

function dateLabel(filters: OrderFilters): string {
  if (filters.dateFilter === 'all') return 'Fecha: todas';
  if (filters.dateFilter === 'range') return `Fecha: ${formatRangeLabel(filters.fromDate, filters.toDate)}`;
  return 'Fecha: últimos 30 días';
}

function DateMenu({ filters, onChange, close }: { filters: OrderFilters; onChange: (patch: Partial<OrderFilters>) => void; close: () => void }) {
  const [mode, setMode] = React.useState<DateFilter>(filters.dateFilter);
  const choose = (next: DateFilter) => {
    setMode(next);
    if (next !== 'range') {
      onChange({ dateFilter: next, fromDate: '', toDate: '' });
      close();
    }
  };
  return (
    <>
      {([['last_30_days', 'Últimos 30 días'], ['all', 'Todas las fechas'], ['range', 'Rango']] as const).map(([value, text]) => (
        <label key={value} className={OPTION}>
          <input type="radio" name="orders-date-filter" className={INPUT} checked={mode === value} onChange={() => choose(value)} />
          {text}
        </label>
      ))}
      {mode === 'range' && (
        <DateRangeFields initialFrom={filters.fromDate} initialTo={filters.toDate} onApply={(from, to) => { onChange({ dateFilter: 'range', fromDate: from, toDate: to }); close(); }} />
      )}
    </>
  );
}

/** Search box, filter chips and "Limpiar filtros" of the Pedidos toolbar. */
export function OrdersFilters({ searchText, onSearchText, filters, onChange, onClear }: OrdersFiltersProps) {
  const [openMenu, setOpenMenu] = React.useState<'status' | 'date' | 'method' | null>(null);
  const toggle = (menu: 'status' | 'date' | 'method') => (open: boolean) => setOpenMenu(open ? menu : null);
  const dateChanged = filters.dateFilter !== 'last_30_days' && !filters.pendingDispatch;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex h-11 max-w-[360px] flex-[1_1_260px] items-center gap-2.5 rounded-sm border border-muted-foreground bg-card px-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <span className="sr-only">Buscar pedidos</span>
        <input type="search" value={searchText} onChange={(event) => onSearchText(event.target.value)} placeholder="Número, cliente o correo" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-[15px] text-foreground outline-offset-[6px] placeholder:text-muted-foreground" />
      </label>

      {filters.pendingDispatch && (
        <button type="button" aria-pressed="true" onClick={() => onChange({ pendingDispatch: false, dateFilter: 'last_30_days' })} className={`${CHIP} ${CHIP_ON} cursor-pointer gap-2 py-0 pl-3.5 pr-2 font-sans`}>
          Por despachar
          <span aria-hidden="true" className="inline-flex size-[26px] items-center justify-center rounded-[6px] bg-[rgba(250,243,227,0.16)]">{CROSS}</span>
        </button>
      )}

      <FilterChip
        label={filters.status.length > 0 ? summary('Estado', filters.status.map((status) => orderStatusPresentation(status).label)) : 'Estado'}
        active={filters.status.length > 0}
        onClear={() => onChange({ status: [] })}
        clearLabel="Quitar filtro Estado"
        open={openMenu === 'status'}
        onOpenChange={toggle('status')}
      >
        <CheckList values={ORDER_STATUSES} selected={filters.status} labelOf={(status) => orderStatusPresentation(status).label} onToggle={(status) => onChange({ status })} />
      </FilterChip>

      {!filters.pendingDispatch && (
        <FilterChip
          label={dateLabel(filters)}
          active
          onClear={dateChanged ? () => onChange({ dateFilter: 'last_30_days', fromDate: '', toDate: '' }) : undefined}
          clearLabel="Quitar filtro Fecha"
          open={openMenu === 'date'}
          onOpenChange={toggle('date')}
        >
          <DateMenu filters={filters} onChange={onChange} close={() => setOpenMenu(null)} />
        </FilterChip>
      )}

      <FilterChip
        label={filters.methods.length > 0 ? summary('Método', filters.methods.map((method) => paymentMethodLabel(method))) : 'Método de pago'}
        active={filters.methods.length > 0}
        onClear={() => onChange({ methods: [] })}
        clearLabel="Quitar filtro Método de pago"
        open={openMenu === 'method'}
        onOpenChange={toggle('method')}
      >
        <CheckList values={PAYMENT_METHODS} selected={filters.methods} labelOf={(method) => paymentMethodLabel(method)} onToggle={(methods) => onChange({ methods })} />
      </FilterChip>

      {hasActiveFilters(filters) && (
        <button type="button" onClick={onClear} className="h-11 cursor-pointer border-0 bg-transparent px-2 font-sans text-sm font-bold text-foreground underline underline-offset-4">Limpiar filtros</button>
      )}
    </div>
  );
}
