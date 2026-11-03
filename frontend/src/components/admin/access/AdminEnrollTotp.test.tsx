import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser, TotpEnrollment } from '../../../lib/admin/client';
import { AdminEnrollTotp } from './AdminEnrollTotp';

const { enrollTotp, confirmTotp } = vi.hoisted(() => ({
  enrollTotp: vi.fn(),
  confirmTotp: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, enrollTotp, confirmTotp };
});

const mockEnrollment: TotpEnrollment = {
  secret: 'JBSWY3DPEHPK3PXP',
  otpauth_uri: 'otpauth://totp/Monteluna%20Admin:laura%40monteluna.co?secret=JBSWY3DPEHPK3PXP&issuer=Monteluna%20Admin',
};

const mockAdminUser: AdminUser = {
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

const mockRecoveryCodes = [
  '7KQ2-9MXD', 'P4WN-3HTR', 'X8CB-2LQV', 'M6FJ-T9KE', 'R3ZD-8WNP',
  'H2VY-6QCA', 'B9LT-4MRX', 'N5GE-7ZKW', 'D7PU-3XBH', 'K4RM-9TYF',
];

describe('AdminEnrollTotp (T4: S1, S3, S4)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign: vi.fn(), replace: vi.fn() },
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('loads enrollment details and renders QR code matrix and manual secret', async () => {
    enrollTotp.mockResolvedValue({
      ok: true,
      data: mockEnrollment,
      etag: null,
    });

    render(<AdminEnrollTotp />);

    expect(await screen.findByRole('heading', { name: 'Activa la verificación en dos pasos', level: 1 })).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Código QR para agregar Monteluna Admin a tu app autenticadora' })).toBeTruthy();
    expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy();
    expect(screen.getByLabelText(/Escribe el código que aparece en la app/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Confirmar y continuar' })).toBeTruthy();
  });

  it('confirms enrollment with code and advances to step 3 (recovery codes)', async () => {
    enrollTotp.mockResolvedValue({
      ok: true,
      data: mockEnrollment,
      etag: null,
    });
    confirmTotp.mockResolvedValue({
      ok: true,
      data: {
        admin_user: mockAdminUser,
        recovery_codes: mockRecoveryCodes,
      },
      etag: null,
    });

    render(<AdminEnrollTotp />);

    await screen.findByRole('heading', { name: 'Activa la verificación en dos pasos', level: 1 });
    fireEvent.change(screen.getByLabelText(/Escribe el código que aparece en la app/i), { target: { value: '654321' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y continuar' }));

    await waitFor(() => {
      expect(confirmTotp).toHaveBeenCalledWith('654321');
    });

    expect(await screen.findByText('Solo los verás esta vez')).toBeTruthy();
    expect(screen.getByText('7KQ2-9MXD')).toBeTruthy();
    expect(screen.getByText('K4RM-9TYF')).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /Los guardé en un lugar seguro/i })).toBeTruthy();

    // Button should be disabled until checkbox is checked
    const continueBtn = screen.getByRole('button', { name: 'Continuar al panel' });
    expect(continueBtn.hasAttribute('disabled')).toBe(true);

    // Check the box
    fireEvent.click(screen.getByRole('checkbox', { name: /Los guardé en un lugar seguro/i }));
    const continueLink = screen.getByRole('link', { name: 'Continuar al panel' });
    expect(continueLink.getAttribute('href')).toBe('/admin/');
  });

  it('redirects to sign-in if session is missing or expired (401)', async () => {
    enrollTotp.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'authentication_required',
    });

    render(<AdminEnrollTotp />);

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('/admin/ingresar/');
    });
  });

  it('handles invalid code error during confirmation', async () => {
    enrollTotp.mockResolvedValue({
      ok: true,
      data: mockEnrollment,
    });
    confirmTotp.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'invalid_credentials',
    });

    render(<AdminEnrollTotp />);

    await waitFor(() => {
      expect(screen.getByText('JBSW Y3DP EHPK 3PXP')).toBeTruthy();
    });

    fireEvent.change(screen.getByPlaceholderText('000000'), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar y continuar' }));

    expect(
      await screen.findByText(/El código no es válido o ya cambió/i)
    ).toBeTruthy();
  });
});
