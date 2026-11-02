import * as React from 'react';
import { completePasswordReset } from '../../../lib/admin/client';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';
import { PasswordCardFrame } from './PasswordCardFrame';
import { extractAndClearToken, validatePasswordLength } from './password-utils';

export interface SetPasswordFormProps {
  mode?: 'reset' | 'invitation';
  initialToken?: string | null;
}

export function SetPasswordForm({ mode = 'reset', initialToken }: SetPasswordFormProps) {
  // Read once after mount so React Strict Mode cannot consume and discard the
  // fragment during its development double-render. The token remains in memory only.
  const extraction = React.useRef(false);
  const [token, setToken] = React.useState<string | null | undefined>(initialToken);
  const [tokenRejected, setTokenRejected] = React.useState(false);
  React.useEffect(() => {
    if (initialToken !== undefined || extraction.current) return;
    extraction.current = true;
    setToken(extractAndClearToken());
  }, [initialToken]);

  const [password, setPassword] = React.useState('');
  const [repeatPassword, setRepeatPassword] = React.useState('');
  const [showPassword, setShowPassword] = React.useState(false);
  const [showRepeatPassword, setShowRepeatPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [isSuccess, setIsSuccess] = React.useState(false);

  // S2: enforce strictly 12 to 128 Unicode code points
  const isLengthValid = validatePasswordLength(password);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!token) {
      setTokenRejected(true);
      return;
    }

    if (!isLengthValid) {
      setErrorMessage('La contraseña debe tener entre 12 y 128 caracteres.');
      return;
    }

    if (password !== repeatPassword) {
      setErrorMessage('Las contraseñas no coinciden.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await completePasswordReset(token, password);
    setLoading(false);

    if (res.ok) {
      setIsSuccess(true);
    } else {
      if (res.code === 'invalid_reset_token' || res.status === 422) {
        setTokenRejected(true);
      } else if (res.code === 'rate_limited') {
        setErrorMessage('Demasiados intentos. Por favor espera unos minutos antes de intentar de nuevo.');
      } else if (res.code === 'network_error') {
        setErrorMessage('No fue posible conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      } else {
        setErrorMessage('Ocurrió un error al guardar la contraseña. Por favor intenta de nuevo.');
      }
    }
  };

  if (token === undefined) {
    return <PasswordCardFrame><p role="status" className="m-0 font-bold text-muted-foreground">Comprobando el enlace…</p></PasswordCardFrame>;
  }

  // State: Token invalid or expired (vencido)
  if (token === null || tokenRejected) {
    return (
      <PasswordCardFrame>
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        </span>

        <h1 className="m-0 text-[30px] font-extrabold leading-[1.05]">Este enlace ya no sirve</h1>

        <p className="m-0 text-base leading-normal text-foreground">
          Los enlaces duran 30 minutos y se usan una sola vez. Pide uno nuevo y ábrelo desde el último correo.
        </p>

        <a
          href={ADMIN_ROUTES.forgotPassword}
          className="flex h-12 items-center justify-center rounded-sm bg-accent font-sans text-base font-bold text-white no-underline transition-opacity hover:opacity-90"
        >
          Pedir un enlace nuevo
        </a>
      </PasswordCardFrame>
    );
  }

  // State: Password reset successfully completed
  if (isSuccess) {
    return (
      <PasswordCardFrame showBackLink={false}>
        <span className="inline-flex size-14 items-center justify-center rounded-full bg-secondary">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="20 6 9 17 4 12" />
          </svg>
        </span>

        <h1 className="m-0 text-[30px] font-extrabold leading-[1.05]">Contraseña guardada</h1>

        <p className="m-0 text-base leading-normal text-muted-foreground">
          Tu contraseña ha sido guardada con éxito. Ya puedes iniciar sesión en el panel de administración.
        </p>

        <a
          href={ADMIN_ROUTES.signIn}
          className="flex h-12 items-center justify-center rounded-sm bg-accent font-sans text-base font-bold text-white no-underline transition-opacity hover:opacity-90"
        >
          Iniciar sesión
        </a>
      </PasswordCardFrame>
    );
  }

  // State: Create new password (nueva)
  const heading = mode === 'invitation' ? 'Crea tu contraseña' : 'Crea tu nueva contraseña';
  const helperText =
    mode === 'invitation'
      ? 'Al guardarla podrás iniciar sesión con tus credenciales en el panel.'
      : 'Al guardarla se cierran todas tus sesiones abiertas, también en otros dispositivos.';

  return (
    <PasswordCardFrame>
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05]">{heading}</h1>

      {errorMessage && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border-2 border-destructive p-3 text-[15px] font-bold text-foreground"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            aria-hidden="true"
            className="shrink-0 text-destructive"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7.5v5.5M12 16.5v.2" />
          </svg>
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="m-0 flex flex-col gap-5">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">
            {mode === 'invitation' ? 'Contraseña' : 'Nueva contraseña'}
          </span>
          <span className="box-border flex h-11 items-center rounded-sm border border-muted-foreground bg-card focus-within:outline-3 focus-within:outline-foreground focus-within:outline-offset-2">
            <input
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              aria-describedby="reglas"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="box-border h-full min-w-0 flex-1 border-0 bg-transparent px-3 font-sans text-base text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-pressed={showPassword}
              className="box-border h-full cursor-pointer border-0 border-l border-border bg-transparent px-3 font-sans text-sm font-bold text-foreground hover:bg-secondary"
            >
              {showPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
        </label>

        {/* S2: Enforce strictly 12-128 characters; omit unapproved canvas rules */}
        <ul
          id="reglas"
          aria-label="Requisitos de la contraseña"
          className="m-0 flex list-none flex-col gap-2 rounded-md bg-background p-3.5"
        >
          <li className="flex items-center gap-2.5 text-sm font-semibold">
            <span
              aria-hidden="true"
              className={`box-border inline-flex size-5 items-center justify-center rounded-full border-2 text-xs font-extrabold ${
                isLengthValid
                  ? 'border-success bg-success text-white'
                  : 'border-muted-foreground bg-card text-transparent'
              }`}
            >
              {isLengthValid ? '✓' : ''}
            </span>
            <span>Entre 12 y 128 caracteres</span>
            <span className="sr-only">{isLengthValid ? ': cumplido' : ': pendiente'}</span>
          </li>
        </ul>

        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-bold text-foreground">Repite la contraseña</span>
          <span className="box-border flex h-11 items-center rounded-sm border border-muted-foreground bg-card focus-within:outline-3 focus-within:outline-foreground focus-within:outline-offset-2">
            <input
              type={showRepeatPassword ? 'text' : 'password'}
              autoComplete="new-password"
              value={repeatPassword}
              onChange={(e) => setRepeatPassword(e.target.value)}
              required
              className="box-border h-full min-w-0 flex-1 border-0 bg-transparent px-3 font-sans text-base text-foreground outline-none"
            />
            <button
              type="button"
              onClick={() => setShowRepeatPassword((prev) => !prev)}
              aria-pressed={showRepeatPassword}
              className="box-border h-full cursor-pointer border-0 border-l border-border bg-transparent px-3 font-sans text-sm font-bold text-foreground hover:bg-secondary"
            >
              {showRepeatPassword ? 'Ocultar' : 'Mostrar'}
            </button>
          </span>
        </label>

        <p className="m-0 text-sm leading-normal text-muted-foreground">{helperText}</p>

        <button
          type="submit"
          disabled={loading}
          className="flex h-12 cursor-pointer items-center justify-center rounded-sm border-0 bg-accent font-sans text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </PasswordCardFrame>
  );
}
