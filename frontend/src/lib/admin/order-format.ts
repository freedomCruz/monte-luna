const STORE_TIME_ZONE = 'America/Bogota';

const DATE_TIME = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: STORE_TIME_ZONE,
});

const CALENDAR_DAY = new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// ICU writes "20 de oct, 9:12 a. m."; the canvas reads "20 oct, 9:12 a. m." and uses
// regular spaces.
function plain(text: string): string {
  return text.replace(/ de /g, ' ').replace(/[\u00a0\u202f]/g, ' ');
}

/** Placement time in the store time zone, as in the A-Pedidos canvas ("20 oct, 9:12 a. m."). */
export function formatOrderDateTime(iso: string): string {
  return plain(DATE_TIME.format(new Date(iso)));
}

/** "Medellín, Antioquia"; a department that repeats the municipality is shown once. */
export function formatOrderDestination(municipality: string, department: string): string {
  return municipality === department ? municipality : `${municipality}, ${department}`;
}

function calendarDay(date: string): string {
  return plain(CALENDAR_DAY.format(new Date(`${date}T00:00:00Z`)));
}

/** "1 oct – 20 oct" for the Fecha chip of a custom range. */
export function formatRangeLabel(from: string, to: string): string {
  return `${calendarDay(from)} – ${calendarDay(to)}`;
}

const DATE_TIME_YEAR = new Intl.DateTimeFormat('es-CO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: STORE_TIME_ZONE,
});

/** Placement time with the year, as in the A-Pedido header ("20 oct 2026, 9:03 a. m."). */
export function formatOrderDateTimeWithYear(iso: string): string {
  return plain(DATE_TIME_YEAR.format(new Date(iso)));
}

/** "15 sep" for a calendar date such as a roast date. */
export function formatCalendarDay(date: string): string {
  return calendarDay(date);
}
