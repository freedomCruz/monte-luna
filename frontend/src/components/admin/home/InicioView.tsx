function InicioError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-2.5 rounded-md border border-border bg-card px-6 py-14 text-center">
      <span className="inline-flex size-14 items-center justify-center rounded-full border-2 border-destructive text-destructive">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 16.5v.2" /></svg>
      </span>
      <h2 className="m-0 text-[22px] font-extrabold">{message}</h2>
      <p className="m-0 text-[15px] text-muted-foreground">Puede ser la conexión. Intenta de nuevo en unos momentos.</p>
      <button type="button" onClick={onRetry} className="inline-flex h-11 cursor-pointer items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Reintentar</button>
    </div>
  );
}
import * as React from 'react';
import * as Popover from '@radix-ui/react-popover';
import {
  attentionItems,
  comparisonLabel,
  formatDelta,
  formatLongDate,
  todayInBogota,
  type DeltaTone,
} from '../../../lib/admin/dashboard';
import {
  getAdminOrderMetrics,
  type AdminOrderMetrics,
  type AdminOrderMetricsQuery,
} from '../../../lib/admin/orders';
import { formatRangeButton } from '../../../lib/admin/dashboard';
import { useIsMobile } from '../../../lib/admin/use-is-mobile';
import { formatMoneyCop } from '../../../lib/shared/formatters';
import { DateRangeFields } from '../shared/DateRangeFields';
import { useAdminSession } from '../shell/AdminShell';

import {
  AttentionCard,
  AttentionCompact,
  LatestOrdersCard,
  LatestOrdersCompact,
} from './InicioPanels';
import { SalesChartCard, SalesChartCompact } from './SalesChart';

type PeriodKey = 'today' | 'last_7_days' | 'last_30_days' | 'range';

const DELTA_STYLES: Record<DeltaTone, string> = {
  up: 'text-brand-green font-bold',
  down: 'text-destructive font-bold',
  flat: 'text-muted-foreground font-semibold',
  none: 'text-muted-foreground font-semibold',
};

function KpiCard({
  title,
  value,
  delta,
  comparison,
  isMobile,
}: {
  title: string;
  value: string;
  delta: { text: string; tone: DeltaTone };
  comparison: string;
  isMobile: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-md border border-border bg-card p-4 min-[768px]:p-4">
      <span className="text-[13px] font-semibold text-muted-foreground min-[768px]:text-sm">
        {title}
      </span>
      <span className="text-[26px] font-extrabold leading-tight text-foreground min-[768px]:text-[28px]">
        {value}
      </span>
      <span className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className={DELTA_STYLES[delta.tone]}>{delta.text}</span>
        {!isMobile && (
          <span className="text-muted-foreground">{comparison}</span>
        )}
      </span>
    </div>
  );
}

function PeriodControls({
  currentKey,
  customRange,
  maxDate,
  onSelectPeriod,
  onApplyRange,
}: {
  currentKey: PeriodKey;
  customRange: { from: string; to: string } | null;
  maxDate: string;
  onSelectPeriod: (key: Exclude<PeriodKey, 'range'>) => void;
  onApplyRange: (from: string, to: string) => void;
}) {
  const [rangeOpen, setRangeOpen] = React.useState(false);
  const isMobile = useIsMobile();

  const rangeLabel = React.useMemo(() => {
    if (isMobile) return 'Rango';
    if (!customRange) return 'Rango';
    return formatRangeButton(customRange.from, customRange.to);
  }, [customRange, isMobile]);

  const buttonStyle = (active: boolean) =>
    `min-h-11 cursor-pointer rounded-sm border px-3 text-sm font-bold transition-colors ${
      active
        ? 'border-primary bg-primary text-primary-foreground'
        : 'border-muted-foreground bg-card text-foreground hover:bg-secondary'
    }`;

  return (
    <div
      role="group"
      aria-label="Periodo"
      className="flex flex-wrap items-center gap-2"
    >
      <button
        type="button"
        aria-pressed={currentKey === 'today'}
        onClick={() => onSelectPeriod('today')}
        className={buttonStyle(currentKey === 'today')}
      >
        Hoy
      </button>
      <button
        type="button"
        aria-pressed={currentKey === 'last_7_days'}
        onClick={() => onSelectPeriod('last_7_days')}
        className={buttonStyle(currentKey === 'last_7_days')}
      >
        7 días
      </button>
      <button
        type="button"
        aria-pressed={currentKey === 'last_30_days'}
        onClick={() => onSelectPeriod('last_30_days')}
        className={buttonStyle(currentKey === 'last_30_days')}
      >
        30 días
      </button>

      <Popover.Root open={rangeOpen} onOpenChange={setRangeOpen}>
        <Popover.Trigger asChild>
          <button
            type="button"
            aria-pressed={currentKey === 'range'}
            className={buttonStyle(currentKey === 'range')}
          >
            {rangeLabel}
          </button>
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-50 w-72 rounded-md border border-border bg-card p-2 shadow-md outline-none"
          >
            <DateRangeFields
              initialFrom={customRange?.from}
              initialTo={customRange?.to}
              max={maxDate}
              onApply={(from, to) => {
                onApplyRange(from, to);
                setRangeOpen(false);
              }}
            />
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

function InicioSkeleton() {
  return (
    <div
      aria-label="Cargando el resumen"
      aria-busy="true"
      className="flex flex-col gap-6"
    >
      <div className="grid grid-cols-2 gap-3 min-[768px]:grid-cols-2 min-[1024px]:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-28 animate-pulse rounded-md border border-border bg-card"
          />
        ))}
      </div>
      <div className="flex flex-col gap-4 min-[1024px]:flex-row">
        <div className="h-[340px] flex-[2_1_560px] animate-pulse rounded-md border border-border bg-card" />
        <div className="h-[340px] flex-[1_1_340px] animate-pulse rounded-md border border-border bg-card" />
      </div>
      <div className="h-64 animate-pulse rounded-md border border-border bg-card" />
    </div>
  );
}

