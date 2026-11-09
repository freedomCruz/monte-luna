import { describe, expect, it } from 'vitest';
import { EMPTY_LOT_RECEIPT, receiptFailure, toReceiveLot, validateLotReceipt, type LotReceiptForm } from './lot-receipt';

const valid: LotReceiptForm = { lotCode: ' MIR-1020 ', productionDate: '2026-10-20', expirationDate: '', quantity: '24', note: '  ' };

describe('Lot receipt form (F4: S4)', () => {
  it('accepts a complete form', () => {
    expect(validateLotReceipt(valid)).toEqual({});
  });

  it('requires a lot code, a production date and a positive whole quantity', () => {
    expect(validateLotReceipt(EMPTY_LOT_RECEIPT)).toEqual({
      lotCode: 'Escribe el código del lote.',
      productionDate: 'Elige la fecha de tueste.',
      quantity: 'Escribe cuántas unidades entran.',
    });
    expect(validateLotReceipt({ ...valid, quantity: '0' }).quantity).toBe('Escribe cuántas unidades entran.');
    expect(validateLotReceipt({ ...valid, quantity: '2.5' }).quantity).toBe('Escribe cuántas unidades entran.');
    expect(validateLotReceipt({ ...valid, quantity: '-3' }).quantity).toBe('Escribe cuántas unidades entran.');
  });

  it('rejects a quantity beyond what the counter can hold', () => {
    expect(validateLotReceipt({ ...valid, quantity: '2147483648' }).quantity).toBe('La cantidad es demasiado grande.');
    expect(validateLotReceipt({ ...valid, quantity: '2147483647' })).toEqual({});
  });

  it('requires the expiry, when given, to be on or after the roast date', () => {
    expect(validateLotReceipt({ ...valid, expirationDate: '2026-10-19' }).expirationDate).toBe('Debe ser igual o posterior a la fecha de tueste.');
    expect(validateLotReceipt({ ...valid, expirationDate: '2026-10-20' })).toEqual({});
    expect(validateLotReceipt({ ...valid, expirationDate: '2027-03-20' })).toEqual({});
  });

  it('builds the request with trimmed text and no client-owned fields', () => {
    expect(toReceiveLot(valid)).toEqual({ lot_code: 'MIR-1020', production_date: '2026-10-20', quantity: 24 });
    expect(toReceiveLot({ ...valid, expirationDate: '2027-03-20', note: ' Tostión del día ' })).toEqual({
      lot_code: 'MIR-1020',
      production_date: '2026-10-20',
      expiration_date: '2027-03-20',
      quantity: 24,
      note: 'Tostión del día',
    });
  });

  it('maps server field errors onto the form fields', () => {
    const failure = receiptFailure({
      ok: false,
      status: 422,
      code: 'validation_failed',
      problem: { type: 't', title: 't', status: 422, code: 'validation_failed', errors: [{ field: 'quantity', code: 'out_of_range', message: 'x' }, { field: 'expiration_date', code: 'before_production', message: 'x' }] },
    });
    expect(failure).toEqual({
      kind: 'fields',
      errors: { quantity: 'La cantidad no es válida.', expirationDate: 'Debe ser igual o posterior a la fecha de tueste.' },
    });
  });

  it('classifies the other rejections', () => {
    const base = { ok: false as const };
    expect(receiptFailure({ ...base, status: 412, code: 'version_conflict' })).toEqual({ kind: 'conflict' });
    expect(receiptFailure({ ...base, status: 409, code: 'lot_conflict' })).toEqual({
      kind: 'lot',
      message: 'Ese código ya existe con otras fechas o está archivado. Usa las mismas fechas de ese lote o elige otro código.',
    });
    expect(receiptFailure({ ...base, status: 422, code: 'validation_failed' })).toEqual({ kind: 'failed' });
    expect(receiptFailure({ ...base, status: 0, code: 'network_error' })).toEqual({ kind: 'failed' });
  });
});
