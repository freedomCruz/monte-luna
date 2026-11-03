import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminHomePage } from './AdminHomePage';

const { getCurrentAdmin, listAdminOrders } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  listAdminOrders: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/client')>()),
  getCurrentAdmin,
}));
vi.mock('../../../lib/admin/orders', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/admin/orders')>()),
  listAdminOrders,
}));

const staff = { id: 'u1', email: 'andres@monteluna.co', display_name: 'Andrés Peña', role: 'staff', status: 'active' } as AdminUser;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminHomePage (F1: S1)', () => {
  it('opens inside the session guard with Inicio as the active section', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: staff, etag: '"1"' });
    listAdminOrders.mockResolvedValue({ ok: false, status: 0, code: 'network_error' });
    render(<AdminHomePage />);

    expect(screen.queryByRole('heading', { name: 'Inicio' })).toBeNull();
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Inicio' }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });
});
