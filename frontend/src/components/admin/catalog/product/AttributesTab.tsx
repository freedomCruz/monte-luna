import type { AdminAttributeDefinition } from '../../../../lib/admin/catalog';
import { attributeDefinitions, type ProductForm } from '../../../../lib/admin/product-form';
import { CARD, FieldError, SelectBox, fieldClass } from './fields';

interface AttributesTabProps {
  typeName: string;
  definitions: AdminAttributeDefinition[];
  form: ProductForm;
  errors: Record<string, string>;
  onChange: (key: string, value: string | string[]) => void;
}

function hint(definition: AdminAttributeDefinition): string | undefined {
  if (definition.data_type === 'multi_option') return 'Puedes elegir varias.';
  return definition.unit ? `Unidad: ${definition.unit}.` : undefined;
}

function AttributeControl({ definition, value, error, onChange }: { definition: AdminAttributeDefinition; value: string | string[]; error?: string; onChange: (value: string | string[]) => void }) {
  const id = `attr-${definition.key}`;
  if (definition.data_type === 'multi_option') {
    const selected = Array.isArray(value) ? value : [];
    return (
      <fieldset aria-label={definition.label} className="m-0 flex min-h-11 flex-wrap items-center gap-1.5 rounded-sm border border-muted-foreground p-1 px-1.5">
        {(definition.allowed_values ?? []).map((option) => {
          const on = selected.includes(option.value);
          return (
            <label key={option.value} className={`inline-flex h-[30px] cursor-pointer items-center rounded-[6px] px-2.5 text-sm font-bold has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-foreground ${on ? 'bg-brand-green text-background' : 'bg-secondary text-foreground'}`}>
              <input type="checkbox" checked={on} onChange={() => onChange(on ? selected.filter((item) => item !== option.value) : [...selected, option.value])} className="sr-only" />
              {option.label}
            </label>
          );
        })}
      </fieldset>
    );
  }
  if (definition.data_type === 'option' || definition.data_type === 'boolean') {
    const options = definition.data_type === 'boolean' ? [{ value: 'true', label: 'Sí' }, { value: 'false', label: 'No' }] : (definition.allowed_values ?? []);
    return (
      <SelectBox id={id} value={typeof value === 'string' ? value : ''} invalid={Boolean(error)} onChange={(event) => onChange(event.target.value)}>
        <option value="">{definition.is_required ? 'Elige una' : 'Sin definir'}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </SelectBox>
    );
  }
  return (
    <input id={id} type="text" inputMode={definition.data_type === 'text' ? undefined : 'decimal'} value={typeof value === 'string' ? value : ''} aria-invalid={Boolean(error) || undefined} onChange={(event) => onChange(event.target.value)} className={fieldClass(error)} />
  );
}

/** Atributos tab (A-Producto): the descriptive fields defined by the product type. */
export function AttributesTab({ typeName, definitions, form, errors, onChange }: AttributesTabProps) {
  const fields = attributeDefinitions(definitions);
  return (
    <section role="tabpanel" aria-label="Atributos" className={`${CARD} gap-[18px] p-6`}>
      <div className="flex items-start gap-2.5 rounded-md bg-secondary px-3.5 py-3 text-sm leading-[1.45]">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="flex-none"><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 7.5v.2" /></svg>
        <span>Estos campos los define el tipo de producto «{typeName}».</span>
      </div>
      {fields.length === 0 ? (
        <p className="m-0 text-[15px] text-muted-foreground">Este tipo de producto no define atributos descriptivos.</p>
      ) : (
        <div className="grid grid-cols-1 gap-x-5 gap-y-[18px] min-[1024px]:grid-cols-2">
          {fields.map((definition) => (
            <div key={definition.key} className="flex flex-col gap-1.5">
              <label htmlFor={`attr-${definition.key}`} className="text-sm font-bold">{definition.label}{!definition.is_required && <span className="font-medium text-muted-foreground"> (opcional)</span>}</label>
              <AttributeControl definition={definition} value={form.attributes[definition.key] ?? ''} error={errors[definition.key]} onChange={(value) => onChange(definition.key, value)} />
              {hint(definition) && <span className="text-[13px] text-muted-foreground">{hint(definition)}</span>}
              <FieldError>{errors[definition.key]}</FieldError>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
