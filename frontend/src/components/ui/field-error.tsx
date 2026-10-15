export interface FieldErrorProps {
  id?: string;
  error?: string;
  className?: string;
}

export function FieldError({ id, error, className = '' }: FieldErrorProps) {
  if (!error) return null;
  return (
    <span
      id={id}
      role="alert"
      className={`flex items-center gap-1.5 text-sm font-bold text-destructive ${className}`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        aria-hidden="true"
        className="shrink-0"
      >
        <circle cx="12" cy="12" r="9"></circle>
        <path d="M12 7.5v5.5M12 16.5v.2"></path>
      </svg>
      <span>{error}</span>
    </span>
  );
}
