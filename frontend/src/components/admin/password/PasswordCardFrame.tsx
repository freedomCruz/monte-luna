import * as React from 'react';
import { ADMIN_ROUTES } from '../../../lib/admin/navigation';

export interface PasswordCardFrameProps {
  children: React.ReactNode;
  showBackLink?: boolean;
}

export function PasswordCardFrame({ children, showBackLink = true }: PasswordCardFrameProps) {
  return (
    <div className="box-border flex min-h-screen w-full flex-col items-center gap-10 bg-background px-4 pb-16 pt-8 font-sans text-foreground">
      <header className="flex w-full max-w-[1320px] items-center gap-2.5">
        <span className="rounded-sm bg-brand-yellow px-3 py-1.5 font-condensed text-[26px] font-extrabold uppercase leading-none text-foreground">
          Monteluna
        </span>
        <span className="font-condensed text-[15px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          Admin
        </span>
      </header>

      <main className="box-border flex w-full max-w-[480px] flex-col gap-5 rounded-xl border border-border bg-card p-6 min-[480px]:p-9">
        {children}

        {showBackLink && (
          <a
            href={ADMIN_ROUTES.signIn}
            className="inline-flex min-h-11 items-center border-t border-border pt-1.5 text-[15px] font-semibold text-muted-foreground no-underline underline-offset-4 hover:text-accent"
          >
            ← Volver a iniciar sesión
          </a>
        )}
      </main>
    </div>
  );
}
