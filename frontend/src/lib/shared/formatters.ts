/**
 * Format money arriving in minor units (centavos) to Colombian Pesos string
 * formatted without decimals as `$38.000` (dividing by 100).
 */
export function formatMoneyCop(minorUnits: number): string {
  const pesos = Math.floor(minorUnits / 100);
  // Colombian format uses '.' as thousand separator and '$' prefix without space
  const formatted = pesos.toLocaleString('es-CO');
  return `$${formatted}`;
}

const SPANISH_MONTH_ABBRS: Record<number, string> = {
  1: 'ene',
  2: 'feb',
  3: 'mar',
  4: 'abr',
  5: 'may',
  6: 'jun',
  7: 'jul',
  8: 'ago',
  9: 'sep',
  10: 'oct',
  11: 'nov',
  12: 'dic',
};

/**
 * Formats a calendar date (YYYY-MM-DD) into a friendly Spanish date string:
 * "2 oct 2026", matching canvas M-Detalle "Tostado el 2 oct 2026".
 */
export function formatRoastDateSpanish(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return dateStr;

  const year = match[1];
  const month = parseInt(match[2], 10);
  const day = parseInt(match[3], 10);

  const monthName = SPANISH_MONTH_ABBRS[month] || String(month);
  return `${day} ${monthName} ${year}`;
}
