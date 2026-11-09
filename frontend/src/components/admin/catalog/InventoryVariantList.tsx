import * as React from 'react';
import type { AdminInventoryVariant } from '../../../lib/admin/catalog';
import { variantStockBadge } from '../../../lib/admin/inventory-format';
import { INVENTORY_STATUSES, hasActiveInventoryFilters, type InventoryFilters, type InventoryStatus } from '../../../lib/admin/inventory-query';
import { CHEVRON, CHIP, CHIP_BUTTON, CHIP_OFF, CHIP_ON, CLEAR_BOX, CROSS, FilterChip, INPUT, OPTION } from '../shared/FilterChip';
import { SelectBox } from './product/fields';

export type VariantListLoad =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; rows: AdminInventoryVariant[] };

const STATUS_LABEL: Record<InventoryStatus, string> = { all: 'Todas', active: 'Activas', archived: 'Archivadas' };

function StockTag({ variant }: { variant: AdminInventoryVariant }) {
  const badge = variantStockBadge(variant);
  if (!badge) return null;
  const colors = badge.tone === 'problem' ? 'bg-destructive text-card' : 'bg-brand-yellow text-foreground';
  return <span className={`inline-flex h-5 items-center rounded-[6px] px-[7px] text-[11px] font-bold ${colors}`}>{badge.label}</span>;
}

interface FiltersProps {
  filters: InventoryFilters;
  onChange: (patch: Partial<InventoryFilters>) => void;
  onClear: () => void;
}

/** Stock, status and single-product chips of the variant list. */
function InventoryFilterChips({ filters, onChange, onClear }: FiltersProps) {
  const [statusOpen, setStatusOpen] = React.useState(false);
  const statusActive = filters.status !== 'all';
  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2">
      <span className={`${CHIP} ${filters.lowStock ? CHIP_ON : CHIP_OFF}`}>
        <button type="button" aria-pressed={filters.lowStock} onClick={() => onChange({ lowStock: !filters.lowStock })} className={`${CHIP_BUTTON} pl-3.5 ${filters.lowStock ? 'pr-2' : 'pr-3.5'}`}>
          {filters.lowStock ? 'Stock: poco o agotado' : 'Stock'}
          {filters.lowStock ? <span aria-hidden="true" className={`${CLEAR_BOX} mr-0`}>{CROSS}</span> : CHEVRON}
        </button>
      </span>
      <FilterChip
        label={statusActive ? `Estado: ${STATUS_LABEL[filters.status]}` : 'Estado'}
        active={statusActive}
        onClear={() => onChange({ status: 'all' })}
        clearLabel="Quitar filtro Estado"
        open={statusOpen}
        onOpenChange={setStatusOpen}
      >
        {INVENTORY_STATUSES.map((status) => (
          <label key={status} className={OPTION}>
            <input type="radio" name="inventory-status" className={INPUT} checked={filters.status === status} onChange={() => { onChange({ status }); setStatusOpen(false); }} />
            {STATUS_LABEL[status]}
          </label>
        ))}
      </FilterChip>
      {filters.productId !== '' && (
        <span className={`${CHIP} ${CHIP_ON}`}>
          <span className="pl-3.5 pr-2">Un solo producto</span>
          <button type="button" aria-label="Quitar filtro Producto" onClick={() => onChange({ productId: '' })} className={CLEAR_BOX}>{CROSS}</button>
        </span>
      )}
      {hasActiveInventoryFilters(filters) && (
        <button type="button" onClick={onClear} className="h-11 cursor-pointer border-0 bg-transparent px-2 font-sans text-sm font-bold text-foreground underline underline-offset-4">Limpiar filtros</button>
      )}
    </div>
  );
}

interface PanelProps extends FiltersProps {
  searchText: string;
  onSearchText: (value: string) => void;
  load: VariantListLoad;
  selectedId: string | null;
  onSelect: (variantId: string) => void;
  onRetry: () => void;
  onClearAll: () => void;
  footer: React.ReactNode;
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex h-11 items-center gap-2 rounded-sm border border-muted-foreground bg-card px-2.5">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
      <span className="sr-only">Buscar variante</span>
      <input type="search" value={value} onChange={(event) => onChange(event.target.value)} placeholder="Producto o SKU" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-sm text-foreground outline-offset-[6px] placeholder:text-muted-foreground" />
    </label>
  );
}

