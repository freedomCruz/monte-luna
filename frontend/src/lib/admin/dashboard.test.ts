import { describe, expect, it } from 'vitest';
import { mockOrderMetrics, mockStaffOrderMetrics, mockTodayMetrics } from '../../mocks/admin-orders';
import { formatRangeButton,
  attentionItems,
  bucketLabel,
  chartScale,
  comparisonLabel,
  formatDelta,
  formatLongDate,
  labelStep,
  latestOrderDay,
  periodTitle,
  seriesSummary,
  todayInBogota,
} from './dashboard';

describe('Inicio metrics presentation (F4: S2)', () => {
  it.each([
    [18.4, '▲ +18 %', 'up'],
    [-6.6, '▼ −7 %', 'down'],
    [0, '0 %', 'flat'],
    [0.2, '0 %', 'flat'],
    [null, '—', 'none'],
  ] as const)('delta %s reads %s (%s)', (delta, text, tone) => {
    expect(formatDelta(delta)).toEqual({ text, tone });
  });

  it('names the comparison and the chart per period', () => {
    expect(comparisonLabel(mockTodayMetrics)).toBe('vs. ayer');
    expect(comparisonLabel({ ...mockOrderMetrics, period: 'last_7_days' })).toBe('vs. 7 días anteriores');
    expect(comparisonLabel(mockOrderMetrics)).toBe('vs. 30 días anteriores');
    expect(periodTitle(mockTodayMetrics)).toBe('Ventas por hora · hoy');
    expect(periodTitle({ ...mockOrderMetrics, period: 'last_7_days' })).toBe('Ventas por día · últimos 7 días');
    expect(periodTitle(mockOrderMetrics)).toBe('Ventas por día · últimos 30 días');
  });

  it('describes a custom range inside one month and across months', () => {
    const range = { ...mockOrderMetrics, period: 'range' as const, from_at: '2026-10-01T05:00:00Z', to_at: '2026-10-20T05:00:00Z' };
    expect(comparisonLabel(range)).toBe('vs. 19 días anteriores');
    expect(periodTitle(range)).toBe('Ventas por día · 1 al 19 de octubre');
    const across = { ...range, from_at: '2026-09-28T05:00:00Z', to_at: '2026-10-06T05:00:00Z' };
    expect(periodTitle(across)).toBe('Ventas por día · 28 de septiembre al 5 de octubre');
  });

  it('labels buckets in the store time zone', () => {
    expect(bucketLabel(mockTodayMetrics.series[0], 'hour')).toBe('8 h');
    expect(bucketLabel(mockOrderMetrics.series[0], 'day')).toBe('21 sep');
    expect(bucketLabel(mockOrderMetrics.series.at(-1)!, 'day')).toBe('20 oct');
  });

  it('spaces axis labels by the number of buckets', () => {
    expect([3, 7, 8, 19, 30].map(labelStep)).toEqual([1, 1, 1, 3, 5]);
  });

  it('rounds the chart top up to a readable value', () => {
    expect(chartScale(28_400_000)).toBe(30_000_000);
    expect(chartScale(2_200_000)).toBe(2_500_000);
    expect(chartScale(0)).toBe(10_000_000);
  });

  it('summarises the chart for assistive technology', () => {
    expect(seriesSummary(mockOrderMetrics)).toBe('Ventas por día · últimos 30 días. Ventas entre $118.000 y $284.000 por día. Usa «Ver tabla» para leer cada valor.');
    expect(seriesSummary(mockTodayMetrics)).toContain('por hora');
  });

  it('formats the long date and today in Bogotá', () => {
    expect(formatLongDate('2026-10-20T15:00:00Z')).toBe('Martes 20 de octubre de 2026');
    expect(todayInBogota(new Date('2026-10-21T02:00:00Z'))).toBe('2026-10-20');
  });

  it('shows the order day the way the mobile canvas does', () => {
    const now = new Date('2026-10-20T15:00:00Z');
    expect(latestOrderDay('2026-10-20T14:12:00Z', now)).toBe('hoy 9:12');
    expect(latestOrderDay('2026-10-19T23:30:00Z', now)).toBe('ayer 6:30');
    expect(latestOrderDay('2026-10-18T16:20:00Z', now)).toBe('18 oct');
  });
});

describe('Requiere atención (F4: S2)', () => {
  it('lists the dispatch alert for everyone and the manual refund only for owners', () => {
    expect(attentionItems(mockOrderMetrics.attention).map((item) => [item.key, item.count])).toEqual([['dispatch', 6], ['refund', 1]]);
    expect(attentionItems(mockStaffOrderMetrics.attention).map((item) => item.key)).toEqual(['dispatch']);
  });

  it('links the dispatch alert to the pending dispatch view and says how long it has waited', () => {
    const [dispatch, refund] = attentionItems(mockOrderMetrics.attention);
    expect(dispatch.title).toBe('Pedidos pagados por despachar');
    expect(dispatch.href).toBe('/admin/pedidos/?pending_dispatch=true');
    expect(dispatch.detail).toBe('El más antiguo espera desde el 17 oct.');
    expect(refund.title).toBe('Reembolso manual pendiente');
    expect(refund.href).toBeNull();
  });

  it('drops alerts with nothing pending', () => {
    expect(attentionItems({ role: 'owner', pending_dispatch_count: 0, oldest_pending_dispatch_paid_at: null, manual_refund_count: 0 })).toEqual([]);
    expect(attentionItems({ role: 'owner', pending_dispatch_count: 2, oldest_pending_dispatch_paid_at: null, manual_refund_count: 0 })[0].detail).toBeNull();
  });
});

describe('formatRangeButton (F4: S2)', () => {
  it('formats range button label matching canvas ("1 oct – 19 oct 2026")', () => {
    expect(formatRangeButton('2026-10-01', '2026-10-19')).toBe('1 oct – 19 oct 2026');
    expect(formatRangeButton('2025-12-28', '2026-01-05')).toBe('28 dic 2025 – 5 ene 2026');
  });
});
