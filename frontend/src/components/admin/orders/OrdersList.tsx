import { formatOrderDateTime, formatOrderDestination } from '../../../lib/admin/order-format';
import { paymentMethodLabel } from '../../../lib/admin/order-status';
import { orderDetailHref } from '../../../lib/admin/navigation';
import type { AdminOrderRow } from '../../../lib/admin/orders';
import type { OrderSort } from '../../../lib/admin/orders-query';
import { formatMoneyCop } from '../../../lib/shared/formatters';
import { OrderStatusBadge, PaymentStatusBadge } from './OrderBadges';

// Columns per width from the A-Pedidos artboards: 1440 shows every column; 1024 hides
// Destino and Método (destination moves under the customer); 768 also hides Fecha and
// Pago. Visibility is CSS only, so every width renders the same markup.
const FROM_1024 = 'hidden min-[1024px]:table-cell';
const FROM_1440 = 'hidden min-[1440px]:table-cell';
const TH = 'px-3 text-left';

export function OrdersTable({ rows, sort, onToggleSort }: { rows: AdminOrderRow[]; sort: OrderSort; onToggleSort: () => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[15px]">
        <thead>
          <tr className="bg-secondary font-condensed text-sm uppercase tracking-[0.08em]">
            <th className={`h-11 pl-4 pr-3 text-left`}>Pedido</th>
            <th aria-sort={sort === 'placed_at' ? 'ascending' : 'descending'} className={`${TH} ${FROM_1024}`}>
              <button type="button" onClick={onToggleSort} className="cursor-pointer border-0 bg-transparent p-0 font-condensed text-sm uppercase tracking-[0.08em] text-foreground">Fecha {sort === 'placed_at' ? '↑' : '↓'}</button>
            </th>
            <th className={TH}>Cliente</th>
            <th className={`${TH} ${FROM_1440}`}>Destino</th>
            <th className="px-3 text-right">Total</th>
            <th className={TH}>Pedido</th>
            <th className={`${TH} ${FROM_1024}`}>Pago</th>
            <th className={`${TH} pr-4 ${FROM_1440}`}>Método</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const destination = formatOrderDestination(row.municipality_name, row.department_name);
            return (
              <tr key={row.id} className="h-[60px] border-t border-border bg-card">
                <td className="pl-4 pr-3"><a href={orderDetailHref(row.id)} className="whitespace-nowrap font-extrabold text-foreground underline-offset-4 hover:text-accent">{row.order_number}</a></td>
                <td className={`px-3 whitespace-nowrap text-muted-foreground ${FROM_1024}`}>{formatOrderDateTime(row.placed_at)}</td>
                <td className="px-3">
                  <span className="flex flex-col"><span className="font-semibold">{row.customer_name}</span><span className="text-[13px] text-muted-foreground min-[1440px]:hidden">{destination}</span></span>
                </td>
                <td className={`px-3 text-muted-foreground ${FROM_1440}`}>{destination}</td>
                <td className="px-3 text-right font-bold">{formatMoneyCop(row.total_amount)}</td>
                <td className="px-3"><OrderStatusBadge status={row.status} size="md" /></td>
                <td className={`px-3 ${FROM_1024}`}><PaymentStatusBadge status={row.payment?.status ?? null} size="md" /></td>
                <td className={`pl-3 pr-4 text-muted-foreground ${FROM_1440}`}>{paymentMethodLabel(row.payment?.payment_method_type)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** 390 px: one card per order (A-Pedidos-390). */
export function OrdersCards({ rows }: { rows: AdminOrderRow[] }) {
  return (
    <>
      {rows.map((row) => (
        <a key={row.id} href={orderDetailHref(row.id)} className="flex flex-col gap-1.5 rounded-md border border-border bg-card px-3.5 py-3 text-foreground no-underline">
          <span className="flex items-center justify-between gap-2"><span className="text-[15px] font-extrabold">{row.order_number}</span><span className="text-[15px] font-extrabold">{formatMoneyCop(row.total_amount)}</span></span>
          <span className="text-[13px] text-muted-foreground">{row.customer_name} · {formatOrderDestination(row.municipality_name, row.department_name)}</span>
          <span className="flex items-center justify-between gap-2"><span className="text-xs text-muted-foreground">{formatOrderDateTime(row.placed_at)} · {paymentMethodLabel(row.payment?.payment_method_type)}</span><OrderStatusBadge status={row.status} /></span>
        </a>
      ))}
    </>
  );
}