function ListBody({ load, selectedId, onSelect, onRetry, onClearAll, narrowed }: Pick<PanelProps, 'load' | 'selectedId' | 'onSelect' | 'onRetry' | 'onClearAll'> & { narrowed: boolean }) {
  if (load.status === 'loading') {
    return (
      <div aria-busy="true" aria-label="Cargando variantes" className="flex flex-col gap-0.5 px-2 pb-2">
        {[0, 1, 2, 3, 4].map((row) => <span key={row} className="h-14 rounded-sm bg-secondary motion-safe:animate-pulse" />)}
      </div>
    );
  }
  if (load.status === 'error') {
    return (
      <div role="alert" className="flex flex-col items-start gap-2.5 px-4 pb-4">
        <p className="m-0 text-[15px] font-bold">No pudimos cargar las variantes.</p>
        <button type="button" onClick={onRetry} className="inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
      </div>
    );
  }
  if (load.rows.length === 0) {
    return (
      <div className="flex flex-col items-start gap-2.5 px-4 pb-4">
        <h3 className="m-0 text-base font-extrabold">{narrowed ? 'Ninguna variante coincide' : 'Aún no hay variantes'}</h3>
        <p className="m-0 text-sm leading-5 text-muted-foreground">{narrowed ? 'Prueba con otra búsqueda o quita algún filtro para ver más.' : 'Las variantes aparecen aquí cuando creas un producto con sus presentaciones.'}</p>
        {narrowed && <button type="button" onClick={onClearAll} className="h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-4 font-sans text-[15px] font-bold text-foreground">Limpiar filtros</button>}
      </div>
    );
  }
  return (
    <ul className="m-0 flex list-none flex-col gap-0.5 px-2 pb-2">
      {load.rows.map((variant) => {
        const selected = variant.variant_id === selectedId;
        return (
          <li key={variant.variant_id}>
            <button type="button" aria-pressed={selected} onClick={() => onSelect(variant.variant_id)} className={`flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-sm border-0 px-2.5 py-1.5 text-left font-sans text-foreground ${selected ? 'bg-[var(--hero)]' : 'bg-transparent hover:bg-secondary'}`}>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-extrabold">{variant.product_title}</span>
                <span className="text-[13px] text-muted-foreground">{variant.variant_label}{variant.variant_status === 'archived' ? ' · Archivada' : ''}</span>
              </span>
              <span className="flex flex-col items-end gap-0.5">
                <span className="text-[15px] font-extrabold">{variant.available_quantity}</span>
                <StockTag variant={variant} />
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Variant list of A-Inventario at 1024 px and up: search, filters, rows with the stock flag and pagination. */
export function VariantPanel({ searchText, onSearchText, filters, onChange, onClear, onClearAll, load, selectedId, onSelect, onRetry, footer }: PanelProps) {
  const narrowed = hasActiveInventoryFilters(filters) || filters.search.trim() !== '';
  return (
    <section aria-labelledby="h-var" className="flex w-[320px] flex-none flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-2.5 p-4">
        <h2 id="h-var" className="m-0 text-lg font-extrabold">Variantes</h2>
        <SearchBox value={searchText} onChange={onSearchText} />
        <InventoryFilterChips filters={filters} onChange={onChange} onClear={onClear} />
      </div>
      <ListBody load={load} selectedId={selectedId} onSelect={onSelect} onRetry={onRetry} onClearAll={onClearAll} narrowed={narrowed} />
      {footer}
    </section>
  );
}

/** Below 1024 px (the caller picks by width) the artboard swaps the list for a "Variante" select; search and filters stay reachable above it. */
export function VariantSelect({ searchText, onSearchText, filters, onChange, onClear, load, selectedId, onSelect, onRetry }: Omit<PanelProps, 'onClearAll' | 'footer'>) {
  const rows = load.status === 'ready' ? load.rows : [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2.5">
        <SearchBox value={searchText} onChange={onSearchText} />
        <InventoryFilterChips filters={filters} onChange={onChange} onClear={onClear} />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">Variante</span>
        <SelectBox value={selectedId ?? ''} disabled={rows.length === 0} onChange={(event) => onSelect(event.target.value)}>
          {rows.length === 0 && <option value="">{load.status === 'loading' ? 'Cargando variantes…' : 'Sin variantes'}</option>}
          {rows.map((variant) => (
            <option key={variant.variant_id} value={variant.variant_id}>{variant.product_title} · {variant.variant_label}</option>
          ))}
        </SelectBox>
      </label>
      {load.status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-2.5">
          <p className="m-0 text-[15px] font-bold">No pudimos cargar las variantes.</p>
          <button type="button" onClick={onRetry} className="inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
        </div>
      )}
    </div>
  );
}
