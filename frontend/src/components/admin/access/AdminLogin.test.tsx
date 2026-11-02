import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

const { login } = vi.hoisted(() => ({
  login: vi.fn(),
}));

vi.mock('../../../lib/admin/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../lib/admin/client')>();
  return { ...original, login };
});

describe('AdminLogin (T3: S1, S3, S4)', () => {
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

  it('renders the sign-in form matching the canvas layout and branding', () => {
    render(<AdminLogin />);

    expect(screen.getByRole('heading', { name: 'Inicia sesión', level: 1 })).toBeTruthy();
    expect(screen.getByText('Panel de administración')).toBeTruthy();
    expect(screen.getByLabelText(/Correo/i)).toBeTruthy();
    expect(screen.getByLabelText(/Contraseña/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeTruthy();
    expect(screen.getByRole('link', { name: '¿Olvidaste tu contraseña?' })).toBeTruthy();
    expect(screen.getByText(/Después te pediremos el código de tu app autenticadora/i)).toBeTruthy();
  });

  it('toggles password visibility between text and password', () => {
    render(<AdminLogin />);

    const passwordInput = screen.getByLabelText(/Contraseña/i) as HTMLInputElement;
    const toggleButton = screen.getByRole('button', { name: 'Mostrar' });

    expect(passwordInput.type).toBe('password');
    fireEvent.click(toggleButton);
    expect(passwordInput.type).toBe('text');
    expect(screen.getByRole('button', { name: 'Ocultar' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Ocultar' }));
    expect(passwordInput.type).toBe('password');
  });

  it('submits credentials and routes to second factor when totp_required', async () => {
    login.mockResolvedValue({
      ok: true,
      data: { next_step: 'totp_required' },
      etag: null,
    });

    render(<AdminLogin />);

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'laura@monteluna.co' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'cafedemontana26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(login).toHaveBeenCalledWith('laura@monteluna.co', 'cafedemontana26');
      expect(window.location.assign).toHaveBeenCalledWith('/admin/verificacion/');
    });
  });

  it('routes to enrollment when next_step is enrollment_required', async () => {
    login.mockResolvedValue({
      ok: true,
      data: { next_step: 'enrollment_required' },
      etag: null,
    });

    render(<AdminLogin />);

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'nuevo@monteluna.co' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'cafedemontana26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    await waitFor(() => {
      expect(window.location.assign).toHaveBeenCalledWith('/admin/activar-verificacion/');
    });
  });

  it('displays canvas error alert on invalid credentials without leaking details', async () => {
    login.mockResolvedValue({
      ok: false,
      status: 401,
      code: 'invalid_credentials',
    });

    render(<AdminLogin />);

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'desconocido@monteluna.co' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'claveincorrecta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Correo o contraseña incorrectos.')).toBeTruthy();
  });

  it('displays lockout state with countdown and disabled button on rate limit (429)', async () => {
    login.mockResolvedValue({
      ok: false,
      status: 429,
      code: 'rate_limited',
      retryAfterSeconds: 872, // 14:32
    });

    render(<AdminLogin />);

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'bloqueado@monteluna.co' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'claveincorrecta' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Acceso bloqueado por unos minutos')).toBeTruthy();
    expect(screen.getAllByText(/14:32/).length).toBeGreaterThanOrEqual(1);
    const disabledButton = screen.getByRole('button', { name: /Disponible en 14:32/ });
    expect(disabledButton.hasAttribute('disabled')).toBe(true);
  });

  it('displays network error when connection to the server fails', async () => {
    login.mockResolvedValue({
      ok: false,
      status: 0,
      code: 'network_error',
    });

    render(<AdminLogin />);

    fireEvent.change(screen.getByLabelText(/Correo/i), { target: { value: 'laura@monteluna.co' } });
    fireEvent.change(screen.getByLabelText(/Contraseña/i), { target: { value: 'cafedemontana26' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('No pudimos conectar con el servidor. Revisa tu conexión.')).toBeTruthy();
  });
});
