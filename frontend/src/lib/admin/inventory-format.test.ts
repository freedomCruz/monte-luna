import { describe, expect, it } from 'vitest';
import { MOCK_GENERATED_AT, mockMovements, mockVariantLots } from '../../mocks/admin-inventory';
import {
  daysSinceProduction,
  formatLotDate,
  formatQuantityDelta,
  lotStatePresentation,
  movementActor,
  movementDetail,
  movementLabel,
  variantStockBadge,
} from './inventory-format';

const lotNamed = (code: string) => mockVariantLots.find((lot) => lot.lot_code === code)!;
const movementAt = (index: number) => mockMovements[index];

describe('Inventario presentation (F4: S4)', () => {
  it('shows the server low-stock flag as Poco stock, and zero units as Agotado', () => {
    expect(variantStockBadge({ available_quantity: 18, low_stock: false, product_status: 'published' })).toBeNull();
    expect(variantStockBadge({ available_quantity: 9, low_stock: true, product_status: 'published' })).toEqual({ label: 'Poco stock', tone: 'action' });
    expect(variantStockBadge({ available_quantity: 0, low_stock: true, product_status: 'published' })).toEqual({ label: 'Agotado', tone: 'problem' });
  });

  it('never recomputes the threshold: ten units with the flag off carry no badge', () => {
    expect(variantStockBadge({ available_quantity: 10, low_stock: false, product_status: 'published' })).toBeNull();
  });

  it('presents the lot state from the status and the server old-roast flag', () => {
    expect(lotStatePresentation(lotNamed('MIR-1014'))).toEqual({ label: 'Lote activo', tone: 'done' });
    expect(lotStatePresentation(lotNamed('MIR-0915'))).toEqual({ label: 'Tueste antiguo', tone: 'action' });
    expect(lotStatePresentation(lotNamed('MIR-0820'))).toEqual({ label: 'Lote agotado', tone: 'neutral' });
    expect(lotStatePresentation({ status: 'archived', old_roast: false })).toEqual({ label: 'Lote archivado', tone: 'neutral' });
  });

  it('keeps exactly 30 days unflagged because the flag is the server value', () => {
    const exactly30 = { status: 'active' as const, old_roast: false, production_date: '2026-09-20' };
    expect(daysSinceProduction(exactly30.production_date, MOCK_GENERATED_AT)).toBe(30);
    expect(lotStatePresentation(exactly30)).toEqual({ label: 'Lote activo', tone: 'done' });
  });

  it('counts Bogota calendar days between the production date and the server read time', () => {
    expect(daysSinceProduction('2026-08-20', MOCK_GENERATED_AT)).toBe(61);
    expect(daysSinceProduction('2026-09-15', MOCK_GENERATED_AT)).toBe(35);
    expect(daysSinceProduction('2026-10-14', MOCK_GENERATED_AT)).toBe(6);
    // 03:00Z on 21 oct is still 22:00 on 20 oct in Bogota.
    expect(daysSinceProduction('2026-10-20', '2026-10-21T03:00:00Z')).toBe(0);
  });

  it('formats calendar dates and a missing expiry', () => {
    expect(formatLotDate('2026-08-20')).toBe('20 ago 2026');
    expect(formatLotDate(null)).toBe('—');
  });

  it('names each display kind', () => {
    expect(mockMovements.map((movement) => movementLabel(movement.display_kind))).toEqual([
      'Reserva', 'Reserva', 'Liberación', 'Daño', 'Venta', 'Asignación', 'Entrada',
    ]);
    expect(movementLabel('return')).toBe('Devolución');
    expect(movementLabel('adjustment')).toBe('Ajuste');
  });

  it('signs the quantity with a true minus', () => {
    expect(formatQuantityDelta(10)).toBe('+10');
    expect(formatQuantityDelta(-2)).toBe('−2');
    expect(formatQuantityDelta(0)).toBe('0');
  });

  it('explains a movement from its order and note', () => {
    expect(movementDetail(movementAt(0))).toBe('Pedido ORD-7K2M9Q4X esperando pago');
    expect(movementDetail(movementAt(2))).toBe('Se liberó la reserva de ORD-8M4Q1Z7D');
    expect(movementDetail(movementAt(4))).toBe('Pedido ORD-9P3K7M2Q');
    expect(movementDetail(movementAt(3))).toBe('Bolsa rota en bodega');
    expect(movementDetail(movementAt(6))).toBe('Tostión del 14 de octubre');
    expect(movementDetail({ ...movementAt(6), note: null })).toBe('—');
    expect(movementDetail({ ...movementAt(4), note: 'Revisado' })).toBe('Pedido ORD-9P3K7M2Q · Revisado');
  });

  it('names the actor, treating a null name as the system or a missing identity', () => {
    expect(movementActor(movementAt(6))).toBe('Andrés Peña');
    expect(movementActor(movementAt(0))).toBe('Sistema');
    expect(movementActor(movementAt(5))).toBe('Persona no disponible');
  });
});
