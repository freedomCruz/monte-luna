import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import {
  createAdminUser,
  listAdminUsers,
  resetAdminUserTotp,
  updateAdminUser,
} from '../../../lib/admin/client';
import { AdministratorsView } from './AdministratorsView';

const { mockUseAdminSession } = vi.hoisted(() => ({
  mockUseAdminSession: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return {
    ...original,
    listAdminUsers: vi.fn(),
    createAdminUser: vi.fn(),
    updateAdminUser: vi.fn(),
    resetAdminUserTotp: vi.fn(),
  };
});

vi.mock('../shell/AdminShell', async (importOriginal) => {
  const original = await importOriginal<typeof import('../shell/AdminShell')>();
  return {
    ...original,
    useAdminSession: () => mockUseAdminSession(),
  };
});

const currentOwner: AdminUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'laura@monteluna.co',
  display_name: 'Laura Ríos',
  role: 'owner',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  version: 1,
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};

const otherStaff: AdminUser = {
  id: '01900000-0000-7000-8000-000000000002',
  email: 'carlos@monteluna.co',
  display_name: 'Carlos Gómez',
  role: 'staff',
  status: 'active',
  totp_confirmed_at: '2026-10-10T12:00:00Z',
  last_login_at: '2026-10-19T10:00:00Z',
  password_changed_at: '2026-10-10T12:00:00Z',
  version: 2,
  created_at: '2026-02-01T12:00:00Z',
  updated_at: '2026-10-19T10:00:00Z',
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdministratorsView (T7: S1, S2, S3, S4)', () => {
  it('lists administrators and disables demoting/suspending self or sole owner', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner, otherStaff], next_cursor: null },
      etag: null,
    });

    render(<AdministratorsView />);

    expect(await screen.findByText('Laura Ríos')).toBeTruthy();
    expect(screen.getByText('carlos@monteluna.co')).toBeTruthy();

    // Check that current user is marked as (tú)
    expect(screen.getByText('(tú)')).toBeTruthy();

    // Open row action menu for self
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Laura Ríos' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar datos y permisos/i }));

    // Editing self should disable demoting role or suspending to prevent sole owner lockout
    const roleSelect = screen.getByLabelText(/Rol/i) as HTMLSelectElement;
    expect(roleSelect.disabled).toBe(true);

    const statusSelect = screen.getByLabelText(/Estado/i) as HTMLSelectElement;
    expect(statusSelect.disabled).toBe(true);
  });

  it('creates an administrator via slide-over sheet and shows success notification', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner], next_cursor: null },
      etag: null,
    });
    vi.mocked(createAdminUser).mockResolvedValue({
      ok: true,
      data: otherStaff,
      etag: '"2"',
    });

    render(<AdministratorsView />);
    await screen.findByText('Laura Ríos');

    // Click "Agregar administrador"
    fireEvent.click(screen.getByRole('button', { name: /Agregar administrador/i }));
    expect(screen.getByRole('dialog', { name: /Agregar administrador/i })).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Carlos Gómez' } });
    fireEvent.change(screen.getByLabelText(/^Correo$/i), { target: { value: 'carlos@monteluna.co' } });

    // Select Equipo role (default is staff, click to verify radio interaction)
    fireEvent.click(screen.getByText('Equipo'));

    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    await waitFor(() => {
      expect(createAdminUser).toHaveBeenCalledWith({
        display_name: 'Carlos Gómez',
        email: 'carlos@monteluna.co',
        role: 'staff',
      });
    });

    expect(await screen.findByText(/Invitación enviada a carlos@monteluna\.co/i)).toBeTruthy();
  });

  it('surfaces localized conflict message on duplicate email', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner], next_cursor: null },
      etag: null,
    });
    vi.mocked(createAdminUser).mockResolvedValue({
      ok: false,
      code: 'email_conflict',
      status: 409,
      problem: { title: 'Email conflict', detail: 'Email already exists' },
    });

    render(<AdministratorsView />);
    await screen.findByText('Laura Ríos');

    fireEvent.click(screen.getByRole('button', { name: /Agregar administrador/i }));
    fireEvent.change(screen.getByLabelText(/^Nombre$/i), { target: { value: 'Carlos Gómez' } });
    fireEvent.change(screen.getByLabelText(/^Correo$/i), { target: { value: 'carlos@monteluna.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar invitación' }));

    expect(await screen.findByText('Ya existe una persona registrada con este correo.')).toBeTruthy();
  });

  it('handles last owner conflict (409 last_active_owner) on update', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner, { ...otherStaff, role: 'owner' }], next_cursor: null },
      etag: null,
    });
    vi.mocked(updateAdminUser).mockResolvedValue({
      ok: false,
      code: 'last_active_owner',
      status: 409,
      problem: { title: 'Last owner', detail: 'At least one active owner must remain.' },
    });

    render(<AdministratorsView />);
    await screen.findByText('Laura Ríos');

    // Open row menu for other admin
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Carlos Gómez' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar datos y permisos/i }));

    fireEvent.change(screen.getByLabelText(/Rol/i), { target: { value: 'staff' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/No se puede degradar o desactivar al único propietario activo\./i)).toBeTruthy();
  });

  it('handles version conflict (412 version_conflict) and refreshes list', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner, otherStaff], next_cursor: null },
      etag: null,
    });
    vi.mocked(updateAdminUser).mockResolvedValue({
      ok: false,
      code: 'version_conflict',
      status: 412,
      problem: { title: 'Version conflict', detail: 'The administrator changed' },
    });

    render(<AdministratorsView />);
    await screen.findByText('Laura Ríos');

    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Carlos Gómez' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Editar datos y permisos/i }));

    fireEvent.change(screen.getByLabelText(/Rol/i), { target: { value: 'owner' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText(/El usuario fue modificado por otra persona/i)).toBeTruthy();
  });

  it('resets TOTP for another administrator with acting owner reauthentication', async () => {
    mockUseAdminSession.mockReturnValue({ user: currentOwner, etag: '"1"' });
    vi.mocked(listAdminUsers).mockResolvedValue({
      ok: true,
      data: { items: [currentOwner, otherStaff], next_cursor: null },
      etag: null,
    });
    vi.mocked(resetAdminUserTotp).mockResolvedValue({
      ok: true,
      data: { ...otherStaff, totp_confirmed_at: null },
      etag: '"3"',
    });

    render(<AdministratorsView />);
    await screen.findByText('Laura Ríos');

    // Open row menu for Carlos Gómez and choose reset TOTP
    fireEvent.click(screen.getByRole('button', { name: 'Acciones de Carlos Gómez' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Restablecer verificación en dos pasos/i }));

    expect(screen.getByText('¿Restablecer la verificación de Carlos Gómez?')).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Tu contraseña actual/i), {
      target: { value: 'correct horse battery' },
    });
    fireEvent.change(screen.getByLabelText('Tu código de verificación'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Restablecer verificación' }));

    await waitFor(() => {
      expect(resetAdminUserTotp).toHaveBeenCalledWith(otherStaff.id, `"${otherStaff.version}"`, {
        current_password: 'correct horse battery',
        second_factor: { totp_code: '123456' },
      });
    });

    expect(await screen.findByText(/2FA restablecido para Carlos Gómez/i)).toBeTruthy();
  });
});
