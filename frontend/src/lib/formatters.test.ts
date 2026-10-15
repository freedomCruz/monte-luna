import { describe, expect, it } from 'vitest';
import { formatMoneyCop, formatRoastDateSpanish } from './formatters';

describe('formatMoneyCop', () => {
  it('formats minor units (centavos) to Colombian pesos without decimals using dot as thousands separator', () => {
    expect(formatMoneyCop(3800000)).toBe('$38.000');
    expect(formatMoneyCop(4500000)).toBe('$45.000');
    expect(formatMoneyCop(1400000)).toBe('$14.000');
    expect(formatMoneyCop(1500000)).toBe('$15.000');
    expect(formatMoneyCop(950000)).toBe('$9.500');
    expect(formatMoneyCop(0)).toBe('$0');
  });

  it('handles large amounts correctly', () => {
    expect(formatMoneyCop(125000000)).toBe('$1.250.000');
  });
});

describe('formatRoastDateSpanish', () => {
  it('formats YYYY-MM-DD calendar dates into readable Spanish date format', () => {
    // Canvas M-Detalle: "Tostado el 2 oct 2026" or similar
    expect(formatRoastDateSpanish('2026-10-02')).toBe('2 oct 2026');
    expect(formatRoastDateSpanish('2026-10-01')).toBe('1 oct 2026');
    expect(formatRoastDateSpanish('2026-01-15')).toBe('15 ene 2026');
    expect(formatRoastDateSpanish('2026-12-31')).toBe('31 dic 2026');
  });

  it('handles null or undefined gracefully', () => {
    expect(formatRoastDateSpanish(null)).toBeNull();
    expect(formatRoastDateSpanish(undefined)).toBeNull();
  });
});
