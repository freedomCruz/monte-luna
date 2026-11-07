import * as React from 'react';
import { DateRangeFields } from '../shared/DateRangeFields';
import { CHIP, CHIP_OFF, CHIP_ON, CROSS, CheckList, FilterChip, INPUT, OPTION, summary } from '../shared/FilterChip';
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
