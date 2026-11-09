import { DropdownMenu } from 'radix-ui';
import type { AdminProductRow } from '../../../lib/admin/catalog';
import { productDetailHref } from '../../../lib/admin/navigation';
import { storefrontHref } from '../../../lib/admin/product-sheet';

const ITEM = 'flex min-h-10 cursor-pointer items-center rounded-sm px-2.5 text-[15px] text-foreground no-underline outline-none data-[highlighted]:bg-secondary';

/** Row "⋯" menu of Productos: only actions the contract supports (no bulk, no stock). */
export function ProductRowMenu({ row, onOpen }: { row: AdminProductRow; onOpen: (row: AdminProductRow) => void }) {
  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={`Acciones de ${row.title}`} className="inline-flex size-11 cursor-pointer items-center justify-center rounded-sm border-0 bg-transparent text-foreground hover:bg-secondary">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></svg>
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className="z-50 w-56 rounded-md border border-border bg-popover p-1.5 shadow-[0_10px_28px_rgba(27,21,16,0.16)]">
          <DropdownMenu.Item onSelect={() => onOpen(row)} className={ITEM}>Vista rápida</DropdownMenu.Item>
          <DropdownMenu.Item asChild><a href={productDetailHref(row.id)} className={ITEM}>Editar producto</a></DropdownMenu.Item>
          {row.status === 'published' && <DropdownMenu.Item asChild><a href={storefrontHref(row.slug)} className={ITEM}>Ver en la tienda</a></DropdownMenu.Item>}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
