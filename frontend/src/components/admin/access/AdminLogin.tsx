import { useEffect, useState } from 'react';
import { login } from '../../../lib/admin/client';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AdminLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (lockoutSeconds === null || lockoutSeconds <= 0) return;
    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          return null;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || (lockoutSeconds !== null && lockoutSeconds > 0)) return;

    setError(null);
    setSubmitting(true);

    try {
      const result = await login(email, password);

      if (result.ok) {
        if (result.data.next_step === 'totp_required') {
          window.location.assign(ADMIN_ROUTES.secondFactor);
        } else if (result.data.next_step === 'enrollment_required') {
          window.location.assign(ADMIN_ROUTES.enrollSecondFactor);
        }
        return;
      }

      if (result.status === 429 || result.code === 'rate_limited') {
        const secs = result.retryAfterSeconds ?? 900;
        setLockoutSeconds(secs);
        setError(null);
      } else if (result.status === 401 || result.code === 'invalid_credentials') {
        setError('Correo o contraseña incorrectos.');
      } else if (result.code === 'network_error') {
        setError('No pudimos conectar con el servidor. Revisa tu conexión.');
      } else {
        setError('No se pudo iniciar sesión. Por favor, intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const isLocked = lockoutSeconds !== null && lockoutSeconds > 0;
  const countdownText = isLocked ? formatCountdown(lockoutSeconds) : '15:00';

  return (
    <div className="flex min-h-screen w-full flex-wrap bg-background font-sans text-foreground">
      {/* Decorative / Brand column */}
      <div
        className="relative flex min-w-[320px] flex-1 flex-col justify-between overflow-hidden bg-brand-yellow p-5 lg:min-h-screen lg:max-w-[560px] lg:p-14"
        aria-hidden={false}
      >
        <div className="flex items-center gap-2.5">
          <span className="font-condensed text-3xl font-extrabold uppercase leading-none tracking-tight lg:text-4xl">
            Monteluna
          </span>
          <span className="rounded-sm bg-foreground px-2 py-0.5 font-condensed text-sm font-bold uppercase tracking-wider text-brand-yellow">
            Admin
          </span>
        </div>

        <div className="relative my-8 hidden h-[420px] w-full lg:block">
          <img
            src="/images/packaging-finca-la-maria.webp"
            alt=""
            className="absolute left-1/2 top-0 h-[420px] -translate-x-1/2 -rotate-6 drop-shadow-[0_22px_16px_rgba(27,21,16,0.28)]"
          />
          <span className="absolute bottom-2 left-[8%] flex h-[168px] w-[168px] -rotate-10 flex-col items-center justify-center rounded-full bg-foreground text-brand-yellow outline-dashed outline-2 -outline-offset-[11px] outline-brand-yellow">
            <span className="font-condensed text-[15px] font-bold uppercase tracking-widest">
              Panel de
            </span>
            <span className="text-[32px] font-extrabold leading-none text-background">
              la tienda
            </span>
            <span className="font-condensed text-[15px] font-bold uppercase tracking-widest">
              café · cacao
            </span>
          </span>
        </div>

        <p className="hidden max-w-[420px] text-lg font-semibold leading-relaxed lg:block">
          Catálogo, pedidos, pagos y envíos de Monteluna en un solo lugar.
        </p>
      </div>

      {/* Main login form column */}
      <main className="flex flex-1 items-center justify-center p-4 sm:p-8 lg:p-12">
        <div className="w-full max-w-[440px] rounded-xl border border-border bg-card p-6 sm:p-9 shadow-none">
          <div className="mb-5 flex flex-col gap-1.5">
            <span className="font-condensed text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Panel de administración
            </span>
            <h1 className="text-3xl font-extrabold tracking-tight">
              Inicia sesión
            </h1>
          </div>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-md border-2 border-destructive p-3"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#9B1C1C"
                strokeWidth="2.2"
                strokeLinecap="round"
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M12 7.5v5.5M12 16.5v.2" />
              </svg>
              <span className="text-[15px] font-bold leading-snug text-foreground">
                {error}
              </span>
            </div>
          )}

          {isLocked && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-md bg-secondary p-3.5 text-foreground"
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#1B1510"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="mt-0.5 shrink-0"
              >
                <rect x="5" y="10.5" width="14" height="10" rx="2" />
                <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3" />
              </svg>
              <div className="flex flex-col gap-1">
                <span className="text-[15px] font-extrabold">
                  Acceso bloqueado por unos minutos
                </span>
                <span className="text-sm leading-relaxed text-muted-foreground">
                  Hubo varios intentos fallidos. Por seguridad, vuelve a intentarlo en{' '}
                  <span className="font-extrabold text-foreground">{countdownText}</span>. Si
                  no recuerdas tu contraseña, recupérala.
                </span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Correo</span>
              <input
                type="email"
                name="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-11 rounded-sm border border-muted-foreground/60 bg-card px-3 text-base text-foreground transition-colors focus-visible:outline-foreground"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Contraseña</span>
              <div className="flex h-11 items-center rounded-sm border border-muted-foreground/60 bg-card focus-within:ring-2 focus-within:ring-foreground">
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-base text-foreground outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-pressed={showPassword}
                  className="flex h-full min-w-[70px] cursor-pointer items-center justify-center border-l border-border px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted/40"
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
            </label>

            <a
              href={ADMIN_ROUTES.forgotPassword}
              className="inline-flex min-h-[44px] items-center self-start text-[15px] font-bold underline underline-offset-4 transition-colors hover:text-accent"
            >
              ¿Olvidaste tu contraseña?
            </a>

            {isLocked ? (
              <button
                type="button"
                disabled
                className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-sm bg-border text-base font-bold text-muted-foreground"
              >
                Disponible en {countdownText}
              </button>
            ) : (
              <button
                type="submit"
                disabled={submitting}
                className="flex h-12 w-full cursor-pointer items-center justify-center rounded-sm bg-accent text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}
              </button>
            )}
          </form>

          <p className="mt-5 border-t border-border pt-3.5 text-sm leading-relaxed text-muted-foreground">
            Después te pediremos el código de tu app autenticadora.
          </p>
        </div>
      </main>
    </div>
  );
}
