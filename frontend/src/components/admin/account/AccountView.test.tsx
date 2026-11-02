import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { changePassword, regenerateRecoveryCodes } from '../../../lib/admin/client';
import { AccountView } from './AccountView';

const { mockUseAdminSession } = vi.hoisted(() => ({
  mockUseAdminSession: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return {
    ...original,
    changePassword: vi.fn(),
    regenerateRecoveryCodes: vi.fn(),
  };
});

vi.mock('../shell/AdminShell', async (importOriginal) => {
  const original = await importOriginal<typeof import('../shell/AdminShell')>();
  return {
    ...original,
    useAdminSession: () => mockUseAdminSession(),
  };
});

const ownerUser: AdminUser = {
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AccountView (T6: S1, S2, S3, S4)', () => {
  it('renders profile data and does not invent a recovery-code count (L11)', () => {
    mockUseAdminSession.mockReturnValue({ user: ownerUser, etag: '"1"' });
    render(<AccountView />);

    expect(screen.getByRole('heading', { level: 1, name: 'Mi cuenta' })).toBeTruthy();
    expect(screen.getByText('Laura Ríos')).toBeTruthy();
    expect(screen.getByText('laura@monteluna.co')).toBeTruthy();
    expect(screen.getByText('Propietario')).toBeTruthy();

    // Invariant L11: AdminUser has no recovery-code count; verify no invented count
    expect(screen.queryByText(/códigos de recuperación sin usar/)).toBeNull();
    expect(screen.queryByText(/Usaste \d+ de los \d+/)).toBeNull();
  });

  it('enforces password rules: 12 to 128 Unicode code points and matching confirmation', async () => {
    mockUseAdminSession.mockReturnValue({ user: ownerUser, etag: '"1"' });
    render(<AccountView />);

    const currentInput = screen.getByLabelText(/Contraseña actual/i);
    const newInput = screen.getByLabelText(/^Nueva contraseña/i);
    const repeatInput = screen.getByLabelText(/Repite la nueva contraseña/i);
    const secondFactorInput = screen.getByPlaceholderText(/6 dígitos de tu app/i);
    const submitBtn = screen.getByRole('button', { name: 'Cambiar contraseña' });

    // Under 12 characters
    fireEvent.change(currentInput, { target: { value: 'actualPass123!' } });
    fireEvent.change(newInput, { target: { value: 'corta123' } });
    fireEvent.change(repeatInput, { target: { value: 'corta123' } });
    fireEvent.change(secondFactorInput, { target: { value: '123456' } });
    fireEvent.click(submitBtn);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('La nueva contraseña debe tener entre 12 y 128 caracteres.')).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();

    // Passwords do not match
    fireEvent.change(newInput, { target: { value: 'nuevaContrasenaValida123' } });
    fireEvent.change(repeatInput, { target: { value: 'noCoincide123456' } });
    fireEvent.click(submitBtn);

    expect(await screen.findByText('Las contraseñas no coinciden.')).toBeTruthy();
    expect(changePassword).not.toHaveBeenCalled();
  });

  it('submits password change with second factor and shows success toast', async () => {
    mockUseAdminSession.mockReturnValue({ user: ownerUser, etag: '"1"' });
    vi.mocked(changePassword).mockResolvedValue({ ok: true, data: { completed: true }, etag: null });

    render(<AccountView />);

    fireEvent.change(screen.getByLabelText(/Contraseña actual/i), { target: { value: 'actualPass123!' } });
    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/i), { target: { value: 'nuevaContrasenaValida123' } });
    fireEvent.change(screen.getByLabelText(/Repite la nueva contraseña/i), { target: { value: 'nuevaContrasenaValida123' } });
    fireEvent.change(screen.getByPlaceholderText(/6 dígitos de tu app/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));

    await waitFor(() => {
      expect(changePassword).toHaveBeenCalledWith({
        current_password: 'actualPass123!',
        new_password: 'nuevaContrasenaValida123',
        second_factor: { totp_code: '654321' },
      });
    });

    expect(await screen.findByText(/Contraseña cambiada\. Cerramos tus otras sesiones\./i)).toBeTruthy();
  });

  it('regenerates recovery codes after reauthentication and displays them once', async () => {
    mockUseAdminSession.mockReturnValue({ user: ownerUser, etag: '"1"' });
    vi.mocked(regenerateRecoveryCodes).mockResolvedValue({
      ok: true,
      data: { recovery_codes: ['code-aaaa-1111', 'code-bbbb-2222'] },
      etag: null,
    });

    render(<AccountView />);

    // Open regenerate dialog
    fireEvent.click(screen.getByRole('button', { name: 'Generar códigos nuevos' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    expect(screen.getByText(/¿Generar códigos de recuperación nuevos\?/i)).toBeTruthy();

    // Fill reauthentication credentials
    const dlg = screen.getByRole('dialog');
    const passInput = dlg.querySelector('input[type="password"]') as HTMLInputElement;
    const codeInput = dlg.querySelector('input[name="second_factor"]') as HTMLInputElement;
    const confirmBtn = screen.getByRole('button', { name: 'Generar nuevos códigos' });

    fireEvent.change(passInput, { target: { value: 'myPassword123!' } });
    fireEvent.change(codeInput, { target: { value: '999888' } });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(regenerateRecoveryCodes).toHaveBeenCalledWith({
        current_password: 'myPassword123!',
        second_factor: { totp_code: '999888' },
      });
    });

    expect(await screen.findByText('code-aaaa-1111')).toBeTruthy();
    expect(screen.getByText('code-bbbb-2222')).toBeTruthy();
  });
});
