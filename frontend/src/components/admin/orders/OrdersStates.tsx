import { EmptySeal } from '../../ui/empty-seal';

const SKELETON_WIDTHS = ['55%', '40%', '62%', '48%', '58%', '44%'];

/** Loading skeleton of the A-Pedidos canvas: a header bar and six placeholder rows. */
export function OrdersSkeleton() {
  return (
    <div aria-busy="true" aria-label="Cargando pedidos" className="flex flex-col">
      <div className="h-11 rounded-t-md bg-secondary" />
      {SKELETON_WIDTHS.map((width, index) => (
        <div key={index} className="flex h-[60px] items-center gap-[18px] border-t border-border px-4 motion-safe:animate-pulse">
          <span className="h-3 w-[120px] rounded-[4px] bg-border" />
          <span className="h-[11px] flex-1 rounded-[4px] bg-secondary" style={{ maxWidth: width }} />
          <span className="h-6 w-[90px] rounded-sm bg-secondary" />
        </div>
      ))}
    </div>
  );
}

const ACTION_BUTTON = 'inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground';

/** No order exists yet. The canvas "Revisar productos" link waits for the catalog screens. */
export function OrdersEmpty() {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <EmptySeal top="Todavía" middle="Sin" bottom="pedidos" />
      <h2 className="m-0 text-[22px] font-extrabold">Aún no llega el primer pedido</h2>
      <p className="m-0 max-w-[420px] text-[15px] leading-6 text-muted-foreground">Cuando alguien compre en la tienda aparecerá aquí. Revisa que tus productos estén publicados y con stock.</p>
    </div>
  );
}

/** Filters or search matched nothing. */
export function OrdersNoMatches({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
      <h2 className="m-0 text-[22px] font-extrabold">No hay pedidos con estos filtros</h2>
      <p className="m-0 max-w-[420px] text-[15px] leading-6 text-muted-foreground">Prueba con otra búsqueda o quita algún filtro.</p>
      <button type="button" onClick={onClear} className={ACTION_BUTTON}>Limpiar filtros</button>
    </div>
  );
}

export function OrdersError({ onRetry }: { onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 px-6 py-14 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full border-2 border-destructive text-destructive">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 16.5v.2" /></svg>
      </span>
      <h2 className="m-0 text-[22px] font-extrabold">No pudimos cargar los pedidos</h2>
      <p className="m-0 text-[15px] text-muted-foreground">Puede ser la conexión. Tus pedidos están a salvo.</p>
      <button type="button" onClick={onRetry} className={ACTION_BUTTON}>Reintentar</button>
    </div>
  );
}
