import React from 'react';
import { FieldError } from './field-error';

export interface FormSelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  containerClassName?: string;
  children: React.ReactNode;
}

export function FormSelect({
  id,
  label,
  optional = false,
  error,
  className = '',
  containerClassName = '',
  children,
  ...props
}: FormSelectProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`flex flex-col gap-2 ${containerClassName}`}>
      <label htmlFor={id} className="text-base font-bold">
        {label}{' '}
        {optional && (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        )}
      </label>
      <div className="relative">
        <select
          id={id}
          aria-invalid={Boolean(error)}
          aria-describedby={errorId}
          className={`w-full h-14 px-4 pr-10 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground appearance-none cursor-pointer ${
            error ? 'border-destructive' : 'border-foreground'
          } ${className}`}
          {...props}
        >
          {children}
        </select>
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground text-sm"
        >
          ▼
        </span>
      </div>
      <FieldError id={errorId} error={error} />
    </div>
  );
}
