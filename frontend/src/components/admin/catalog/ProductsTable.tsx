import type { AdminProductRow } from '../../../lib/admin/catalog';
import { productDetailHref } from '../../../lib/admin/navigation';
import { productPriceLabel, productStatusPresentation, productTypeColor, stockBadge } from '../../../lib/admin/product-format';
import { nextSort, type ProductSort, type SortColumn } from '../../../lib/admin/products-query';
import { StatusBadge } from '../../ui/status-badge';

// Columns per width from the A-Productos artboards: 1440 shows every column; 1024
// hides Categoría and Variantes; 768 also hides Tipo. Visibility is CSS only, so every
// width renders the same markup.
const FROM_1024 = 'hidden min-[1024px]:table-cell';
const FROM_1440 = 'hidden min-[1440px]:table-cell';
const TH = 'px-3 text-left font-bold';

function SortHeader({ column, label, sort, onSort, align, first }: { column: SortColumn; label: string; sort: ProductSort; onSort: (sort: ProductSort) => void; align: 'left' | 'right'; first?: boolean }) {
  const active = sort === column || sort === `-${column}`;
  const arrow = active ? (sort === column ? '↑' : '↓') : '↕';
  return (
    <th aria-sort={active ? (sort === column ? 'ascending' : 'descending') : 'none'} className={`${first ? 'pl-4 pr-3' : 'px-3'} ${align === 'right' ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => onSort(nextSort(sort, column))} className="inline-flex h-11 cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 font-condensed text-sm font-bold uppercase tracking-[0.08em] text-foreground">
        {label} <span aria-hidden="true">{arrow}</span>
      </button>
    </th>
  );
}

function ProductThumb({ url }: { url: string | null }) {
  return (
    <span className="relative size-11 flex-none overflow-hidden rounded-sm bg-secondary">
      {url && <img src={url} alt="" loading="lazy" className="absolute left-1/2 top-0.5 h-[52px] -translate-x-1/2" />}
    </span>
  );
}

function StockBadge({ tone, label }: { tone: string; label: string }) {
  const colors = tone === 'problem' ? 'bg-destructive text-card' : 'bg-brand-yellow text-foreground';
  return <span className={`inline-flex h-[22px] items-center whitespace-nowrap rounded-sm px-2 text-xs font-bold ${colors}`}>{label}</span>;
}

export function ProductsTable({ rows, sort, onSort }: { rows: AdminProductRow[]; sort: ProductSort; onSort: (sort: ProductSort) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="bg-secondary font-condensed text-sm uppercase tracking-[0.08em]">
            <SortHeader column="title" label="Producto" sort={sort} onSort={onSort} align="left" first />
            <th className={`${TH} ${FROM_1024}`}>Tipo</th>
            <th className={`${TH} ${FROM_1440}`}>Categoría</th>
            <th className={TH}>Estado</th>
            <th className={`px-3 text-right font-bold ${FROM_1440}`}>Variantes</th>
            <SortHeader column="price_amount" label="Precio" sort={sort} onSort={onSort} align="right" />
            <SortHeader column="stock" label="Stock" sort={sort} onSort={onSort} align="right" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const status = productStatusPresentation(row.status);
            const stock = stockBadge(row);
            return (
              <tr key={row.id} className="h-16 border-t border-border bg-card">
                <td className="pl-4 pr-3">
                  <span className="flex items-center gap-3">
                    <ProductThumb url={row.image_url} />
                    <span className="flex min-w-0 flex-col">
                      <a href={productDetailHref(row.id)} className="text-[15px] font-bold text-foreground underline decoration-dashed underline-offset-4 hover:text-accent">{row.title}</a>
                      {row.origin?.department && <span className="text-[13px] text-muted-foreground">{row.origin.department}</span>}
                    </span>
                  </span>
                </td>
                <td className={`px-3 ${FROM_1024}`}>
                  <span className={`inline-flex items-center gap-1.5 text-sm font-bold ${productTypeColor(row.product_type.slug)}`}>
                    <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                    {row.product_type.name}
                  </span>
                </td>
                <td className={`px-3 text-muted-foreground ${FROM_1440}`}>{row.categories.map((category) => category.name).join(', ')}</td>
                <td className="px-3"><StatusBadge tone={status.tone} size="md">{status.label}</StatusBadge></td>
                <td className={`px-3 text-right ${FROM_1440}`}>{row.variant_count}</td>
                <td className="whitespace-nowrap px-3 text-right font-semibold">{productPriceLabel(row.min_price_amount, row.max_price_amount)}</td>
                <td className="pl-3 pr-4 text-right">
                  <span className="inline-flex flex-col items-end gap-[3px]">
                    <span className="font-bold">{row.available_quantity}</span>
                    {stock && <StockBadge tone={stock.tone} label={stock.label} />}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
