import React from 'react';
import { FieldError } from './field-error';

export interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  id: string;
  label: string;
  optional?: boolean;
  error?: string;
  containerClassName?: string;
}

export function FormInput({
  id,
  label,
  optional = false,
  error,
  className = '',
  containerClassName = '',
  ...props
}: FormInputProps) {
  const errorId = error ? `${id}-error` : undefined;

  return (
    <div className={`flex flex-col gap-2 ${containerClassName}`}>
      <label htmlFor={id} className="text-base font-bold">
        {label}{' '}
        {optional && (
          <span className="font-normal text-muted-foreground">(opcional)</span>
        )}
      </label>
      <input
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={errorId}
        className={`w-full h-14 px-4 border-2 rounded-xl bg-card text-foreground font-medium text-lg outline-none focus:border-foreground ${
          error ? 'border-destructive' : 'border-foreground'
        } ${className}`}
        {...props}
      />
      <FieldError id={errorId} error={error} />
    </div>
  );
}
