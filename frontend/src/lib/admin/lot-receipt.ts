import type { AdminReceiveLot } from './catalog';
import type { AdminResult } from './client';
import { isVersionConflict } from './orders';

// Form model of the lot receipt Sheet (A-Inventario "Registrar entrada de lote"). The
// server resolves the product, the lot and the stock row; the form only collects the
// fields of `AdminReceiveLot` and checks what it can before the request.

export interface LotReceiptForm {
  lotCode: string;
  productionDate: string;
  expirationDate: string;
  quantity: string;
  note: string;
}

export type LotReceiptField = 'lotCode' | 'productionDate' | 'expirationDate' | 'quantity';
export type LotReceiptErrors = Partial<Record<LotReceiptField, string>>;

export const EMPTY_LOT_RECEIPT: LotReceiptForm = { lotCode: '', productionDate: '', expirationDate: '', quantity: '', note: '' };

const INT32_MAX = 2_147_483_647;
const EXPIRY_BEFORE_PRODUCTION = 'Debe ser igual o posterior a la fecha de tueste.';

/** The quantity as a positive whole number the counter can hold, or null. */
export function parseReceiptQuantity(text: string): number | null {
  const quantity = text.trim();
  return /^[1-9]\d*$/.test(quantity) && Number(quantity) <= INT32_MAX ? Number(quantity) : null;
}

export function validateLotReceipt(form: LotReceiptForm): LotReceiptErrors {
  const errors: LotReceiptErrors = {};
  if (form.lotCode.trim() === '') errors.lotCode = 'Escribe el código del lote.';
  if (form.productionDate === '') errors.productionDate = 'Elige la fecha de tueste.';
  if (form.expirationDate !== '' && form.productionDate !== '' && form.expirationDate < form.productionDate) errors.expirationDate = EXPIRY_BEFORE_PRODUCTION;
  if (parseReceiptQuantity(form.quantity) === null) errors.quantity = /^[1-9]\d*$/.test(form.quantity.trim()) ? 'La cantidad es demasiado grande.' : 'Escribe cuántas unidades entran.';
  return errors;
}

/** The request body; lot ids, totals, reason and actor are never sent (the server rejects them). */
export function toReceiveLot(form: LotReceiptForm): AdminReceiveLot {
  const note = form.note.trim();
  return {
    lot_code: form.lotCode.trim(),
    production_date: form.productionDate,
    ...(form.expirationDate !== '' ? { expiration_date: form.expirationDate } : {}),
    quantity: parseReceiptQuantity(form.quantity) ?? 0,
    ...(note !== '' ? { note } : {}),
  };
}

export type ReceiptFailure =
  | { kind: 'conflict' }
  | { kind: 'lot'; message: string }
  | { kind: 'fields'; errors: LotReceiptErrors }
  | { kind: 'failed' };

const FIELD_OF: Record<string, LotReceiptField> = {
  lot_code: 'lotCode',
  production_date: 'productionDate',
  expiration_date: 'expirationDate',
  quantity: 'quantity',
};

const FIELD_MESSAGE: Record<LotReceiptField, string> = {
  lotCode: 'El código del lote no es válido.',
  productionDate: 'La fecha de tueste no es válida.',
  expirationDate: EXPIRY_BEFORE_PRODUCTION,
  quantity: 'La cantidad no es válida.',
};

/** Sorts a rejected receipt into the message the Sheet shows. */
export function receiptFailure(result: Extract<AdminResult<unknown>, { ok: false }>): ReceiptFailure {
  if (isVersionConflict(result)) return { kind: 'conflict' };
  if (result.status === 409 || result.code === 'lot_conflict') {
    return { kind: 'lot', message: 'Ese código ya existe con otras fechas o está archivado. Usa las mismas fechas de ese lote o elige otro código.' };
  }
  if (result.status === 422) {
    const errors: LotReceiptErrors = {};
    for (const error of result.problem?.errors ?? []) {
      const field = FIELD_OF[error.field];
      if (field && errors[field] === undefined) errors[field] = FIELD_MESSAGE[field];
    }
    if (Object.keys(errors).length > 0) return { kind: 'fields', errors };
  }
  return { kind: 'failed' };
}
