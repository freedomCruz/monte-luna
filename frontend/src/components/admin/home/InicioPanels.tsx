import { latestOrderDay, type AttentionItem } from '../../../lib/admin/dashboard';
import { formatOrderDateTime, formatOrderDestination } from '../../../lib/admin/order-format';
import { orderDetailHref } from '../../../lib/admin/navigation';
import { paymentMethodLabel } from '../../../lib/admin/order-status';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import type { AdminOrderRow } from '../../../lib/admin/orders';
import { formatMoneyCop } from '../../../lib/shared/formatters';
import { OrderStatusBadge } from '../orders/OrderBadges';
import { OrdersEmpty } from '../orders/OrdersStates';

const CARD = 'rounded-md border border-border bg-card';
const CHEVRON = <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="flex-none"><path d="M9 6l6 6-6 6" /></svg>;

function Count({ children, size = 'md' }: { children: string | number; size?: 'md' | 'sm' }) {
  return <span className={`inline-flex flex-none items-center justify-center rounded-sm bg-brand-yellow font-extrabold text-foreground ${size === 'md' ? 'h-10 min-w-10 px-2 text-[17px]' : 'h-9 min-w-9 px-1.5 text-[15px]'}`}>{children}</span>;
}

/** "Requiere atención" card (≥ 391 px): every alert is a link when its screen exists. */
export function AttentionCard({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="h-atencion" className={`${CARD} flex min-w-0 flex-[1_1_340px] flex-col gap-3 p-5`}>
      <div className="flex items-center justify-between gap-2.5">
        <h2 id="h-atencion" className="m-0 text-[22px] font-extrabold">Requiere atención</h2>
        {items.length > 0 && <span className="rounded-sm bg-brand-yellow px-2.5 py-[3px] text-[13px] font-extrabold">{items.length}</span>}
      </div>
      {items.length === 0 ? <p className="m-0 text-[15px] text-muted-foreground">Nada por atender ahora.</p> : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {items.map((item) => {
            const body = (
              <>
                <Count>{item.count}</Count>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-[15px] font-extrabold leading-tight">{item.title}</span>
                  {item.detail && <span className="text-[13px] leading-[1.35] text-muted-foreground">{item.detail}</span>}
                </span>
                {item.href && CHEVRON}
              </>
            );
            const box = 'flex min-h-14 items-center gap-3 rounded-md bg-background px-2.5 py-2 text-foreground no-underline';
            return <li key={item.key}>{item.href ? <a href={item.href} className={box}>{body}</a> : <div className={box}>{body}</div>}</li>;
          })}
        </ul>
      )}
    </section>
  );
}

/** Alerts at 390 px: only the dispatch alert has a mobile screen; the rest says to use a larger one. */
export function AttentionCompact({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="h-atencion-m" className="flex flex-col gap-2">
      <h2 id="h-atencion-m" className="m-0 text-lg font-extrabold">Requiere atención · {items.length}</h2>
      {items.length === 0 && <p className="m-0 text-sm text-muted-foreground">Nada por atender ahora.</p>}
      {items.map((item) => {
        const mobileLink = item.key === 'dispatch' ? item.href : null;
        return (
          <div key={item.key} className="flex min-h-14 items-center gap-2.5 rounded-md border border-border bg-card px-3 py-2">
            <Count size="sm">{item.count}</Count>
            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="text-sm font-extrabold leading-tight">{item.title}</span>
              {mobileLink ? (item.detail && <span className="text-xs leading-[1.3] text-muted-foreground">{item.detail}</span>) : <span className="text-xs font-bold leading-[1.3] text-muted-foreground">Revísalo desde un computador o una tablet</span>}
            </span>
            {mobileLink && <a href={mobileLink} aria-label={`Ver: ${item.title}`} className="inline-flex size-11 flex-none items-center justify-center rounded-sm bg-secondary text-foreground">{CHEVRON}</a>}
          </div>
        );
      })}
    </section>
  );
}

/** "Últimos pedidos" table: Fecha from 1024 px; Destino and Pago at 1440 px (A-Inicio). */
export function LatestOrdersCard({ rows }: { rows: AdminOrderRow[] }) {
  const FROM_1024 = 'hidden min-[1024px]:table-cell';
  const FROM_1440 = 'hidden min-[1440px]:table-cell';
  return (
    <section aria-labelledby="h-ultimos" className={`${CARD} flex flex-col`}>
      <div className="flex items-center justify-between gap-2.5 px-5 py-4">
        <h2 id="h-ultimos" className="m-0 text-[22px] font-extrabold">Últimos pedidos</h2>
        <a href={ADMIN_ROUTES.orders} className="inline-flex min-h-11 items-center text-[15px] font-bold underline-offset-4">Ver todos los pedidos</a>
      </div>
      {rows.length === 0 ? <OrdersEmpty /> : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[15px]">
            <thead>
              <tr className="bg-secondary text-left font-condensed text-sm uppercase tracking-[0.08em]">
                <th className="h-11 px-5">Pedido</th>
                <th className={`px-3 ${FROM_1024}`}>Fecha</th>
                <th className="px-3">Cliente</th>
                <th className={`px-3 ${FROM_1440}`}>Destino</th>
                <th className="px-3 text-right">Total</th>
                <th className="px-3">Estado</th>
                <th className={`pl-3 pr-5 ${FROM_1440}`}>Pago</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="h-14 border-t border-border">
                  <td className="px-5"><a href={orderDetailHref(row.id)} className="font-extrabold underline-offset-4">{row.order_number}</a></td>
                  <td className={`whitespace-nowrap px-3 text-muted-foreground ${FROM_1024}`}>{formatOrderDateTime(row.placed_at)}</td>
                  <td className="px-3 font-semibold">{row.customer_name}</td>
                  <td className={`px-3 text-muted-foreground ${FROM_1440}`}>{formatOrderDestination(row.municipality_name, row.department_name)}</td>
                  <td className="px-3 text-right font-bold">{formatMoneyCop(row.total_amount)}</td>
                  <td className="px-3"><OrderStatusBadge status={row.status} size="md" /></td>
                  <td className={`pl-3 pr-5 text-muted-foreground ${FROM_1440}`}>{paymentMethodLabel(row.payment?.payment_method_type)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function LatestOrdersCompact({ rows, now }: { rows: AdminOrderRow[]; now: Date }) {
  return (
    <section aria-labelledby="h-ult-m" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h2 id="h-ult-m" className="m-0 text-lg font-extrabold">Últimos pedidos</h2>
        <a href={ADMIN_ROUTES.orders} className="inline-flex min-h-11 items-center text-sm font-bold">Ver todos</a>
      </div>
      {rows.length === 0 && <OrdersEmpty />}
      {rows.map((row) => (
        <a key={row.id} href={orderDetailHref(row.id)} className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3.5 py-3 text-foreground no-underline">
          <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-extrabold">{row.order_number}</span><span className="text-[15px] font-extrabold">{formatMoneyCop(row.total_amount)}</span></span>
          <span className="flex items-center justify-between gap-2"><span className="text-[13px] text-muted-foreground">{`${row.customer_name} · ${latestOrderDay(row.placed_at, now)}`}</span><OrderStatusBadge status={row.status} /></span>
        </a>
      ))}
    </section>
  );
}
