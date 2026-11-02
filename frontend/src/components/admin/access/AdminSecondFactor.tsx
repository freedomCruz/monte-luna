import { useState } from 'react';
import { verifySecondFactor } from '../../../lib/admin/client';
import { ADMIN_LANDING, ADMIN_ROUTES } from '../../../lib/admin/navigation';

export function AdminSecondFactor() {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [totpCode, setTotpCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    setError(null);
    setSubmitting(true);

    try {
      const proof =
        mode === 'totp'
          ? { totp_code: totpCode.trim() }
          : { recovery_code: recoveryCode.trim().toUpperCase() };

      const result = await verifySecondFactor(proof);

      if (result.ok) {
        window.location.assign(ADMIN_LANDING);
        return;
      }

      if (result.status === 401 && result.code === 'authentication_required') {
        window.location.assign(ADMIN_ROUTES.signIn);
        return;
      }

      if (result.status === 401 || result.code === 'invalid_credentials') {
        if (mode === 'totp') {
          setError(
            'El código no es válido o ya cambió. Escribe el que se ve ahora en tu app y revisa que la hora de tu teléfono sea automática.'
          );
        } else {
          setError('El código de recuperación no es válido o ya fue utilizado.');
        }
      } else if (result.status === 429 || result.code === 'rate_limited') {
        setError('Demasiados intentos fallidos. Por seguridad, espera unos minutos.');
      } else if (result.code === 'network_error') {
        setError('No pudimos conectar con el servidor. Revisa tu conexión.');
      } else {
        setError('No se pudo verificar el código. Por favor, intenta de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const switchMode = (newMode: 'totp' | 'recovery') => {
    setMode(newMode);
    setError(null);
  };

  return (
    <div className="flex min-h-screen w-full flex-col items-center gap-10 bg-background px-4 py-8 pb-16 font-sans text-foreground">
      {/* Top branding header */}
      <div className="mx-auto flex w-full max-w-[1320px] items-center gap-2.5">
        <span className="rounded-sm bg-brand-yellow px-3 py-1.5 font-condensed text-[26px] font-extrabold uppercase leading-none text-foreground">
          Monteluna
        </span>
        <span className="font-condensed text-[15px] font-bold uppercase tracking-wider text-muted-foreground">
          Admin
        </span>
      </div>

      {/* Main card */}
      <main className="w-full max-w-[460px] rounded-xl border border-border bg-card p-6 sm:p-9 shadow-none">
        <div className="flex flex-col gap-5">
          {/* Smartphone icon badge */}
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-yellow">
            <svg
              width="26"
              height="26"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#1B1510"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
              <path d="M10.5 18h3M9 9l2 2 4-4" />
            </svg>
          </span>

          {mode === 'totp' ? (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
                  Verificación en dos pasos
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Escribe el código de 6 dígitos que muestra tu app autenticadora para Monteluna.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Código de verificación</span>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    required
                    aria-invalid={Boolean(error)}
                    className={`h-[60px] rounded-sm bg-card px-4 text-center text-3xl font-extrabold tracking-[0.5em] text-foreground transition-colors focus-visible:outline-foreground ${
                      error ? 'border-2 border-destructive' : 'border border-muted-foreground/60'
                    }`}
                  />
                  {error ? (
                    <span className="flex items-start gap-1.5 text-sm font-bold leading-snug text-destructive">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        aria-hidden="true"
                        className="mt-0.5 shrink-0"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7.5v5.5M12 16.5v.2" />
                      </svg>
                      {error}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      El código cambia cada 30 segundos.
                    </span>
                  )}
                </label>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-12 w-full cursor-pointer items-center justify-center rounded-sm bg-accent text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Verificando…' : 'Verificar'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('recovery')}
                  className="inline-flex min-h-[44px] items-center self-start text-[15px] font-bold text-foreground underline underline-offset-4 transition-colors hover:text-accent"
                >
                  Usar un código de recuperación
                </button>
              </form>
            </div>
          ) : (
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-2">
                <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
                  Usa un código de recuperación
                </h1>
                <p className="text-base leading-relaxed text-muted-foreground">
                  Es uno de los códigos que guardaste al activar la verificación. Cada uno sirve una sola vez.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold">Código de recuperación</span>
                  <input
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="Ej.: 7KQ2-9MXD"
                    value={recoveryCode}
                    onChange={(e) => setRecoveryCode(e.target.value.toUpperCase())}
                    required
                    aria-invalid={Boolean(error)}
                    className={`h-12 rounded-sm bg-card px-3 text-lg font-bold uppercase tracking-wider text-foreground transition-colors focus-visible:outline-foreground ${
                      error ? 'border-2 border-destructive' : 'border border-muted-foreground/60'
                    }`}
                  />
                  {error && (
                    <span className="flex items-start gap-1.5 text-sm font-bold leading-snug text-destructive">
                      <svg
                        width="16"
                        height="16"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                        aria-hidden="true"
                        className="mt-0.5 shrink-0"
                      >
                        <circle cx="12" cy="12" r="9" />
                        <path d="M12 7.5v5.5M12 16.5v.2" />
                      </svg>
                      {error}
                    </span>
                  )}
                </label>

                <div className="flex items-start gap-2.5 rounded-md bg-secondary p-3 text-sm leading-relaxed text-foreground">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#1B1510"
                    strokeWidth="2"
                    strokeLinecap="round"
                    aria-hidden="true"
                    className="mt-0.5 shrink-0"
                  >
                    <circle cx="12" cy="12" r="9" />
                    <path d="M12 11v5M12 7.5v.2" />
                  </svg>
                  <span>
                    Si perdiste tu teléfono, después de entrar genera códigos nuevos en «Mi cuenta».
                    Si no tienes códigos, pídele a la persona propietaria que restablezca tu
                    verificación.
                  </span>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="flex h-12 w-full cursor-pointer items-center justify-center rounded-sm bg-accent text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {submitting ? 'Verificando…' : 'Verificar'}
                </button>

                <button
                  type="button"
                  onClick={() => switchMode('totp')}
                  className="inline-flex min-h-[44px] items-center self-start text-[15px] font-bold text-foreground underline underline-offset-4 transition-colors hover:text-accent"
                >
                  Usar la app autenticadora
                </button>
              </form>
            </div>
          )}

          <a
            href={ADMIN_ROUTES.signIn}
            className="inline-flex min-h-[44px] w-full items-center border-t border-border pt-1.5 text-[15px] font-semibold text-muted-foreground underline-offset-4 transition-colors hover:text-foreground"
          >
            ← Volver a iniciar sesión
          </a>
        </div>
      </main>
    </div>
  );
}
