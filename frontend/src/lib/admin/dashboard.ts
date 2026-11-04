import { formatOrderDateTime } from './order-format';
import type { AdminOrderMetrics } from './orders';
import { formatMoneyCop } from '../shared/formatters';

// Presentation rules for the Inicio dashboard (A-Inicio canvas). Every figure comes from
// getAdminOrderMetrics; the frontend only formats it.

const TIME_ZONE = 'America/Bogota';
const DAY_MS = 86_400_000;

type Series = AdminOrderMetrics['series'];
type Granularity = AdminOrderMetrics['granularity'];

export type DeltaTone = 'up' | 'down' | 'flat' | 'none';

/** "▲ +18 %" in green, "▼ −7 %" in red; null (no previous period) shows a dash. */
export function formatDelta(delta: number | null): { text: string; tone: DeltaTone } {
  if (delta === null) return { text: '—', tone: 'none' };
  const rounded = Math.round(Math.abs(delta));
  if (rounded === 0) return { text: '0 %', tone: 'flat' };
  return delta > 0 ? { text: `▲ +${rounded} %`, tone: 'up' } : { text: `▼ −${rounded} %`, tone: 'down' };
}

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

const PARTS = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', hourCycle: 'h23' });

function localParts(iso: string | Date) {
  const parts = Object.fromEntries(PARTS.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour) };
}

const shortMonth = (month: number) => MONTHS[month - 1].slice(0, 3);

function rangeDays(metrics: AdminOrderMetrics): number {
  return Math.round((new Date(metrics.to_at).getTime() - new Date(metrics.from_at).getTime()) / DAY_MS);
}

/** "vs. ayer", "vs. 7 días anteriores"; a custom range compares with the days before it. */
export function comparisonLabel(metrics: AdminOrderMetrics): string {
  if (metrics.period === 'today') return 'vs. ayer';
  if (metrics.period === 'last_7_days') return 'vs. 7 días anteriores';
  if (metrics.period === 'last_30_days') return 'vs. 30 días anteriores';
  return `vs. ${rangeDays(metrics)} días anteriores`;
}

/** Heading of the chart card: "Ventas por día · 1 al 19 de octubre". */
export function periodTitle(metrics: AdminOrderMetrics): string {
  if (metrics.period === 'today') return 'Ventas por hora · hoy';
  if (metrics.period === 'last_7_days') return 'Ventas por día · últimos 7 días';
  if (metrics.period === 'last_30_days') return 'Ventas por día · últimos 30 días';
  const from = localParts(metrics.from_at);
  const last = localParts(new Date(new Date(metrics.to_at).getTime() - 1));
  return from.month === last.month && from.year === last.year
    ? `Ventas por día · ${from.day} al ${last.day} de ${MONTHS[last.month - 1]}`
    : `Ventas por día · ${from.day} de ${MONTHS[from.month - 1]} al ${last.day} de ${MONTHS[last.month - 1]}`;
}

/** "8 h" for hourly buckets, "21 sep" for daily ones, in the store time zone. */
export function bucketLabel(bucket: Series[number], granularity: Granularity): string {
  const local = localParts(bucket.from_at);
  return granularity === 'hour' ? `${local.hour} h` : `${local.day} ${shortMonth(local.month)}`;
}

/** Axis labels are shown every n buckets (A-Inicio: each day for a week, every 3 or 5 above). */
export function labelStep(count: number): number {
  if (count <= 8) return 1;
  return count <= 20 ? 3 : 5;
}

/** Top of the chart axis in centavos: the maximum rounded up to half a power of ten. */
export function chartScale(maxCentavos: number): number {
  const pesos = maxCentavos / 100;
  if (pesos <= 0) return 10_000_000;
  const half = 10 ** Math.floor(Math.log10(pesos)) / 2;
  return Math.ceil(pesos / half) * half * 100;
}

/** Text alternative of the chart; the table toggle gives every value. */
export function seriesSummary(metrics: AdminOrderMetrics): string {
  const values = metrics.series.map((bucket) => bucket.sales_amount);
  const unit = metrics.granularity === 'hour' ? 'hora' : 'día';
  return `${periodTitle(metrics)}. Ventas entre ${formatMoneyCop(Math.min(...values))} y ${formatMoneyCop(Math.max(...values))} por ${unit}. Usa «Ver tabla» para leer cada valor.`;
}

/** "Martes 20 de octubre de 2026" in the store time zone. */
export function formatLongDate(iso: string): string {
  const weekday = new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: TIME_ZONE }).format(new Date(iso));
  const local = localParts(iso);
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${local.day} de ${MONTHS[local.month - 1]} de ${local.year}`;
}

/** Calendar date (YYYY-MM-DD) of today in the store time zone, the latest allowed range end. */
export function todayInBogota(now: Date): string {
  const local = localParts(now);
  return `${local.year}-${String(local.month).padStart(2, '0')}-${String(local.day).padStart(2, '0')}`;
}

/** "hoy 9:12", "ayer 6:30" or "18 oct" for the mobile list of latest orders. */
export function latestOrderDay(iso: string, now: Date): string {
  const placed = localParts(iso);
  const today = localParts(now);
  const ordinal = (parts: { year: number; month: number; day: number }) => Date.UTC(parts.year, parts.month - 1, parts.day) / DAY_MS;
  const diff = ordinal(today) - ordinal(placed);
  const time = formatOrderDateTime(iso).split(', ')[1].replace(/ ([ap])\. m\./, '');
  if (diff === 0) return `hoy ${time}`;
  if (diff === 1) return `ayer ${time}`;
  return `${placed.day} ${shortMonth(placed.month)}`;
}

export interface AttentionItem {
  key: 'dispatch' | 'refund';
  count: number;
  title: string;
  detail: string | null;
  /** Null while the destination screen does not exist (refunds live in Pagos, a later stage). */
  href: string | null;
}

/** Order alerts of "Requiere atención"; stock, roast-age and invoicing alerts wait for their stages. */
export function attentionItems(attention: AdminOrderMetrics['attention']): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (attention.pending_dispatch_count > 0) {
    const since = attention.oldest_pending_dispatch_paid_at;
    const local = since ? localParts(since) : null;
    items.push({
      key: 'dispatch',
      count: attention.pending_dispatch_count,
      title: 'Pedidos pagados por despachar',
      detail: local ? `El más antiguo espera desde el ${local.day} ${shortMonth(local.month)}.` : null,
      href: '/admin/pedidos/?pending_dispatch=true',
    });
  }
  if (attention.manual_refund_count !== null && attention.manual_refund_count > 0) {
    items.push({ key: 'refund', count: attention.manual_refund_count, title: 'Reembolso manual pendiente', detail: null, href: null });
  }
  return items;
}

/**
 * Button label for custom date range matching A-Inicio:
 * "1 oct – 19 oct 2026" or across years "28 dic 2025 – 5 ene 2026".
 */
export function formatRangeButton(fromDate: string, toDate: string): string {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = toDate.split('-').map(Number);
  const m1Str = shortMonth(m1);
  const m2Str = shortMonth(m2);
  if (y1 === y2) {
    return `${d1} ${m1Str} – ${d2} ${m2Str} ${y2}`;
  }
  return `${d1} ${m1Str} ${y1} – ${d2} ${m2Str} ${y2}`;
}
