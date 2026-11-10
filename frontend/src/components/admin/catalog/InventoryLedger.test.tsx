import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockMovementPage, mockVariantLotPage } from '../../../mocks/admin-inventory';
import { LotsSection, MovementsSection } from './InventoryLedger';

const { listAdminVariantLots, listAdminInventoryMovements } = vi.hoisted(() => ({
  listAdminVariantLots: vi.fn(),
  listAdminInventoryMovements: vi.fn(),
}));

vi.mock('../../../lib/admin/catalog', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/catalog')>()),
  listAdminVariantLots,
  listAdminInventoryMovements,
}));

const ok = <T,>(data: T) => ({ ok: true as const, etag: null, data });

beforeEach(() => {
  listAdminVariantLots.mockResolvedValue(ok(mockVariantLotPage));
  listAdminInventoryMovements.mockResolvedValue(ok(mockMovementPage));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Both tables scroll sideways on narrow widths; a scrollable region has to be reachable and named
// for keyboard users (WCAG 2.1.1, axe scrollable-region-focusable). The name differs from the
// section's own, which is already a region named after its heading.
describe('InventoryLedger scroll regions (admin-navigation-v1 F3)', () => {
  it.each([
    ['lots', <LotsSection key="lots" variantId="v1" reload={0} />, 'Tabla de lotes'],
    ['movements', <MovementsSection key="movements" variantId="v1" reload={0} />, 'Tabla del historial de movimientos'],
  ])('makes the %s table a focusable named region', async (_name, section, title) => {
    render(section);

    const table = await screen.findByRole('table');
    const region = table.parentElement!;
    expect(region.className).toContain('overflow-x-auto');
    expect(region.getAttribute('tabindex')).toBe('0');
    expect(region.getAttribute('role')).toBe('region');
    expect(screen.getByRole('region', { name: title })).toBe(region);
  });
});
