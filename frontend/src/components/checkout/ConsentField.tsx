import { Checkbox } from '../ui/checkbox';

export interface ConsentFieldProps {
  checked: boolean;
  error?: string;
  onChange: (checked: boolean) => void;
}

export function ConsentField({ checked, error, onChange }: ConsentFieldProps) {
  return (
    <div className="flex flex-col gap-3 px-2">
      <Checkbox
        id="checkout-consent-data-policy"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        error={error}
        label="Autorizo a Monteluna a tratar mis datos personales para gestionar este pedido, según la Política de Tratamiento de Datos Personales."
        description={
          <span>
            Lee nuestra{' '}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              política de datos
            </a>{' '}
            y los{' '}
            <a href="#" className="underline underline-offset-2 hover:text-foreground">
              términos de compra
            </a>
            .
          </span>
        }
      />
    </div>
  );
}