export function InicioView() {
  const { user } = useAdminSession();
  const isMobile = useIsMobile();
  const [periodKey, setPeriodKey] = React.useState<PeriodKey>('last_30_days');
  const [customRange, setCustomRange] = React.useState<{
    from: string;
    to: string;
  } | null>(null);

  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [metrics, setMetrics] = React.useState<AdminOrderMetrics | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const now = React.useMemo(() => new Date(), [reloadToken, metrics]);
  const maxDate = React.useMemo(() => todayInBogota(now), [now]);

  const firstName = React.useMemo(() => {
    if (!user?.display_name) return 'Administrador';
    return user.display_name.trim().split(/\s+/)[0];
  }, [user]);

  const query: AdminOrderMetricsQuery = React.useMemo(() => {
    if (periodKey === 'range' && customRange) {
      return {
        period: 'range',
        from_date: customRange.from,
        to_date: customRange.to,
      };
    }
    return {
      period: periodKey === 'range' ? 'last_30_days' : periodKey,
    };
  }, [periodKey, customRange]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getAdminOrderMetrics(query).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setMetrics(res.data);
      } else {
        setError('No pudimos cargar el resumen. Intenta de nuevo.');
      }
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [query, reloadToken]);

  const handleSelectPeriod = (key: Exclude<PeriodKey, 'range'>) => {
    setPeriodKey(key);
  };

  const handleApplyRange = (from: string, to: string) => {
    setCustomRange({ from, to });
    setPeriodKey('range');
  };

  const attention = React.useMemo(
    () => (metrics ? attentionItems(metrics.attention) : []),
    [metrics]
  );

  const comparison = metrics ? comparisonLabel(metrics) : '';

  return (
    <main className="flex flex-1 flex-col gap-6 px-4 pb-[104px] pt-5 min-[768px]:px-6 min-[768px]:pb-12 min-[1440px]:px-8">
        <header className="flex flex-col justify-between gap-4 min-[768px]:flex-row min-[768px]:items-end">
          <div className="flex flex-col gap-1">
            <h1 className="m-0 text-[26px] font-extrabold leading-tight text-foreground min-[768px]:text-[32px]">
              Hola, {firstName}
            </h1>
            <p className="m-0 text-sm text-muted-foreground min-[768px]:text-[15px]">
              {isMobile
                ? formatLongDate(now.toISOString()).replace(
                    / de \d{4}$/,
                    ''
                  )
                : `${formatLongDate(now.toISOString())} · hora de Colombia`}
            </p>
          </div>
          <PeriodControls
            currentKey={periodKey}
            customRange={customRange}
            maxDate={maxDate}
            onSelectPeriod={handleSelectPeriod}
            onApplyRange={handleApplyRange}
          />
        </header>

        {loading && <InicioSkeleton />}

        {error && !loading && (
          <InicioError
            message={error}
            onRetry={() => setReloadToken((t) => t + 1)}
          />
        )}

        {metrics && !loading && (
          <div className="flex flex-col gap-6">
            <section
              aria-label="Indicadores del periodo"
              className="grid grid-cols-2 gap-3 min-[768px]:grid-cols-2 min-[1024px]:grid-cols-4"
            >
              <KpiCard
                title="Ventas pagadas"
                value={formatMoneyCop(metrics.kpis.paid_sales_amount.value)}
                delta={formatDelta(metrics.kpis.paid_sales_amount.delta_percentage)}
                comparison={comparison}
                isMobile={isMobile}
              />
              <KpiCard
                title="Pedidos"
                value={String(metrics.kpis.orders.value)}
                delta={formatDelta(metrics.kpis.orders.delta_percentage)}
                comparison={comparison}
                isMobile={isMobile}
              />
              <KpiCard
                title="Ticket promedio"
                value={formatMoneyCop(metrics.kpis.average_order_amount.value)}
                delta={formatDelta(
                  metrics.kpis.average_order_amount.delta_percentage
                )}
                comparison={comparison}
                isMobile={isMobile}
              />
              <KpiCard
                title="Unidades vendidas"
                value={String(metrics.kpis.units_sold.value)}
                delta={formatDelta(metrics.kpis.units_sold.delta_percentage)}
                comparison={comparison}
                isMobile={isMobile}
              />
            </section>

            {isMobile ? (
              <>
                <SalesChartCompact metrics={metrics} />
                <AttentionCompact items={attention} />
                <LatestOrdersCompact rows={metrics.latest_orders} now={now} />
                <footer className="mt-2 rounded-md border border-border bg-card p-3.5 text-xs leading-relaxed text-muted-foreground">
                  En el celular el panel es de consulta. Para editar el catálogo,
                  los cupones o la configuración, usa un computador o una tablet.
                </footer>
              </>
            ) : (
              <>
                <div className="flex flex-col gap-5 min-[1024px]:flex-row">
                  <SalesChartCard metrics={metrics} />
                  <AttentionCard items={attention} />
                </div>
                <LatestOrdersCard rows={metrics.latest_orders} />
              </>
            )}
          </div>
        )}
      </main>
  );
}
