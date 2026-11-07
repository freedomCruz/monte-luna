import * as React from 'react';
import {
  daysSinceProduction,
  formatLotDate,
  formatMovementDateTime,
  formatQuantityDelta,
  lotStatePresentation,
  movementActor,
  movementDetail,
  movementLabel,
} from '../../../lib/admin/inventory-format';
import { listAdminInventoryMovements, listAdminVariantLots, type AdminInventoryMovement, type AdminVariantLot } from '../../../lib/admin/catalog';
import { useAppendedPages, type AppendedPages } from '../../../lib/admin/use-appended-pages';
import { StatusBadge } from '../../ui/status-badge';

// Lots and movement ledger of the selected variant (A-Inventario). Columns per width
// follow the artboards: Vence and Detalle only at 1440, Reservado from 1024. Visibility
// is CSS only, so every width renders the same markup. No row has actions: manual
// adjustments are outside Catalog v1 (L6).
const FROM_1024 = 'hidden min-[1024px]:table-cell';
const FROM_1440 = 'hidden min-[1440px]:table-cell';
const HEAD_ROW = 'bg-secondary text-left font-condensed text-[13px] uppercase tracking-[0.08em]';

function Section({ id, title, note, children }: { id: string; title: string; note: React.ReactNode; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col rounded-lg border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3.5">
        <h3 id={id} className="m-0 text-lg font-extrabold">{title}</h3>
        {note}
      </div>
      {children}
    </section>
  );
}

function SectionSkeleton({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col">
      {[0, 1, 2].map((row) => (
        <div key={row} className="flex h-14 items-center gap-4 border-t border-border px-[18px] motion-safe:animate-pulse">
          <span className="h-[11px] w-[20%] rounded-[4px] bg-border" />
          <span className="h-[11px] w-[25%] rounded-[4px] bg-secondary" />
          <span className="ml-auto h-[11px] w-[10%] rounded-[4px] bg-border" />
        </div>
      ))}
    </div>
  );
}

function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-2.5 border-t border-border px-[18px] py-5">
      <p className="m-0 text-[15px] font-bold">{message}</p>
      <button type="button" onClick={onRetry} className="inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
    </div>
  );
}

function LoadMore<T>({ pages, label }: { pages: Extract<AppendedPages<T>, { status: 'ready' }>; label: string }) {
  if (!pages.hasMore) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border px-[18px] py-2.5">
      <button type="button" disabled={pages.loadingMore} onClick={pages.loadMore} className="h-11 cursor-pointer rounded-sm border border-muted-foreground bg-card px-3.5 font-sans text-sm font-bold text-foreground disabled:cursor-not-allowed disabled:opacity-60">{label}</button>
      {pages.moreFailed && <span role="alert" className="text-sm font-bold text-destructive">No pudimos cargar más. Intenta de nuevo.</span>}
    </div>
  );
}

function LotRow({ lot, generatedAt }: { lot: AdminVariantLot; generatedAt: string }) {
  const state = lotStatePresentation(lot);
  return (
    <tr className={`h-14 border-t border-border ${lot.next_to_allocate ? 'bg-background' : 'bg-card'}`}>
      <td className="pl-[18px] pr-3">
        <span className="flex flex-col gap-0.5">
          <span className="font-extrabold">{lot.lot_code}</span>
          {lot.next_to_allocate && <span className="inline-flex h-5 items-center self-start rounded-[6px] bg-foreground px-[7px] text-[11px] font-bold text-background">Sale primero</span>}
        </span>
      </td>
      <td className="whitespace-nowrap px-2.5">
        {formatLotDate(lot.production_date)}
        <span className="block text-xs text-muted-foreground">hace {daysSinceProduction(lot.production_date, generatedAt)} días</span>
      </td>
      <td className={`whitespace-nowrap px-2.5 text-muted-foreground ${FROM_1440}`}>{formatLotDate(lot.expiration_date)}</td>
      <td className="px-2.5 text-right font-extrabold">{lot.quantity}</td>
      <td className={`px-2.5 text-right ${FROM_1024}`}>{lot.reserved_quantity}</td>
      <td className="px-2.5"><StatusBadge tone={state.tone} size="md">{state.label}</StatusBadge></td>
    </tr>
  );
}

