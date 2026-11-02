import * as React from 'react';
import {
  changePassword,
  regenerateRecoveryCodes,
  type SecondFactorProof,
} from '../../../lib/admin/client';
import { ADMIN_ROUTES, roleLabel } from '../../../lib/admin/navigation';
import { useAdminSession } from '../shell/AdminShell';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return 'Primer ingreso';
  try {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d);
  } catch {
    return iso;
  }
}

function countCodePoints(str: string): number {
  return [...str].length;
}

export function AccountView() {
  const { user } = useAdminSession();

  // Change password form state
  const [currentPassword, setCurrentPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [repeatPassword, setRepeatPassword] = React.useState('');
  const [secondFactorCode, setSecondFactorCode] = React.useState('');
  const [isRecoveryCode, setIsRecoveryCode] = React.useState(false);
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordSuccessToast, setPasswordSuccessToast] = React.useState(false);
  const [changingPassword, setChangingPassword] = React.useState(false);

  // Recovery codes regeneration state
  const [showRegenerateDialog, setShowRegenerateDialog] = React.useState(false);
  const [regenPassword, setRegenPassword] = React.useState('');
  const [regenSecondFactor, setRegenSecondFactor] = React.useState('');
  const [regenIsRecovery, setRegenIsRecovery] = React.useState(false);
  const [regenError, setRegenError] = React.useState<string | null>(null);
  const [regenerating, setRegenerating] = React.useState(false);
  const [generatedCodes, setGeneratedCodes] = React.useState<string[] | null>(null);
  const [copiedCodes, setCopiedCodes] = React.useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccessToast(false);

    if (!currentPassword) {
      setPasswordError('Ingresa tu contraseña actual.');
      return;
    }

    const codePoints = countCodePoints(newPassword);
    if (codePoints < 12 || codePoints > 128) {
      setPasswordError('La nueva contraseña debe tener entre 12 y 128 caracteres.');
      return;
    }

    if (newPassword !== repeatPassword) {
      setPasswordError('Las contraseñas no coinciden.');
      return;
    }

    const cleanedFactor = secondFactorCode.trim();
    if (!cleanedFactor) {
      setPasswordError('Ingresa tu código de verificación en dos pasos.');
      return;
    }

    const proof: SecondFactorProof = isRecoveryCode || !/^\d{6}$/.test(cleanedFactor)
      ? { recovery_code: cleanedFactor }
      : { totp_code: cleanedFactor };

    setChangingPassword(true);
    const result = await changePassword({
      current_password: currentPassword,
      new_password: newPassword,
      second_factor: proof,
    });
    setChangingPassword(false);

    if (result.ok) {
      setCurrentPassword('');
      setNewPassword('');
      setRepeatPassword('');
      setSecondFactorCode('');
      setPasswordSuccessToast(true);
      return;
    }

    if (result.code === 'invalid_credentials') {
      setPasswordError('La contraseña o el código de verificación no son válidos.');
    } else if (result.code === 'authentication_required' || result.status === 401) {
      window.location.assign(ADMIN_ROUTES.signIn);
      return;
    } else if (result.code === 'forbidden' || result.status === 403) {
      window.location.assign('/admin/sin-acceso/');
      return;
    } else if (result.code === 'bad_request' || result.code === 'validation_failed') {
      setPasswordError('La nueva contraseña debe tener entre 12 y 128 caracteres.');
    } else if (result.code === 'rate_limited' || result.status === 429) {
      setPasswordError('Demasiados intentos. Inténtalo de nuevo más tarde.');
    } else if (result.code === 'network_error') {
      setPasswordError('Error de conexión. Inténtalo de nuevo.');
    } else {
      setPasswordError('No se pudo cambiar la contraseña. Inténtalo de nuevo.');
    }
  };

  const handleRegenerateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegenError(null);

    if (!regenPassword) {
      setRegenError('Ingresa tu contraseña actual.');
      return;
    }
    const factorClean = regenSecondFactor.trim();
    if (!factorClean) {
      setRegenError('Ingresa tu código de verificación.');
      return;
    }

    const proof: SecondFactorProof = regenIsRecovery || !/^\d{6}$/.test(factorClean)
      ? { recovery_code: factorClean }
      : { totp_code: factorClean };

    setRegenerating(true);
    const result = await regenerateRecoveryCodes({
      current_password: regenPassword,
      second_factor: proof,
    });
    setRegenerating(false);

    if (result.ok) {
      setGeneratedCodes(result.data.recovery_codes);
      setRegenPassword('');
      setRegenSecondFactor('');
      return;
    }

    if (result.code === 'invalid_credentials') {
      setRegenError('La contraseña o el código de verificación no son válidos.');
    } else if (result.code === 'authentication_required' || result.status === 401) {
      window.location.assign(ADMIN_ROUTES.signIn);
      return;
    } else if (result.code === 'forbidden' || result.status === 403) {
      window.location.assign('/admin/sin-acceso/');
      return;
    } else if (result.code === 'rate_limited' || result.status === 429) {
      setRegenError('Demasiados intentos. Inténtalo de nuevo más tarde.');
    } else {
      setRegenError('No se pudieron generar los códigos. Inténtalo de nuevo.');
    }
  };

  const closeDialog = () => {
    setShowRegenerateDialog(false);
    setRegenPassword('');
    setRegenSecondFactor('');
    setRegenError(null);
    setGeneratedCodes(null);
    setCopiedCodes(false);
  };

  const copyCodes = async () => {
    if (!generatedCodes) return;
    try {
      await navigator.clipboard.writeText(generatedCodes.join('\n'));
      setCopiedCodes(true);
      setTimeout(() => setCopiedCodes(false), 3000);
    } catch {
      // fallback ignore
    }
  };

  return (
    <main className="flex w-full max-w-[1080px] flex-1 flex-col gap-5 px-4 py-7 min-[768px]:px-6 min-[1024px]:px-8 min-[1440px]:py-7">
      <div className="flex flex-col gap-1">
        <h1 className="m-0 text-[32px] font-extrabold leading-[1.1] tracking-[-0.01em]">Mi cuenta</h1>
        <p className="m-0 text-[15px] text-muted-foreground">
          Tu acceso al panel. Para cambiar tu nombre, correo o rol, habla con la persona propietaria.
        </p>
      </div>

      {/* Profile data section */}
      <section
        aria-label="Tus datos"
        className="flex flex-wrap gap-4 rounded-xl border border-border bg-card p-5 min-[768px]:gap-10 min-[768px]:p-6"
      >
        <span className="flex flex-col gap-0.5">
          <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Nombre
          </span>
          <span className="text-base font-bold">{user.display_name}</span>
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Correo
          </span>
          <span className="text-base font-bold">{user.email}</span>
        </span>
        <span className="flex flex-col gap-1">
          <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Rol
          </span>
          <span className="inline-flex h-[26px] items-center self-start rounded-sm border border-foreground px-2.5 text-[13px] font-bold">
            {roleLabel(user.role)}
          </span>
        </span>
        <span className="flex flex-col gap-0.5">
          <span className="font-condensed text-[13px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
            Último ingreso
          </span>
          <span className="text-base font-bold">{formatDate(user.last_login_at)}</span>
        </span>
      </section>

      {/* Two columns: Change password & 2FA */}
      <div className="flex flex-wrap items-start gap-5">
        {/* Cambiar contraseña */}
        <section
          aria-labelledby="h-clave"
          className="flex min-w-[320px] flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-6"
        >
          <h2 id="h-clave" className="m-0 text-[22px] font-extrabold">
            Cambiar contraseña
          </h2>
          <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Contraseña actual</span>
              <input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="h-11 rounded-sm border border-foreground bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                aria-describedby="reglas-c"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-11 rounded-sm border border-foreground bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
              />
              <span id="reglas-c" className="text-[13px] leading-[1.4] text-muted-foreground">
                Entre 12 y 128 caracteres.
              </span>
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-sm font-bold">Repite la nueva contraseña</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                value={repeatPassword}
                onChange={(e) => setRepeatPassword(e.target.value)}
                className="h-11 rounded-sm border border-foreground bg-card px-3 text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="flex items-center justify-between">
                <span className="text-sm font-bold">Código de verificación</span>
                <button
                  type="button"
                  onClick={() => setIsRecoveryCode((prev) => !prev)}
                  className="border-0 bg-transparent p-0 text-xs font-semibold text-accent underline cursor-pointer"
                >
                  {isRecoveryCode ? 'Usar app autenticadora' : 'Usar código de recuperación'}
                </button>
              </span>
              <input
                type="text"
                inputMode={isRecoveryCode ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                placeholder={isRecoveryCode ? 'Código de recuperación' : '6 dígitos de tu app'}
                required
                value={secondFactorCode}
                onChange={(e) => setSecondFactorCode(e.target.value)}
                className="h-11 rounded-sm border border-foreground bg-card px-3 font-mono text-[15px] text-foreground focus:outline-none focus:ring-2 focus:ring-foreground"
              />
            </label>

            <p className="m-0 text-sm leading-[1.45] text-muted-foreground">
              Al cambiarla se cierran tus otras sesiones abiertas.
            </p>

            {passwordError && (
              <div role="alert" className="rounded-sm border border-destructive bg-destructive/10 p-3 text-sm font-bold text-destructive">
                {passwordError}
              </div>
            )}

            <button
              type="submit"
              disabled={changingPassword}
              className="inline-flex min-h-11 self-start items-center rounded-sm border-0 bg-accent px-4 font-sans text-[15px] font-bold text-white hover:bg-[#A51F26] disabled:opacity-50 cursor-pointer"
            >
              {changingPassword ? 'Cambiando contraseña…' : 'Cambiar contraseña'}
            </button>
          </form>
        </section>

        {/* Verificación en dos pasos */}
        <section
          aria-labelledby="h-2fa"
          className="flex min-w-[320px] flex-1 flex-col gap-4 rounded-xl border border-border bg-card p-6"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="h-2fa" className="m-0 text-[22px] font-extrabold">
              Verificación en dos pasos
            </h2>
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-sm bg-[#1E6B45] px-2.5 text-[13px] font-bold text-white">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-white" />
              Activa
            </span>
          </div>

          <p className="m-0 text-[15px] leading-[1.5]">
            {user.totp_confirmed_at
              ? `Activa desde el ${formatDate(user.totp_confirmed_at)} con tu app autenticadora.`
              : 'Activa con tu app autenticadora.'}
          </p>

          <div className="flex flex-col gap-1 rounded-xl bg-background p-4">
            <span className="text-[15px] font-bold">Códigos de recuperación de un solo uso</span>
            <span className="text-[13px] text-muted-foreground">
              Úsalos para ingresar si pierdes acceso a tu app autenticadora. Cada código sirve una sola vez.
            </span>
          </div>

          <button
            type="button"
            onClick={() => {
              setShowRegenerateDialog(true);
              setRegenError(null);
              setGeneratedCodes(null);
            }}
            className="inline-flex min-h-11 self-start items-center rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground hover:bg-primary/90 cursor-pointer"
          >
            Generar códigos nuevos
          </button>

          <p className="m-0 text-sm leading-[1.45] text-muted-foreground">
            Si cambias de teléfono, pide a una persona propietaria que restablezca tu verificación; al entrar la activarás de nuevo.
          </p>
        </section>
      </div>

      {/* Recovery codes dialog */}
      {showRegenerateDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/50 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="h-dlg"
            aria-describedby="p-dlg"
            className="flex w-full max-w-[480px] flex-col gap-3 rounded-2xl bg-card p-6 shadow-2xl"
          >
            {!generatedCodes ? (
              <form onSubmit={handleRegenerateSubmit} className="flex flex-col gap-3">
                <h2 id="h-dlg" className="m-0 text-xl font-extrabold">
                  ¿Generar códigos de recuperación nuevos?
                </h2>
                <p id="p-dlg" className="m-0 text-[15px] leading-[1.5] text-muted-foreground">
                  Los códigos anteriores dejarán de funcionar al instante. Verás los nuevos una sola vez y tendrás que guardarlos.
                </p>

                <label className="flex flex-col gap-1">
                  <span className="text-sm font-bold">Contraseña actual</span>
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={regenPassword}
                    onChange={(e) => setRegenPassword(e.target.value)}
                    className="h-11 rounded-sm border border-foreground bg-card px-3 text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="flex items-center justify-between">
                    <span className="text-sm font-bold">Código de verificación</span>
                    <button
                      type="button"
                      onClick={() => setRegenIsRecovery((prev) => !prev)}
                      className="border-0 bg-transparent p-0 text-xs font-semibold text-accent underline cursor-pointer"
                    >
                      {regenIsRecovery ? 'Usar app autenticadora' : 'Usar código actual'}
                    </button>
                  </span>
                  <input
                    type="text"
                    name="second_factor"
                    inputMode={regenIsRecovery ? 'text' : 'numeric'}
                    placeholder={regenIsRecovery ? 'Código de recuperación actual' : '6 dígitos de tu app'}
                    required
                    value={regenSecondFactor}
                    onChange={(e) => setRegenSecondFactor(e.target.value)}
                    className="h-11 rounded-sm border border-foreground bg-card px-3 font-mono text-[15px] focus:outline-none focus:ring-2 focus:ring-foreground"
                  />
                </label>

                {regenError && (
                  <div role="alert" className="rounded-sm border border-destructive bg-destructive/10 p-2.5 text-sm font-bold text-destructive">
                    {regenError}
                  </div>
                )}

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="h-11 rounded-sm border border-foreground bg-card px-3.5 font-sans text-[15px] font-bold text-foreground cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={regenerating}
                    className="h-11 rounded-sm border-0 bg-accent px-3.5 font-sans text-[15px] font-bold text-white hover:bg-[#A51F26] disabled:opacity-50 cursor-pointer"
                  >
                    {regenerating ? 'Generando…' : 'Generar nuevos códigos'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="flex flex-col gap-3">
                <h2 id="h-dlg" className="m-0 text-xl font-extrabold">
                  Tus nuevos códigos de recuperación
                </h2>
                <p id="p-dlg" className="m-0 text-[15px] leading-[1.5] text-muted-foreground">
                  Guarda estos códigos ahora en un lugar seguro. No volverán a mostrarse.
                </p>

                <div className="grid grid-cols-2 gap-2 rounded-xl bg-background p-4 font-mono text-[15px] font-bold">
                  {generatedCodes.map((code) => (
                    <div key={code} className="p-1 tracking-wider">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={copyCodes}
                    className="h-11 rounded-sm border border-foreground bg-card px-3.5 font-sans text-[15px] font-bold text-foreground cursor-pointer"
                  >
                    {copiedCodes ? '¡Códigos copiados!' : 'Copiar códigos'}
                  </button>
                  <button
                    type="button"
                    onClick={closeDialog}
                    className="h-11 rounded-sm border-0 bg-primary px-3.5 font-sans text-[15px] font-bold text-primary-foreground cursor-pointer"
                  >
                    Listo, ya los guardé
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toast notification */}
      {passwordSuccessToast && (
        <div
          role="status"
          className="fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl bg-primary px-4 py-3.5 text-primary-foreground shadow-2xl"
        >
          <span className="inline-flex size-7 items-center justify-center rounded-full bg-[#1E6B45]">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>
          <span className="text-[15px] font-bold">Contraseña cambiada. Cerramos tus otras sesiones.</span>
          <button
            type="button"
            onClick={() => setPasswordSuccessToast(false)}
            aria-label="Cerrar aviso"
            className="ml-2 border-0 bg-transparent text-primary-foreground/70 hover:text-primary-foreground cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}
    </main>
  );
}
