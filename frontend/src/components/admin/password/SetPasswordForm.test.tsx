import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { SetPasswordForm } from './SetPasswordForm';

const { completePasswordReset } = vi.hoisted(() => ({
  completePasswordReset: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, completePasswordReset };
});

describe('SetPasswordForm (T5: S1, S2, S3, S4)', () => {
  beforeEach(() => {
    window.location.hash = '';
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
    window.location.hash = '';
  });

  it('shows expired/invalid link state when URL fragment has no token (S4)', () => {
    window.location.hash = '';
    render(<SetPasswordForm mode="reset" />);

    expect(screen.getByRole('heading', { name: 'Este enlace ya no sirve' })).toBeTruthy();
    expect(
      screen.getByText(/Los enlaces duran 30 minutos y se usan una sola vez/i)
    ).toBeTruthy();
    const askAgainLink = screen.getByRole('link', { name: 'Pedir un enlace nuevo' });
    expect(askAgainLink.getAttribute('href')).toBe(ADMIN_ROUTES.forgotPassword);
    expect(screen.getByRole('link', { name: /Volver a iniciar sesión/ }).getAttribute('href')).toBe(
      ADMIN_ROUTES.signIn
    );
  });

  it('reads token from URL fragment, clears it from the address bar, and shows the form (S4)', () => {
    const replaceStateSpy = vi.spyOn(window.history, 'replaceState');
    window.location.hash = '#token=valid-test-token-1234';

    render(<StrictMode><SetPasswordForm mode="reset" /></StrictMode>);

    expect(replaceStateSpy).toHaveBeenCalledTimes(1);
    expect(replaceStateSpy).toHaveBeenCalledWith(null, '', window.location.pathname + window.location.search);
    expect(screen.getByRole('heading', { name: 'Crea tu nueva contraseña' })).toBeTruthy();
  });

  it('renders "Crea tu contraseña" for invitation mode (S1)', () => {
    window.location.hash = '#token=valid-test-token-1234';
    render(<SetPasswordForm mode="invitation" />);

    expect(screen.getByRole('heading', { name: 'Crea tu contraseña' })).toBeTruthy();
  });

  it('enforces only the 12-128 Unicode code points rule without unapproved canvas rules (S2)', () => {
    window.location.hash = '#token=valid-token-123';
    render(<SetPasswordForm mode="reset" />);

    const rulesList = screen.getByRole('list', { name: 'Requisitos de la contraseña' });
    expect(rulesList.textContent).toContain('Entre 12 y 128 caracteres');
    expect(rulesList.textContent).not.toContain('No contiene tu correo');
    expect(rulesList.textContent).not.toContain('listas de contraseñas');

    const passwordInput = screen.getByLabelText(/^Nueva contraseña/i);
    expect(screen.getByText(': pendiente')).toBeTruthy();

    // Type 11 characters -> still pending
    fireEvent.change(passwordInput, { target: { value: '12345678901' } });
    expect(screen.getByText(': pendiente')).toBeTruthy();

    // Type 12 characters -> fulfilled
    fireEvent.change(passwordInput, { target: { value: '123456789012' } });
    expect(screen.getByText(': cumplido')).toBeTruthy();

    // Type 129 characters -> pending again
    fireEvent.change(passwordInput, { target: { value: 'a'.repeat(129) } });
    expect(screen.getByText(': pendiente')).toBeTruthy();
  });

  it('rejects passwords that do not match on submission', async () => {
    window.location.hash = '#token=valid-token-123';
    render(<SetPasswordForm mode="reset" />);

    const passwordInput = screen.getByLabelText(/^Nueva contraseña/i);
    const repeatInput = screen.getByLabelText(/Repite la contraseña/i);

    fireEvent.change(passwordInput, { target: { value: 'cafedemontana2026' } });
    fireEvent.change(repeatInput, { target: { value: 'cafedemontana2027' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Las contraseñas no coinciden');
    expect(completePasswordReset).not.toHaveBeenCalled();
  });

  it('rejects passwords shorter than 12 characters on submission', async () => {
    window.location.hash = '#token=valid-token-123';
    render(<SetPasswordForm mode="reset" />);

    const passwordInput = screen.getByLabelText(/^Nueva contraseña/i);
    const repeatInput = screen.getByLabelText(/Repite la contraseña/i);

    fireEvent.change(passwordInput, { target: { value: 'corto123' } });
    fireEvent.change(repeatInput, { target: { value: 'corto123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('La contraseña debe tener entre 12 y 128 caracteres');
    expect(completePasswordReset).not.toHaveBeenCalled();
  });

  it('submits valid password and shows success state (S1, S4)', async () => {
    window.location.hash = '#token=valid-token-123';
    completePasswordReset.mockResolvedValue({
      ok: true,
      data: { completed: true },
      etag: null,
    });

    render(<SetPasswordForm mode="reset" />);

    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    await waitFor(() => {
      expect(completePasswordReset).toHaveBeenCalledWith('valid-token-123', 'cafedemontana2026');
    });

    expect(await screen.findByRole('heading', { name: 'Contraseña guardada' })).toBeTruthy();
    const loginLink = screen.getByRole('link', { name: 'Iniciar sesión' });
    expect(loginLink.getAttribute('href')).toBe(ADMIN_ROUTES.signIn);
  });

  it('transitions to expired/invalid link state when API returns invalid_reset_token (422) (S4)', async () => {
    window.location.hash = '#token=expired-token-123';
    completePasswordReset.mockResolvedValue({
      ok: false,
      code: 'invalid_reset_token',
      status: 422,
    });

    render(<SetPasswordForm mode="reset" />);

    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    expect(await screen.findByRole('heading', { name: 'Este enlace ya no sirve' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' })).toBeTruthy();
  });

  it('displays rate limiting error without losing password form (S4)', async () => {
    window.location.hash = '#token=valid-token-123';
    completePasswordReset.mockResolvedValue({
      ok: false,
      code: 'rate_limited',
      status: 429,
    });

    render(<SetPasswordForm mode="reset" />);

    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/i), {
      target: { value: 'cafedemontana2026' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar contraseña' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Demasiados intentos');
    expect(screen.getByRole('heading', { name: 'Crea tu nueva contraseña' })).toBeTruthy();
  });

  it('never stores password or token in localStorage, sessionStorage, or logs (S4)', async () => {
    const localSpy = vi.spyOn(Storage.prototype, 'setItem');
    const consoleSpy = vi.spyOn(console, 'log');
    window.location.hash = '#token=secret-token-xyz';

    render(<SetPasswordForm mode="reset" />);

    fireEvent.change(screen.getByLabelText(/^Nueva contraseña/i), {
      target: { value: 'super-secret-password-123' },
    });
    fireEvent.change(screen.getByLabelText(/Repite la contraseña/i), {
      target: { value: 'super-secret-password-123' },
    });

    expect(localSpy).not.toHaveBeenCalled();
    expect(consoleSpy).not.toHaveBeenCalled();
    // The raw token must never be rendered into DOM text or attributes
    expect(document.body.innerHTML).not.toContain('secret-token-xyz');
  });
});
