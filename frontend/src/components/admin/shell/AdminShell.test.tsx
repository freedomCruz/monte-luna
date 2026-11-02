import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminShell, sessionDestination, useAdminSession } from './AdminShell';

const { getCurrentAdmin, logout } = vi.hoisted(() => ({
  getCurrentAdmin: vi.fn(),
  logout: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, getCurrentAdmin, logout };
});

const owner: AdminUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'laura@monteluna.co',
  display_name: 'Laura Ríos',
  role: 'owner',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};

function SessionProbe() {
  const { user } = useAdminSession();
  return <p>Contenido privado de {user.display_name}</p>;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminShell session guard (T2/T8: S3, S4)', () => {
  it('maps an absent session to sign-in and a forbidden response to no-access', () => {
    expect(sessionDestination({ ok: false, status: 401, code: 'unauthorized' })).toBe('/admin/ingresar/');
    expect(sessionDestination({ ok: false, status: 403, code: 'forbidden' })).toBe('/admin/sin-acceso/');
    expect(sessionDestination({ ok: false, status: 0, code: 'network_error' })).toBeNull();
  });

  it('does not render private content until the current session succeeds', async () => {
    let resolveSession!: (value: Awaited<ReturnType<typeof getCurrentAdmin>>) => void;
    getCurrentAdmin.mockReturnValue(new Promise((resolve) => { resolveSession = resolve; }));

    render(<AdminShell active="admins"><SessionProbe /></AdminShell>);
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Comprobando tu sesión');

    resolveSession({ ok: true, data: owner, etag: '"1"' });
    expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
    expect(screen.getAllByRole('link', { name: 'Administradores' }).every((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('does not render an owner-only page to staff', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: { ...owner, role: 'staff' }, etag: '"2"' });
    render(<AdminShell requiredRole="owner"><SessionProbe /></AdminShell>);

    expect(await screen.findByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeTruthy();
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    expect(screen.queryByRole('link', { name: 'Administradores' })).toBeNull();
  });

  it('shows the user menu and signs out through the API', async () => {
    getCurrentAdmin.mockResolvedValue({ ok: true, data: owner, etag: '"1"' });
    logout.mockResolvedValue({ ok: true, data: null, etag: null });
    render(<AdminShell><SessionProbe /></AdminShell>);

    fireEvent.pointerDown(await screen.findByRole('button', { name: 'Menú de Laura Ríos' }), { button: 0, ctrlKey: false });
    expect(await screen.findByText(/laura@monteluna\.co/)).toBeTruthy();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Cerrar sesión' }));
    await waitFor(() => expect(logout).toHaveBeenCalledOnce());
  });

  it('offers retry without leaking content when the session check cannot reach the API', async () => {
    getCurrentAdmin
      .mockResolvedValueOnce({ ok: false, status: 0, code: 'network_error' })
      .mockResolvedValueOnce({ ok: true, data: owner, etag: '"1"' });
    render(<AdminShell><SessionProbe /></AdminShell>);

    expect(await screen.findByText('No pudimos comprobar tu sesión.')).toBeTruthy();
    expect(screen.queryByText(/Contenido privado/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Contenido privado de Laura Ríos')).toBeTruthy();
  });
});
