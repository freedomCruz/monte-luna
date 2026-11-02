import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { RequestPasswordResetForm } from './RequestPasswordResetForm';

const { requestPasswordReset } = vi.hoisted(() => ({
  requestPasswordReset: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, requestPasswordReset };
});

describe('RequestPasswordResetForm (T5: S1, S3, S4)', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders initial form according to canvas A-Recuperar (S3)', () => {
    render(<RequestPasswordResetForm />);

    expect(screen.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeTruthy();
    expect(screen.getByText(/Escribe el correo con el que entras al panel/)).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar enlace' })).toBeTruthy();
    const backLink = screen.getByRole('link', { name: /Volver a iniciar sesión/ });
    expect(backLink.getAttribute('href')).toBe(ADMIN_ROUTES.signIn);
  });

  it('submits email and displays uniform confirmation without account enumeration (S4)', async () => {
    requestPasswordReset.mockResolvedValue({
      ok: true,
      data: { message: 'If the account is eligible, a password reset link will be emailed.' },
      etag: null,
    });

    render(<RequestPasswordResetForm />);

    const emailInput = screen.getByLabelText('Correo');
    fireEvent.change(emailInput, { target: { value: 'admin@monteluna.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    await waitFor(() => {
      expect(requestPasswordReset).toHaveBeenCalledWith('admin@monteluna.co');
    });

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    const statusMsg = screen.getByRole('status');
    expect(statusMsg.textContent).toContain('Si ese correo pertenece a una cuenta del panel, te llegará un enlace en unos minutos.');
    expect(statusMsg.textContent).toContain('30 minutos');
    expect(screen.getByText(/¿No llega\? Revisa la carpeta de spam\./)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pedir otro enlace' })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Volver a iniciar sesión/ }).getAttribute('href')).toBe(ADMIN_ROUTES.signIn);
  });

  it('allows requesting another link by clicking "Pedir otro enlace"', async () => {
    requestPasswordReset.mockResolvedValue({
      ok: true,
      data: { message: 'If the account is eligible, a password reset link will be emailed.' },
      etag: null,
    });

    render(<RequestPasswordResetForm />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'admin@monteluna.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    const askAgainBtn = await screen.findByRole('button', { name: 'Pedir otro enlace' });
    fireEvent.click(askAgainBtn);

    expect(screen.getByRole('heading', { name: 'Recupera tu contraseña' })).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
  });

  it('displays rate limiting error without disclosing account status (S4)', async () => {
    requestPasswordReset.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      status: 429,
      retryAfterSeconds: 60,
    });

    render(<RequestPasswordResetForm />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'admin@monteluna.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Demasiados intentos');
  });

  it('displays network error gracefully', async () => {
    requestPasswordReset.mockResolvedValue({
      ok: false,
      code: 'network_error',
      status: 0,
    });

    render(<RequestPasswordResetForm />);

    fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'admin@monteluna.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar enlace' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('No fue posible conectar con el servidor');
  });
});
