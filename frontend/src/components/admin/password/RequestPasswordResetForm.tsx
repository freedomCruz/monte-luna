import * as React from 'react';
import { requestPasswordReset } from '../../../lib/admin/client';
import { PasswordCardFrame } from './PasswordCardFrame';

export function RequestPasswordResetForm() {
  const [step, setStep] = React.useState<'pedir' | 'enviado'>('pedir');
  const [email, setEmail] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.SyntheticEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email || !email.includes('@')) {
      setErrorMessage('Ingresa un correo electrónico válido.');
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const res = await requestPasswordReset(email.trim().toLowerCase());
    setLoading(false);

    if (res.ok) {
      // Uniform response: always transitions to 'enviado' without revealing whether the email exists
      setStep('enviado');
    } else {
      if (res.code === 'rate_limited') {
        setErrorMessage('Demasiados intentos. Por favor espera unos minutos antes de intentar de nuevo.');
      } else if (res.code === 'network_error') {
        setErrorMessage('No fue posible conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      } else {
        setErrorMessage('Ocurrió un error al procesar la solicitud. Por favor intenta de nuevo.');
      }
    }
  };

  const handleAskAgain = () => {
    setErrorMessage(null);
    setStep('pedir');
  };

  if (step === 'enviado') {
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
            <path d="M3 6h18v12H3zM3 7l9 6 9-6" />
          </svg>
        </span>

        <h1 className="m-0 text-[30px] font-extrabold leading-[1.05]">Revisa tu correo</h1>

        <p role="status" className="m-0 text-base leading-normal">
          Si ese correo pertenece a una cuenta del panel, te llegará un enlace en unos minutos. El enlace dura{' '}
          <span className="font-extrabold">30 minutos</span> y sirve una sola vez.
        </p>

        <p className="m-0 text-sm leading-normal text-muted-foreground">
          ¿No llega? Revisa la carpeta de spam. Si pides otro enlace, el anterior deja de funcionar.
        </p>

        <button
          type="button"
          onClick={handleAskAgain}
          className="cursor-pointer self-start border-0 bg-transparent p-0 font-sans text-[15px] font-bold text-foreground underline underline-offset-4 hover:text-accent"
        >
          Pedir otro enlace
        </button>
      </PasswordCardFrame>
    );
  }

  return (
    <PasswordCardFrame>
      <h1 className="m-0 text-[30px] font-extrabold leading-[1.05]">Recupera tu contraseña</h1>

      <p className="m-0 text-base leading-normal text-muted-foreground">
        Escribe el correo con el que entras al panel y te enviaremos un enlace para crear una contraseña nueva.
      </p>

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
          <span className="text-sm font-bold text-foreground">Correo</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="box-border h-11 rounded-sm border border-muted-foreground bg-card px-3 font-sans text-base text-foreground outline-none focus-visible:outline-3 focus-visible:outline-foreground focus-visible:outline-offset-2"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="flex h-12 cursor-pointer items-center justify-center rounded-sm border-0 bg-accent font-sans text-base font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </PasswordCardFrame>
  );
}
