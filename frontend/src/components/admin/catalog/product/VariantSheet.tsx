import * as React from 'react';
import type { AdminAttributeDefinition } from '../../../../lib/admin/catalog';
import { TAX_CATEGORIES, emptyVariantForm, validateVariant, variantOptionDefinitions, type TaxCategory, type VariantErrors, type VariantForm } from '../../../../lib/admin/product-form';
import { AdminSheet } from '../../shared/AdminSheet';
import { Field, FieldError, OUTLINE_BUTTON, RED_BUTTON, SelectBox, fieldClass } from './fields';

type Props =
  | { mode: 'edit'; title: string; form: VariantForm; onApply: (form: VariantForm) => void; onClose: () => void }
  | { mode: 'create'; definitions: AdminAttributeDefinition[]; onCreate: (form: VariantForm) => Promise<string | null>; onClose: () => void };

const TAX_HINT = 'La tarifa la aplica el sistema según la ley vigente.';

function TaxField({ value, error, onChange }: { value: VariantForm['tax']; error?: string; onChange: (tax: TaxCategory | '') => void }) {
  return (
    <Field label="Categoría de impuesto" hint={TAX_HINT} error={error}>
      <SelectBox value={value} invalid={Boolean(error)} onChange={(event) => onChange(event.target.value as TaxCategory | '')}>
        <option value="">Elige una</option>
        {TAX_CATEGORIES.map((tax) => <option key={tax.value} value={tax.value}>{tax.label}</option>)}
      </SelectBox>
    </Field>
  );
}

/** Variant Sheet (A-Producto "Variante"): the tablet "Más" fields, or a new variant. */
export function VariantSheet(props: Props) {
  const creating = props.mode === 'create';
  const [form, setForm] = React.useState<VariantForm>(() => (props.mode === 'edit' ? props.form : emptyVariantForm()));
  const [errors, setErrors] = React.useState<VariantErrors & { options?: Record<string, string>; form?: string }>({});
  const [saving, setSaving] = React.useState(false);
  const patch = (next: Partial<VariantForm>) => setForm((current) => ({ ...current, ...next }));
  const axes = props.mode === 'create' ? variantOptionDefinitions(props.definitions) : [];

  const submit = async () => {
    if (props.mode === 'edit') {
      props.onApply(form);
      props.onClose();
      return;
    }
    const next: typeof errors = validateVariant(form);
    const missing = Object.fromEntries(axes.filter((axis) => !form.options[axis.key]).map((axis) => [axis.key, 'Elige una opción.']));
    if (Object.keys(missing).length > 0) next.options = missing;
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    setSaving(true);
    const failure = await props.onCreate(form);
    setSaving(false);
    if (failure) setErrors({ form: failure });
  };

  return (
    <AdminSheet
      kicker="Variante"
      title={props.mode === 'edit' ? props.title : 'Nueva variante'}
      onClose={props.onClose}
      footer={
        <>
          <button type="button" onClick={props.onClose} className={OUTLINE_BUTTON}>Cancelar</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className={RED_BUTTON}>{creating ? 'Crear variante' : 'Aplicar'}</button>
        </>
      }
    >
      {axes.map((axis) => (
        <Field key={axis.key} label={axis.label} error={errors.options?.[axis.key]}>
          <SelectBox value={form.options[axis.key] ?? ''} invalid={Boolean(errors.options?.[axis.key])} onChange={(event) => patch({ options: { ...form.options, [axis.key]: event.target.value } })}>
            <option value="">Elige una</option>
            {(axis.allowed_values ?? []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </SelectBox>
        </Field>
      ))}
      {creating && (
        <>
          <Field label="SKU" error={errors.sku}>
            <input type="text" value={form.sku} aria-invalid={Boolean(errors.sku) || undefined} onChange={(event) => patch({ sku: event.target.value })} className={fieldClass(errors.sku)} />
          </Field>
          <Field label="Precio" hint="En pesos, sin decimales." error={errors.price}>
            <input type="text" inputMode="numeric" value={form.price} aria-invalid={Boolean(errors.price) || undefined} onChange={(event) => patch({ price: event.target.value })} className={fieldClass(errors.price)} />
          </Field>
          <Field label="Precio de referencia" optional hint="El «antes» tachado. Debe ser mayor que el precio." error={errors.compareAt}>
            <input type="text" inputMode="numeric" value={form.compareAt} aria-invalid={Boolean(errors.compareAt) || undefined} onChange={(event) => patch({ compareAt: event.target.value })} className={fieldClass(errors.compareAt)} />
          </Field>
        </>
      )}
      <Field label="Código de barras" optional>
        <input type="text" inputMode="numeric" value={form.barcode} placeholder="EAN-13 o UPC" onChange={(event) => patch({ barcode: event.target.value })} className={fieldClass()} />
      </Field>
      <Field label="Peso en gramos" hint="Se usa para calcular el envío." error={errors.weight}>
        <input type="text" inputMode="numeric" value={form.weight} aria-invalid={Boolean(errors.weight) || undefined} onChange={(event) => patch({ weight: event.target.value })} className={fieldClass(errors.weight)} />
      </Field>
      <TaxField value={form.tax} error={errors.tax} onChange={(tax) => patch({ tax })} />
      {!creating && (
        <Field label="Estado">
          <SelectBox value={form.status} onChange={(event) => patch({ status: event.target.value as VariantForm['status'] })}>
            <option value="active">Activa</option>
            <option value="archived">Archivada</option>
          </SelectBox>
        </Field>
      )}
      <FieldError>{errors.form}</FieldError>
    </AdminSheet>
  );
}
