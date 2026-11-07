import * as React from 'react';
import { receiveAdminVariantLot, type AdminInventoryVariant, type AdminLotReceipt } from '../../../lib/admin/catalog';
import {
  EMPTY_LOT_RECEIPT,
  parseReceiptQuantity,
  receiptFailure,
  toReceiveLot,
  validateLotReceipt,
  type LotReceiptErrors,
  type LotReceiptField,
  type LotReceiptForm,
} from '../../../lib/admin/lot-receipt';
import { AdminSheet } from '../shared/AdminSheet';
import { Field, FieldError, OUTLINE_BUTTON, RED_BUTTON, fieldClass } from './product/fields';

interface LotReceiptSheetProps {
  variant: AdminInventoryVariant;
  /** Parent product ETag from the variant detail; null while it is not known. */
  etag: string | null;
  onClose: () => void;
  /** Called with the receipt and the new product ETag the write returned. */
  onReceived: (receipt: AdminLotReceipt, etag: string | null) => void;
  /** Reads the variant again so the sheet carries the current ETag. */
  onReload: () => void;
}

/** "Registrar entrada de lote" (A-Inventario): variant-first form that receives units into a product lot. */
export function LotReceiptSheet({ variant, etag, onClose, onReceived, onReload }: LotReceiptSheetProps) {
  const [form, setForm] = React.useState<LotReceiptForm>(EMPTY_LOT_RECEIPT);
  const [errors, setErrors] = React.useState<LotReceiptErrors>({});
  const [problem, setProblem] = React.useState<{ kind: 'conflict' } | { kind: 'lot' | 'failed'; message: string } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const patch = (next: Partial<LotReceiptForm>) => { setForm((current) => ({ ...current, ...next })); setProblem(null); };
  const quantity = parseReceiptQuantity(form.quantity);

  const submit = async () => {
    if (saving) return;
    const found = validateLotReceipt(form);
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    if (etag === null) {
      setProblem({ kind: 'failed', message: 'Todavía no cargamos la versión del producto. Espera un momento e intenta de nuevo.' });
      return;
    }
    setSaving(true);
    const result = await receiveAdminVariantLot(variant.variant_id, etag, toReceiveLot(form));
    setSaving(false);
    if (result.ok) {
      onReceived(result.data, result.etag);
      return;
    }
    const failure = receiptFailure(result);
    if (failure.kind === 'fields') setErrors(failure.errors);
    else if (failure.kind === 'conflict') setProblem({ kind: 'conflict' });
    else if (failure.kind === 'lot') setProblem({ kind: 'lot', message: failure.message });
    else setProblem({ kind: 'failed', message: 'No pudimos registrar la entrada. Intenta de nuevo.' });
  };

  const invalid = (field: LotReceiptField) => Boolean(errors[field]) || undefined;

  return (
    <AdminSheet
      kicker={`${variant.product_title} · ${variant.variant_label}`}
      title="Registrar entrada de lote"
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className={OUTLINE_BUTTON}>Cancelar</button>
          <button type="button" disabled={saving} onClick={() => void submit()} className={RED_BUTTON}>Registrar entrada</button>
        </>
      }
    >
      <div className="flex flex-col gap-4 leading-[normal]">
      <Field label="Código del lote" hint="Único por producto. Va impreso en la bolsa." error={errors.lotCode}>
        <input type="text" value={form.lotCode} aria-invalid={invalid('lotCode')} onChange={(event) => patch({ lotCode: event.target.value })} className={fieldClass(errors.lotCode)} />
      </Field>
      <div className="flex gap-3">
        <div className="flex-1"><Field label="Fecha de tueste" error={errors.productionDate}>
          <input type="date" value={form.productionDate} aria-invalid={invalid('productionDate')} onChange={(event) => patch({ productionDate: event.target.value })} className={fieldClass(errors.productionDate)} />
        </Field></div>
        <div className="flex-1"><Field label="Vence" optional error={errors.expirationDate}>
          <input type="date" value={form.expirationDate} min={form.productionDate || undefined} aria-invalid={invalid('expirationDate')} onChange={(event) => patch({ expirationDate: event.target.value })} className={fieldClass(errors.expirationDate)} />
        </Field></div>
      </div>
      <Field label="Cantidad que entra" hint={`En unidades de esta variante (${variant.variant_label}).`} error={errors.quantity}>
        <input type="text" inputMode="numeric" value={form.quantity} aria-invalid={invalid('quantity')} onChange={(event) => patch({ quantity: event.target.value })} className={fieldClass(errors.quantity)} />
      </Field>
      <Field label="Nota" optional>
        <textarea rows={2} value={form.note} onChange={(event) => patch({ note: event.target.value })} className="box-border w-full resize-y rounded-sm border border-muted-foreground bg-card px-3 py-2.5 font-sans text-[15px] text-foreground" />
      </Field>
      {quantity !== null && (
        <div className="rounded-md bg-background px-3.5 py-3 text-sm leading-[1.45]">
          Disponible pasará de <span className="font-extrabold">{variant.available_quantity}</span> a <span className="font-extrabold">{variant.available_quantity + quantity}</span>.
        </div>
      )}
      {problem?.kind === 'conflict' && (
        <div role="alert" className="flex flex-col items-start gap-2 rounded-md border-2 border-foreground bg-card p-3.5 text-sm">
          <span className="font-extrabold">Alguien más cambió este producto. Recarga para ver la versión actual.</span>
          <span className="text-muted-foreground">La entrada no se registró. Tus datos siguen aquí; revisa el stock y vuelve a intentarlo.</span>
          <button type="button" onClick={() => { setProblem(null); onReload(); }} className="h-11 cursor-pointer rounded-sm border-0 bg-primary px-4 font-sans text-[15px] font-bold text-primary-foreground">Recargar</button>
        </div>
      )}
      {problem && problem.kind !== 'conflict' && <FieldError>{problem.message}</FieldError>}
      </div>
    </AdminSheet>
  );
}
