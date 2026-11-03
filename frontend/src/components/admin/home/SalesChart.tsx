import * as React from 'react';
import { bucketLabel, chartScale, labelStep, periodTitle, seriesSummary } from '../../../lib/admin/dashboard';
import type { AdminOrderMetrics } from '../../../lib/admin/orders';
import { formatMoneyCop } from '../../../lib/shared/formatters';

const GRID = 'linear-gradient(var(--border), var(--border)) 0 0 / 100% 1px no-repeat, linear-gradient(var(--border), var(--border)) 0 50% / 100% 1px no-repeat';

function useBuckets(metrics: AdminOrderMetrics) {
  return React.useMemo(() => {
    const top = chartScale(Math.max(0, ...metrics.series.flatMap((bucket) => [bucket.sales_amount, bucket.previous_sales_amount])));
    const best = metrics.series.reduce((index, bucket, i, all) => (bucket.sales_amount > all[index].sales_amount ? i : index), 0);
    return { top, best, labels: metrics.series.map((bucket) => bucketLabel(bucket, metrics.granularity)) };
  }, [metrics]);
}

const percent = (value: number, top: number) => `${((value / top) * 100).toFixed(1)}%`;

/** Sales chart and table of A-Inicio: bars for this period, a dashed line for the previous one. */
export function SalesChartCard({ metrics }: { metrics: AdminOrderMetrics }) {
  const { top, best, labels } = useBuckets(metrics);
  const [table, setTable] = React.useState(false);
  const [selected, setSelected] = React.useState<number | null>(null);
  const count = metrics.series.length;
  const active = Math.min(selected ?? best, count - 1);
  const step = labelStep(count);
  const gap = count > 20 ? '3px' : '8px';
  const left = ((active + 0.5) / count) * 100;
  const line = metrics.series.map((bucket, i) => `${((i + 0.5) * 10).toFixed(1)},${(100 - (bucket.previous_sales_amount / top) * 100).toFixed(1)}`).join(' ');

  return (
    <section aria-labelledby="h-graf" className="flex min-w-0 flex-[2_1_560px] flex-col gap-3.5 rounded-md border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="h-graf" className="m-0 text-[22px] font-extrabold">{periodTitle(metrics)}</h2>
        <div className="flex flex-wrap items-center gap-4 text-[13px] font-semibold">
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-3 rounded-[3px] bg-brand-green" />Este periodo</span>
          <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="w-[18px] border-t-2 border-dashed border-muted-foreground" />Periodo anterior</span>
          <button type="button" aria-pressed={table} onClick={() => setTable((value) => !value)} className="h-9 cursor-pointer rounded-sm border border-muted-foreground bg-card px-2.5 font-sans text-[13px] font-bold text-foreground">{table ? 'Ver gráfico' : 'Ver tabla'}</button>
        </div>
      </div>

      {table ? (
        <div className="max-h-[300px] overflow-y-auto rounded-md border border-border">
          <table className="w-full border-collapse text-sm">
            <thead><tr className="bg-secondary text-left"><th className="h-10 px-3">Fecha</th><th className="px-3 text-right">Ventas</th><th className="px-3 text-right">Periodo anterior</th></tr></thead>
            <tbody>
              {metrics.series.map((bucket, i) => (
                <tr key={bucket.from_at} className="h-10 border-t border-border">
                  <td className="px-3">{labels[i]}</td>
                  <td className="px-3 text-right font-bold">{formatMoneyCop(bucket.sales_amount)}</td>
                  <td className="px-3 text-right text-muted-foreground">{formatMoneyCop(bucket.previous_sales_amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex gap-2.5">
          <div aria-hidden="true" className="flex h-[260px] w-16 flex-none flex-col justify-between text-right text-xs text-muted-foreground"><span>{formatMoneyCop(top)}</span><span>{formatMoneyCop(top / 2)}</span><span>$0</span></div>
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div role="img" aria-label={seriesSummary(metrics)} className="relative h-[260px] border-b border-foreground" style={{ background: GRID }}>
              <div className="absolute inset-0 flex items-end" style={{ gap }}>
                {metrics.series.map((bucket, i) => (
                  <div key={bucket.from_at} data-bar onMouseEnter={() => setSelected(i)} className="flex h-full flex-1 items-end">
                    <span className={`box-border block w-full rounded-t-[4px] ${i === active ? 'border border-foreground bg-brand-yellow' : 'bg-brand-green'}`} style={{ height: percent(bucket.sales_amount, top) }} />
                  </div>
                ))}
              </div>
              <svg viewBox={`0 0 ${count * 10} 100`} preserveAspectRatio="none" aria-hidden="true" className="pointer-events-none absolute inset-0 size-full overflow-visible">
                <polyline points={line} fill="none" stroke="var(--muted-foreground)" strokeWidth="2" strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
              </svg>
              <div className="pointer-events-none absolute top-2 flex flex-col gap-0.5 whitespace-nowrap rounded-sm bg-primary px-2.5 py-2 text-[13px] text-primary-foreground" style={{ left: `${left}%`, transform: `translateX(${left > 80 ? '-100%' : left < 20 ? '0%' : '-50%'})` }}>
                <span className="font-extrabold">{labels[active]}</span>
                <span>{`Ventas ${formatMoneyCop(metrics.series[active].sales_amount)}`}</span>
                <span className="text-[#E9DDC3]">{`Anterior ${formatMoneyCop(metrics.series[active].previous_sales_amount)}`}</span>
              </div>
            </div>
            <div aria-hidden="true" className="flex text-xs text-muted-foreground" style={{ gap }}>
              {labels.map((label, i) => <span key={i} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-center">{i % step === 0 ? label : ''}</span>)}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

/** Chart card at 390 px: bars only, with the first day, the maximum and the last day below. */
export function SalesChartCompact({ metrics }: { metrics: AdminOrderMetrics }) {
  const { top, labels } = useBuckets(metrics);
  const max = Math.max(...metrics.series.map((bucket) => bucket.sales_amount));
  return (
    <section aria-labelledby="h-graf-m" className="flex flex-col gap-2.5 rounded-md border border-border bg-card p-4">
      <h2 id="h-graf-m" className="m-0 text-lg font-extrabold">{periodTitle(metrics)}</h2>
      <div role="img" aria-label={seriesSummary(metrics)} className="flex h-[120px] items-end gap-0.5 border-b border-foreground">
        {metrics.series.map((bucket) => <span key={bucket.from_at} data-bar className="block flex-1 rounded-t-[3px] bg-brand-green" style={{ height: percent(bucket.sales_amount, top) }} />)}
      </div>
      <span className="flex justify-between text-xs text-muted-foreground"><span>{labels[0]}</span><span>{`Máximo ${formatMoneyCop(max)}`}</span><span>{labels[labels.length - 1]}</span></span>
    </section>
  );
}
