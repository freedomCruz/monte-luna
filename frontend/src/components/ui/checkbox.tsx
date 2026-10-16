import type { InputHTMLAttributes, ReactNode } from 'react';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: ReactNode;
  error?: string;
}

export function Checkbox({
  id,
  label,
  description,
  error,
  checked,
  className = '',
  onChange,
  disabled,
  ...props
}: CheckboxProps) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={id}
        className={`flex items-start gap-3 min-h-[44px] cursor-pointer text-left select-none ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      >
        <span className="relative flex items-center justify-center shrink-0 mt-0.5">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={onChange}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error && id ? `${id}-error` : undefined}
            className="peer sr-only"
            {...props}
          />
          <span
            aria-hidden="true"
            className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center transition-colors ${
              checked
                ? 'border-brand-green bg-brand-green text-primary-foreground'
                : error
                  ? 'border-destructive bg-card'
                  : 'border-foreground bg-card'
            } peer-focus-visible:ring-2 peer-focus-visible:ring-foreground peer-focus-visible:ring-offset-2`}
          >
            {checked && (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 12.5l4.5 4.5L19 7.5"></path>
              </svg>
            )}
          </span>
        </span>
        <div className="flex flex-col">
          <span className="text-base font-semibold leading-snug text-foreground">{label}</span>
          {description && (
            <span className="text-sm text-muted-foreground leading-normal">{description}</span>
          )}
        </div>
      </label>
      {error && (
        <span
          id={id ? `${id}-error` : undefined}
          role="alert"
          className="pl-10 text-sm font-bold text-destructive flex items-center gap-1.5"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9"></circle>
            <path d="M12 7.5v5.5M12 16.5v.2"></path>
          </svg>
          {error}
        </span>
      )}
    </div>
  );
}
