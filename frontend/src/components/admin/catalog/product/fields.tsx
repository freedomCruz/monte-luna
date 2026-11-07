import * as React from 'react';

// Form controls of the Producto screen (A-Producto): 44 px fields, 8 px radius, the
// 2 px red border and message for invalid values, and the chevron select.

export const FIELD = 'h-11 w-full rounded-sm border border-muted-foreground bg-card px-3 font-sans text-[15px] text-foreground';
export const FIELD_INVALID = 'h-11 w-full rounded-sm border-2 border-destructive bg-card px-3 font-sans text-[15px] text-foreground';
export const OUTLINE_BUTTON = 'inline-flex h-11 cursor-pointer items-center justify-center gap-1.5 rounded-sm border border-muted-foreground bg-card px-3.5 font-sans text-[15px] font-bold text-foreground no-underline disabled:cursor-not-allowed disabled:opacity-60';
export const RED_BUTTON = 'inline-flex h-11 cursor-pointer items-center justify-center rounded-sm border-0 bg-accent px-[18px] font-sans text-[15px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-60';
export const CARD = 'flex flex-col rounded-md border border-border bg-card';

export function fieldClass(error?: string): string {
  return error ? FIELD_INVALID : FIELD;
}

export function FieldError({ children }: { children?: string }) {
  return children ? <span role="alert" className="text-[13px] font-bold text-destructive">{children}</span> : null;
}

interface FieldProps {
  label: string;
  optional?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}

/** Label, control, optional hint and error of one field. */
export function Field({ label, optional, hint, error, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-bold">{label}{optional && <span className="font-medium text-muted-foreground"> (opcional)</span>}</span>
        {children}
      </label>
      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
      <FieldError>{error}</FieldError>
    </div>
  );
}

export const SelectBox = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }>(function SelectBox({ invalid, className, children, ...props }, ref) {
  return (
    <span className="relative block">
      <select ref={ref} aria-invalid={invalid || undefined} {...props} className={`${invalid ? FIELD_INVALID : FIELD} appearance-none pr-9 ${className ?? ''}`}>{children}</select>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="pointer-events-none absolute right-3 top-3.5"><path d="M6 9l6 6 6-6" /></svg>
    </span>
  );
});

/** Currency field with the "$" prefix of the variants table. */
export function MoneyInput({ value, onChange, label, invalid, placeholder }: { value: string; onChange: (value: string) => void; label: string; invalid?: boolean; placeholder?: string }) {
  return (
    <span className={`flex h-11 w-[118px] items-center overflow-hidden rounded-sm ${invalid ? 'border-2 border-destructive' : 'border border-muted-foreground'}`}>
      <span className="inline-flex items-center self-stretch bg-secondary px-2 font-bold">$</span>
      <input type="text" inputMode="numeric" value={value} placeholder={placeholder} aria-label={label} aria-invalid={invalid || undefined} onChange={(event) => onChange(event.target.value)} className="h-full min-w-0 flex-1 border-0 bg-card px-2 text-right font-sans text-sm font-bold text-foreground" />
    </span>
  );
}
