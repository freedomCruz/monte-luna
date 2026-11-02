import { useEffect, useState } from 'react';
import { encode } from 'uqr';
import { confirmTotp, enrollTotp, type TotpEnrollment } from '../../../lib/admin/client';
import { ADMIN_LANDING, ADMIN_ROUTES } from '../../../lib/admin/navigation';

export function AdminEnrollTotp() {
  const [loading, setLoading] = useState(true);
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [savedCodes, setSavedCodes] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadEnrollment() {
      setLoading(true);
      setError(null);
      const result = await enrollTotp();

      if (!active) return;

      if (result.ok) {
        setEnrollment(result.data);
      } else {
        if (result.status === 401) {
          window.location.assign(ADMIN_ROUTES.signIn);
          return;
        }
        if (result.status === 409) {
          window.location.assign(ADMIN_LANDING);
          return;
        }
        setError('No se pudo cargar la configuración de verificación. Por favor recarga la página.');
      }
      setLoading(false);
    }

    loadEnrollment();

    return () => {
      active = false;
    };
  }, []);

  const handleCopySecret = async () => {
    if (!enrollment?.secret) return;
    try {
      await navigator.clipboard.writeText(enrollment.secret);
      setCopiedSecret(true);
      setTimeout(() => setCopiedSecret(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting || !totpCode.trim()) return;

    setError(null);
    setSubmitting(true);

    try {
      const result = await confirmTotp(totpCode.trim());

      if (result.ok) {
        setRecoveryCodes(result.data.recovery_codes);
        setStep(3);
      } else {
        if (result.status === 401 && result.code === 'authentication_required') {
          window.location.assign(ADMIN_ROUTES.signIn);
          return;
        }
        setError(
          'El código no es válido o ya cambió. Escribe el que se ve ahora en tu app y revisa que la hora de tu teléfono sea automática.'
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCodes = async () => {
    if (recoveryCodes.length === 0) return;
    try {
      await navigator.clipboard.writeText(recoveryCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 2000);
    } catch {
      // Clipboard fallback
    }
  };

  const handleDownloadCodes = () => {
    if (recoveryCodes.length === 0) return;
    const content = [
      'CÓDIGOS DE RECUPERACIÓN - MONTELUNA ADMIN',
      '==========================================',
      'Cada código sirve una sola vez para iniciar sesión si pierdes acceso a tu app autenticadora.',
      'Guárdalos en un lugar seguro (por ejemplo en tu gestor de contraseñas).',
      '',
      ...recoveryCodes.map((code, idx) => `${String(idx + 1).padStart(2, '0')}. ${code}`),
      '',
    ].join('\n');

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'codigos-recuperacion-monteluna.txt';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formattedSecret = enrollment?.secret
    ? enrollment.secret.replace(/(.{4})/g, '$1 ').trim()
    : '';

  const qrData = enrollment?.otpauth_uri ? encode(enrollment.otpauth_uri) : null;
  const qrCellSize = qrData ? (qrData.size > 28 ? 6 : 7) : 7;

  // Step indicator definitions
  const stepsDef = [
    { num: 1, title: 'Escanea' },
    { num: 2, title: 'Confirma' },
    { num: 3, title: 'Guarda los códigos' },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col items-center gap-8 bg-background px-4 py-8 pb-16 font-sans text-foreground">
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
      <main className="w-full max-w-[680px] rounded-xl border border-border bg-card p-6 sm:p-9 shadow-none">
        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="font-condensed text-sm font-bold uppercase tracking-wider text-muted-foreground">
              Primera vez · obligatorio para todo el equipo
            </span>
            <h1 className="text-[30px] font-extrabold leading-tight tracking-tight">
              Activa la verificación en dos pasos
            </h1>
          </div>

          {/* Stepper */}
          <ol
            aria-label="Pasos"
            className="m-0 flex flex-wrap items-center gap-3 p-0 text-sm font-bold"
          >
            {stepsDef.map((s) => {
              const isDone = s.num < step;
              const isCurrent = s.num === step || (step < 3 && s.num <= 2);

              let markBg = 'bg-white';
              let markText = 'text-muted-foreground';
              let markBorder = 'border-dashed';
              let labelText = 'text-muted-foreground';

              if (isDone) {
                markBg = 'bg-[#1E6B45]';
                markText = 'text-white';
                markBorder = 'border-[#1E6B45]';
                labelText = 'text-foreground';
              } else if (isCurrent) {
                markBg = 'bg-foreground';
                markText = 'text-white';
                markBorder = 'border-foreground';
                labelText = 'text-foreground';
              }

              return (
                <li
                  key={s.num}
                  aria-current={s.num === step ? 'step' : false}
                  className={`flex items-center gap-2 ${labelText}`}
                >
                  <span
                    className={`inline-flex h-[30px] w-[30px] items-center justify-center rounded-full border-2 font-condensed text-[17px] font-extrabold ${markBg} ${markText} ${markBorder}`}
                  >
                    {isDone ? '✓' : s.num}
                  </span>
                  <span>{s.title}</span>
                </li>
              );
            })}
          </ol>

          {loading ? (
            <div className="flex min-h-[240px] items-center justify-center text-muted-foreground font-semibold">
              Cargando configuración de verificación…
            </div>
          ) : step < 3 ? (
            /* Steps 1 & 2: Scan & Confirm */
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-7">
              {/* QR Code */}
              {qrData && (
                <div
                  role="img"
                  aria-label="Código QR para agregar Monteluna Admin a tu app autenticadora"
                  className="shrink-0 self-center rounded-md border border-border bg-white p-3.5 sm:self-start"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${qrData.size}, ${qrCellSize}px)`,
                    gap: 0,
                  }}
                >
                  {qrData.data.map((row, r) =>
                    row.map((cell, c) => (
                      <span
                        key={`${r}-${c}`}
                        style={{
                          width: `${qrCellSize}px`,
                          height: `${qrCellSize}px`,
                          backgroundColor: cell ? '#1B1510' : '#FFFFFF',
                        }}
                      />
                    ))
                  )}
                </div>
              )}

              {/* Instructions and Input */}
              <div className="flex min-w-0 flex-1 flex-col gap-4">
                <p className="m-0 text-base leading-relaxed text-foreground">
                  <span className="font-extrabold">1.</span> Abre tu app autenticadora (por
                  ejemplo Google Authenticator, Microsoft Authenticator o 1Password) y escanea el
                  código.
                </p>

                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-bold text-foreground">
                    ¿No puedes escanear? Escribe esta clave
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="flex h-11 flex-1 select-all items-center overflow-x-auto rounded-sm bg-secondary px-3 font-condensed text-lg font-bold tracking-widest text-foreground">
                      {formattedSecret}
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySecret}
                      className="flex h-11 cursor-pointer items-center justify-center rounded-sm border border-muted-foreground bg-card px-3.5 text-[15px] font-bold text-foreground transition-colors hover:bg-muted/30"
                    >
                      {copiedSecret ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    Tipo: basada en tiempo.
                  </span>
                </div>

                <form onSubmit={handleConfirm} className="flex flex-col gap-3 pt-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-bold text-foreground">
                      <span className="font-extrabold">2.</span> Escribe el código que aparece en la
                      app
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={6}
                      placeholder="000000"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                      required
                      aria-invalid={Boolean(error)}
                      className={`h-14 rounded-sm bg-card px-4 text-center text-2xl font-extrabold tracking-[0.5em] text-foreground transition-colors focus-visible:outline-foreground ${
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

                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex h-12 w-full cursor-pointer items-center justify-center rounded-sm bg-accent text-base font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {submitting ? 'Confirmando…' : 'Confirmar y continuar'}
                  </button>
                </form>
              </div>
            </div>
          ) : (
            /* Step 3: Recovery Codes */
            <div className="flex flex-col gap-5">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md bg-brand-yellow p-3.5 text-foreground"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#1B1510"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  aria-hidden="true"
                  className="mt-0.5 shrink-0"
                >
                  <path d="M12 7v6M12 16.5v.2" />
                  <circle cx="12" cy="12" r="9" />
                </svg>
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-extrabold">Solo los verás esta vez</span>
                  <span className="text-sm leading-relaxed">
                    Si pierdes tu teléfono, cada código te deja entrar una vez. Guárdalos fuera de
                    este computador, por ejemplo en tu gestor de contraseñas.
                  </span>
                </div>
              </div>

              <ul
                aria-label="Códigos de recuperación"
                className="m-0 grid grid-cols-1 gap-x-6 gap-y-2.5 rounded-md border border-dashed border-dashed/80 bg-background/40 p-4.5 sm:grid-cols-2"
              >
                {recoveryCodes.map((code, idx) => (
                  <li
                    key={code}
                    className="flex items-center gap-3 font-condensed text-[22px] font-bold tracking-wider text-foreground"
                  >
                    <span className="font-sans text-[13px] font-semibold text-muted-foreground">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span>{code}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCopyCodes}
                  className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-muted-foreground bg-card px-3.5 text-[15px] font-bold text-foreground transition-colors hover:bg-muted/30"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="8" y="8" width="12" height="12" rx="2" />
                    <path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" />
                  </svg>
                  {copiedCodes ? 'Copiados' : 'Copiar'}
                </button>

                <button
                  type="button"
                  onClick={handleDownloadCodes}
                  className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-sm border border-muted-foreground bg-card px-3.5 text-[15px] font-bold text-foreground transition-colors hover:bg-muted/30"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
                  </svg>
                  Descargar .txt
                </button>
              </div>

              <button
                type="button"
                role="checkbox"
                aria-checked={savedCodes}
                onClick={() => setSavedCodes(!savedCodes)}
                className="flex min-h-[44px] cursor-pointer items-center gap-3 self-start text-left text-base font-bold text-foreground"
              >
                <span
                  aria-hidden="true"
                  className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] border transition-colors ${
                    savedCodes
                      ? 'border-[#0F3B2C] bg-[#0F3B2C] text-background'
                      : 'border-foreground bg-white text-transparent'
                  }`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="3.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 12.5l4.5 4.5L19 7.5" />
                  </svg>
                </span>
                Los guardé en un lugar seguro
              </button>

              {savedCodes ? (
                <a
                  href={ADMIN_LANDING}
                  className="flex h-12 w-full items-center justify-center rounded-sm bg-accent text-base font-bold text-white transition-opacity hover:opacity-90"
                >
                  Continuar al panel
                </a>
              ) : (
                <div className="flex flex-col gap-1.5">
                  <button
                    type="button"
                    disabled
                    className="flex h-12 w-full cursor-not-allowed items-center justify-center rounded-sm bg-border text-base font-bold text-muted-foreground"
                  >
                    Continuar al panel
                  </button>
                  <span className="text-xs text-muted-foreground">
                    Marca la casilla para continuar.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
