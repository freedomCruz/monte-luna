import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminUser } from '../../../lib/admin/client';
import { AdminSecondFactor } from './AdminSecondFactor';

const { verifySecondFactor } = vi.hoisted(() => ({
  verifySecondFactor: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, verifySecondFactor };
});

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

describe('AdminSecondFactor (T3: S1, S3, S4)', () => {
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

  it('renders TOTP app mode by default matching the canvas layout', () => {
    render(<AdminSecondFactor />);

    expect(screen.getByRole('heading', { name: 'Verificación en dos pasos', level: 1 })).toBeTruthy();
    expect(screen.getByText(/Escribe el código de 6 dígitos que muestra tu app autenticadora/i)).toBeTruthy();
    expect(screen.getByLabelText(/Código de verificación/i)).toBeTruthy();
    expect(screen.getByText('El código cambia cada 30 segundos.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verificar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Usar un código de recuperación' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '← Volver a iniciar sesión' })).toBeTruthy();
  });

  it('switches between TOTP mode and recovery code mode', () => {
    render(<AdminSecondFactor />);

    fireEvent.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    expect(screen.getByRole('heading', { name: 'Usa un código de recuperación', level: 1 })).toBeTruthy();
    expect(screen.getByLabelText(/Código de recuperación/i)).toBeTruthy();
    expect(screen.getByText(/Si perdiste tu teléfono, después de entrar genera códigos nuevos en «Mi cuenta»/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Usar la app autenticadora' }));
    expect(screen.getByRole('heading', { name: 'Verificación en dos pasos', level: 1 })).toBeTruthy();
  });

  it('verifies TOTP code and navigates to admin landing upon success', async () => {
    verifySecondFactor.mockResolvedValue({
      ok: true,
      data: mockAdminUser,
      etag: '"1"',
    });

    render(<AdminSecondFactor />);

    fireEvent.change(screen.getByLabelText(/Código de verificación/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => {
      expect(verifySecondFactor).toHaveBeenCalledWith({ totp_code: '123456' });
      expect(window.location.assign).toHaveBeenCalledWith('/admin/');
    });
  });

  it('shows error state when TOTP verification fails', async () => {
    verifySecondFactor.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'invalid_credentials',
    });

    render(<AdminSecondFactor />);

    fireEvent.change(screen.getByLabelText(/Código de verificación/i), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText(/El código no es válido o ya cambió/i)).toBeTruthy();
  });

  it('verifies recovery code and navigates to admin landing upon success', async () => {
    verifySecondFactor.mockResolvedValue({
      ok: true,
      data: mockAdminUser,
      etag: '"1"',
    });

    render(<AdminSecondFactor />);

    fireEvent.click(screen.getByRole('button', { name: 'Usar un código de recuperación' }));
    fireEvent.change(screen.getByLabelText(/Código de recuperación/i), { target: { value: '7KQ2-9MXD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => {
      expect(verifySecondFactor).toHaveBeenCalledWith({ recovery_code: '7KQ2-9MXD' });
      expect(window.location.assign).toHaveBeenCalledWith('/admin/');
    });
  });

  it('redirects to sign-in if pending session is expired or absent (401 authentication_required)', async () => {
    verifySecondFactor.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'authentication_required',
    });

    render(<AdminSecondFactor />);

    fireEvent.change(screen.getByLabelText(/Código de verificación/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('/admin/ingresar/');
    });
  });

  it('displays network error message on connection failure', async () => {
    verifySecondFactor.mockResolvedValue({
      ok: false,
      status: 0,
      code: 'network_error',
    });

    render(<AdminSecondFactor />);

    fireEvent.change(screen.getByLabelText(/Código de verificación/i), { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Verificar' }));

    expect(await screen.findByText('No pudimos conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  });
});
