import { describe, expect, it } from 'vitest';
import { formatOrderDateTime, formatOrderDestination, formatRangeLabel } from './order-format';

describe('Admin order formatting (F2: S3)', () => {
  it('formats placement in the store time zone like the canvas', () => {
    expect(formatOrderDateTime('2026-10-20T14:12:00Z')).toBe('20 oct, 9:12 a. m.');
    expect(formatOrderDateTime('2026-10-19T23:30:00Z')).toBe('19 oct, 6:30 p. m.');
    expect(formatOrderDateTime('2026-10-20T03:30:00Z')).toBe('19 oct, 10:30 p. m.');
  });

  it('joins municipality and department, collapsing a repeated name', () => {
    expect(formatOrderDestination('Medellín', 'Antioquia')).toBe('Medellín, Antioquia');
    expect(formatOrderDestination('Bogotá, D. C.', 'Bogotá, D. C.')).toBe('Bogotá, D. C.');
  });

  it('labels a date range with calendar dates', () => {
    expect(formatRangeLabel('2026-10-01', '2026-10-20')).toBe('1 oct – 20 oct');
  });
});
