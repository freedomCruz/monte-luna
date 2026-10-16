import type { ReactNode } from 'react';

export interface RadioOption<T extends string = string> {
  value: T;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}

export interface RadioGroupProps<T extends string = string> {
  name: string;
  label?: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (value: T) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export function RadioGroup<T extends string = string>({
  name,
  label,
  options,
  value,
  onChange,
  orientation = 'horizontal',
  className = '',
}: RadioGroupProps<T>) {
  return (
    <fieldset
      className={`flex flex-col gap-2.5 border-0 p-0 m-0 ${className}`}
      aria-label={label}
    >
      {label && <legend className="text-base font-bold text-foreground mb-1">{label}</legend>}
      <div
        className={`flex ${
          orientation === 'horizontal' ? 'flex-wrap gap-4' : 'flex-col gap-3'
        }`}
      >
        {options.map((opt) => {
          const isSelected = opt.value === value;
          const optId = `${name}-${opt.value}`;
          return (
            <label
              key={opt.value}
              htmlFor={optId}
              className={`flex items-center gap-2.5 min-h-[44px] cursor-pointer select-none font-medium ${
                opt.disabled ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              <input
                id={optId}
                type="radio"
                name={name}
                value={opt.value}
                checked={isSelected}
                disabled={opt.disabled}
                onChange={() => onChange(opt.value)}
                className="w-5 h-5 accent-brand-green cursor-pointer"
              />
              <span className="flex flex-col">
                <span className="text-base text-foreground font-semibold">{opt.label}</span>
                {opt.description && (
                  <span className="text-xs text-muted-foreground">{opt.description}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
