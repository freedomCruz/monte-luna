import * as React from 'react';
import type { AdminCategory } from '../../../lib/admin/catalog';
import { productStatusPresentation } from '../../../lib/admin/product-format';
import { PRODUCT_STATUSES, hasActiveProductFilters, type ProductFilters } from '../../../lib/admin/products-query';
import { CHEVRON, CHIP, CHIP_BUTTON, CHIP_OFF, CHIP_ON, CLEAR_BOX, CROSS, CheckList, FilterChip, summary } from '../shared/FilterChip';

interface Option {
  id: string;
  name: string;
}

interface ProductsFiltersProps {
  searchText: string;
  onSearchText: (value: string) => void;
  filters: ProductFilters;
  productTypes: Option[];
  categories: Pick<AdminCategory, 'id' | 'name'>[];
  onChange: (patch: Partial<ProductFilters>) => void;
  onClear: () => void;
}

type Menu = 'type' | 'category' | 'status';

function labelsOf(options: Option[], ids: string[]): string[] {
  return ids.map((id) => options.find((option) => option.id === id)?.name ?? id);
}

/** Search box, filter chips and "Limpiar filtros" of the Productos toolbar (A-Productos). */
export function ProductsFilters({ searchText, onSearchText, filters, productTypes, categories, onChange, onClear }: ProductsFiltersProps) {
  const [openMenu, setOpenMenu] = React.useState<Menu | null>(null);
  const toggle = (menu: Menu) => (open: boolean) => setOpenMenu(open ? menu : null);
  const optionIds = (options: Option[]) => options.map((option) => option.id);

  return (
    <div role="group" aria-label="Filtros" className="flex flex-wrap items-center gap-2">
      <label className="flex h-11 max-w-[360px] flex-[1_1_260px] items-center gap-2.5 rounded-sm border border-muted-foreground bg-card px-3">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg>
        <span className="sr-only">Buscar productos</span>
        <input type="search" value={searchText} onChange={(event) => onSearchText(event.target.value)} placeholder="Buscar por nombre o SKU" className="h-full min-w-0 flex-1 border-0 bg-transparent font-sans text-[15px] text-foreground outline-offset-[6px] placeholder:text-muted-foreground" />
      </label>

      <FilterChip
        label={filters.typeIds.length > 0 ? summary('Tipo', labelsOf(productTypes, filters.typeIds)) : 'Tipo'}
        active={filters.typeIds.length > 0}
        onClear={() => onChange({ typeIds: [] })}
        clearLabel="Quitar filtro Tipo"
        open={openMenu === 'type'}
        onOpenChange={toggle('type')}
      >
        <CheckList values={optionIds(productTypes)} selected={filters.typeIds} labelOf={(id) => labelsOf(productTypes, [id])[0]} onToggle={(typeIds) => onChange({ typeIds })} />
      </FilterChip>

      <FilterChip
        label={filters.categoryIds.length > 0 ? summary('Categoría', labelsOf(categories, filters.categoryIds)) : 'Categoría'}
        active={filters.categoryIds.length > 0}
        onClear={() => onChange({ categoryIds: [] })}
        clearLabel="Quitar filtro Categoría"
        open={openMenu === 'category'}
        onOpenChange={toggle('category')}
      >
        <CheckList values={optionIds(categories)} selected={filters.categoryIds} labelOf={(id) => labelsOf(categories, [id])[0]} onToggle={(categoryIds) => onChange({ categoryIds })} />
      </FilterChip>

      <FilterChip
        label={filters.status.length > 0 ? summary('Estado', filters.status.map((status) => productStatusPresentation(status).label)) : 'Estado'}
        active={filters.status.length > 0}
        onClear={() => onChange({ status: [] })}
        clearLabel="Quitar filtro Estado"
        open={openMenu === 'status'}
        onOpenChange={toggle('status')}
      >
        <CheckList values={PRODUCT_STATUSES} selected={filters.status} labelOf={(status) => productStatusPresentation(status).label} onToggle={(status) => onChange({ status })} />
      </FilterChip>

      <span className={`${CHIP} ${filters.lowStock ? CHIP_ON : CHIP_OFF}`}>
        <button type="button" aria-pressed={filters.lowStock} onClick={() => onChange({ lowStock: !filters.lowStock })} className={`${CHIP_BUTTON} pl-3.5 ${filters.lowStock ? 'pr-2' : 'pr-3.5'}`}>
          {filters.lowStock ? 'Stock: poco o agotado' : 'Stock'}
          {filters.lowStock ? <span aria-hidden="true" className={`${CLEAR_BOX} mr-0`}>{CROSS}</span> : CHEVRON}
        </button>
      </span>

      {hasActiveProductFilters(filters) && (
        <button type="button" onClick={onClear} className="h-11 cursor-pointer border-0 bg-transparent px-2 font-sans text-sm font-bold text-foreground underline underline-offset-4">Limpiar filtros</button>
      )}
    </div>
  );
}
