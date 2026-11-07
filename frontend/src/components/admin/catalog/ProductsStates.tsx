import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { EmptySeal } from '../../ui/empty-seal';

const SKELETON_WIDTHS = ['62%', '48%', '70%', '55%', '66%', '44%'];

/** Loading skeleton of the A-Productos canvas: a header bar and six placeholder rows. */
export function ProductsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando productos" className="flex flex-col">
      <div className="h-11 rounded-t-md bg-secondary" />
      {SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="flex h-16 items-center gap-4 border-t border-border px-4 motion-safe:animate-pulse">
          <span className="size-11 rounded-sm bg-secondary" />
          <span className="flex flex-1 flex-col gap-2">
            <span className="h-[11px] rounded-[4px] bg-border" style={{ width }} />
            <span className="h-[9px] w-[30%] rounded-[4px] bg-secondary" />
          </span>
          <span className="h-6 w-[90px] rounded-sm bg-secondary" />
          <span className="h-[11px] w-[110px] rounded-[4px] bg-border" />
        </div>
      ))}
    </div>
  );
}

const PRIMARY_LINK = 'inline-flex h-11 items-center rounded-sm bg-accent px-4 text-[15px] font-bold text-white no-underline';

/** The catalog has no product yet. */
export function ProductsEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <EmptySeal top="Todavía" middle="Nada" bottom="en el catálogo" />
      <h2 className="m-0 text-[22px] font-extrabold">Aún no hay productos</h2>
      <p className="m-0 max-w-[420px] text-[15px] leading-6 text-muted-foreground">Crea el primero con su tipo (café o cacao), sus variantes y sus fotos. Se guarda como borrador hasta que lo publiques.</p>
      <a href={ADMIN_ROUTES.product} className={PRIMARY_LINK}>Nuevo producto</a>
    </div>
  );
}

/** Filters or search matched nothing. */
export function ProductsNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <h2 className="m-0 text-[22px] font-extrabold">Ningún producto coincide</h2>
      <p className="m-0 max-w-[420px] text-[15px] leading-6 text-muted-foreground">Prueba con otra búsqueda o quita algún filtro para ver más.</p>
      <button type="button" onClick={onClear} className="h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-4 font-sans text-[15px] font-bold text-foreground">Limpiar filtros</button>
    </div>
  );
}

export function ProductsError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full border-2 border-destructive text-destructive">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 16.5v.2" /></svg>
      </span>
      <h2 className="m-0 text-[22px] font-extrabold">No pudimos cargar los productos</h2>
      <p className="m-0 max-w-[420px] text-[15px] leading-6 text-muted-foreground">Puede ser la conexión. No se perdió nada de tu catálogo.</p>
      <button type="button" onClick={onRetry} className="inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
    </div>
  );
}