/** Lots oldest first: the order sales draw from. */
export function LotsSection({ variantId, reload }: { variantId: string; reload: number }) {
  const lots = useAppendedPages((cursor) => listAdminVariantLots(variantId, { limit: 100, ...(cursor ? { cursor } : {}) }), variantId, reload);
  return (
    <Section
      id="h-lotes"
      title="Lotes"
      note={
        <span className="inline-flex items-center gap-1.5 text-[13px] font-bold">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v16M6 14l6 6 6-6" /></svg>
          Ordenados del más antiguo al más nuevo: así salen las ventas
        </span>
      }
    >
      {lots.status === 'loading' && <SectionSkeleton label="Cargando lotes" />}
      {lots.status === 'error' && <SectionError message="No pudimos cargar los lotes." onRetry={lots.retry} />}
      {lots.status === 'ready' && (
        <>
          {lots.items.length === 0 ? (
            <p className="m-0 border-t border-border px-[18px] py-5 text-[15px] text-muted-foreground">Esta variante todavía no tiene lotes. Registra una entrada para crear el primero.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className="h-10 pl-[18px] pr-3 font-bold">Lote</th>
                    <th className="px-2.5 font-bold">Tueste</th>
                    <th className={`px-2.5 font-bold ${FROM_1440}`}>Vence</th>
                    <th className="px-2.5 text-right font-bold">Disponible</th>
                    <th className={`px-2.5 text-right font-bold ${FROM_1024}`}>Reservado</th>
                    <th className="px-2.5 font-bold">Estado</th>
                  </tr>
                </thead>
                <tbody>{lots.items.map((lot) => <LotRow key={lot.id} lot={lot} generatedAt={lots.generatedAt} />)}</tbody>
              </table>
            </div>
          )}
          <LoadMore pages={lots} label="Ver más lotes" />
          <p className="m-0 border-t border-border px-[18px] py-3 text-[13px] text-muted-foreground">«Tueste antiguo» marca lotes tostados hace más de 30 días.</p>
        </>
      )}
    </Section>
  );
}

function MovementRow({ movement }: { movement: AdminInventoryMovement }) {
  return (
    <tr className="h-[52px] border-t border-border">
      <td className="whitespace-nowrap pl-[18px] pr-3 text-muted-foreground">{formatMovementDateTime(movement.created_at)}</td>
      <td className="px-2.5 font-bold">{movementLabel(movement.display_kind)}</td>
      <td className="px-2.5">{movement.lot_code}</td>
      <td className={`px-2.5 text-right font-extrabold ${movement.quantity_delta > 0 ? 'text-success' : ''}`}>{formatQuantityDelta(movement.quantity_delta)}</td>
      <td className={`px-2.5 text-muted-foreground ${FROM_1440}`}>{movementDetail(movement)}</td>
      <td className="pl-2.5 pr-[18px]">{movementActor(movement)}</td>
    </tr>
  );
}

/** Append-only ledger, newest first. */
export function MovementsSection({ variantId, reload }: { variantId: string; reload: number }) {
  const movements = useAppendedPages((cursor) => listAdminInventoryMovements(variantId, { limit: 25, ...(cursor ? { cursor } : {}) }), variantId, reload);
  return (
    <Section id="h-mov" title="Historial de movimientos" note={<span className="text-[13px] text-muted-foreground">No se edita ni se borra.</span>}>
      {movements.status === 'loading' && <SectionSkeleton label="Cargando movimientos" />}
      {movements.status === 'error' && <SectionError message="No pudimos cargar el historial." onRetry={movements.retry} />}
      {movements.status === 'ready' && (
        <>
          {movements.items.length === 0 ? (
            <p className="m-0 border-t border-border px-[18px] py-5 text-[15px] text-muted-foreground">Todavía no hay movimientos para esta variante.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className={HEAD_ROW}>
                    <th className="h-10 pl-[18px] pr-3 font-bold">Fecha</th>
                    <th className="px-2.5 font-bold">Movimiento</th>
                    <th className="px-2.5 font-bold">Lote</th>
                    <th className="px-2.5 text-right font-bold">Cantidad</th>
                    <th className={`px-2.5 font-bold ${FROM_1440}`}>Detalle</th>
                    <th className="pl-2.5 pr-[18px] font-bold">Quién</th>
                  </tr>
                </thead>
                <tbody>{movements.items.map((movement) => <MovementRow key={movement.id} movement={movement} />)}</tbody>
              </table>
            </div>
          )}
          <LoadMore pages={movements} label="Ver más movimientos" />
        </>
      )}
    </Section>
  );
}
