import type {
  AdminInventoryMovement,
  AdminInventoryMovementPage,
  AdminInventoryVariant,
  AdminInventoryVariantPage,
  AdminVariantLot,
  AdminVariantLotPage,
  ListAdminInventoryVariantsQuery,
} from '../lib/admin/catalog';

// Deterministic admin Inventario fixtures typed from contracts/openapi/catalog.yaml,
// with the sample variants, lots and movements of the A-Inventario canvas. Shared by
// Vitest and the Playwright route mocks so the screen never waits for backend code.
// Flags and held counts are fixed server values here, as in the real API. Test data only.

/** Server read time of every fixture page: 20 oct 2026, 9:30 a. m. in Bogota. */
export const MOCK_GENERATED_AT = '2026-10-20T14:30:00Z';

const MIRADOR_PRODUCT_ID = '01900000-0000-7000-8000-0000000002a1';
const MARIA_PRODUCT_ID = '01900000-0000-7000-8000-0000000002a2';
const CHOCOLATE_65_PRODUCT_ID = '01900000-0000-7000-8000-0000000002a3';
const CHOCOLATE_75_PRODUCT_ID = '01900000-0000-7000-8000-0000000002a4';
const CHOCOLATE_100_PRODUCT_ID = '01900000-0000-7000-8000-0000000002a5';

const variant = (
  n: number,
  productId: string,
  productTitle: string,
  label: string,
  sku: string,
  available: number,
  lowStock: boolean,
  options: { reserved?: number; lots?: number; variantStatus?: 'active' | 'archived'; productStatus?: AdminInventoryVariant['product_status'] } = {}
): AdminInventoryVariant => ({
  product_id: productId,
  variant_id: `01900000-0000-7000-8000-0000000004${String(n).padStart(2, '0')}`,
  product_title: productTitle,
  product_status: options.productStatus ?? 'published',
  variant_status: options.variantStatus ?? 'active',
  variant_label: label,
  sku,
  available_quantity: available,
  reserved_quantity: options.reserved ?? 0,
  active_lot_count: options.lots ?? 0,
  low_stock: lowStock,
  product_version: 3,
  generated_at: MOCK_GENERATED_AT,
});

export const mockInventoryVariants: AdminInventoryVariant[] = [
  variant(1, MIRADOR_PRODUCT_ID, 'Finca El Mirador', '250 g · Grano entero', 'ML-MIR-250-GE', 18, false, { reserved: 3, lots: 3 }),
  variant(2, MIRADOR_PRODUCT_ID, 'Finca El Mirador', '250 g · Fina', 'ML-MIR-250-FI', 4, true, { reserved: 0, lots: 1 }),
  variant(3, MIRADOR_PRODUCT_ID, 'Finca El Mirador', '500 g · Fina', 'ML-MIR-500-FI', 0, true),
  variant(4, MARIA_PRODUCT_ID, 'Finca La María', '250 g · Grano entero', 'ML-MAR-250-GE', 40, false, { lots: 2 }),
  variant(5, CHOCOLATE_65_PRODUCT_ID, 'Chocolate oscuro 65 %', 'Barra de 80 g', 'ML-CHO-65-80', 0, true),
  variant(6, CHOCOLATE_75_PRODUCT_ID, 'Chocolate oscuro 75 %', 'Barra de 80 g', 'ML-CHO-75-80', 9, true, { lots: 1 }),
  variant(7, CHOCOLATE_100_PRODUCT_ID, 'Chocolate oscuro 100 %', 'Barra de 80 g', 'ML-CHO-100-80', 22, false, { lots: 1, productStatus: 'draft' }),
  variant(8, MARIA_PRODUCT_ID, 'Finca La María', '500 g · Grano entero', 'ML-MAR-500-GE', 0, true, { variantStatus: 'archived' }),
];

export const mockInventoryVariantPage: AdminInventoryVariantPage = {
  items: mockInventoryVariants,
  next_cursor: null,
  total: mockInventoryVariants.length,
  generated_at: MOCK_GENERATED_AT,
};

/** Variant whose lots and movements the fixtures describe (the canvas's first row). */
export const mockSelectedVariant = mockInventoryVariants[0];

const lot = (
  n: number,
  code: string,
  production: string,
  expiration: string | null,
  quantity: number,
  reserved: number,
  state: Pick<AdminVariantLot, 'status' | 'old_roast' | 'next_to_allocate'>
): AdminVariantLot => ({
  id: `01900000-0000-7000-8000-0000000005${String(n).padStart(2, '0')}`,
  product_id: MIRADOR_PRODUCT_ID,
  lot_code: code,
  production_date: production,
  expiration_date: expiration,
  quantity,
  reserved_quantity: reserved,
  version: 1,
  ...state,
});

/** Oldest first, as the API sends them: MIR-0820 depleted at 61 days, MIR-0915 old roast at 35. */
export const mockVariantLots: AdminVariantLot[] = [
  lot(1, 'MIR-0820', '2026-08-20', null, 0, 0, { status: 'depleted', old_roast: true, next_to_allocate: false }),
  lot(2, 'MIR-0915', '2026-09-15', '2027-03-15', 2, 2, { status: 'active', old_roast: true, next_to_allocate: true }),
  lot(3, 'MIR-0930', '2026-09-30', '2027-03-30', 6, 1, { status: 'active', old_roast: false, next_to_allocate: false }),
  lot(4, 'MIR-1014', '2026-10-14', null, 10, 0, { status: 'active', old_roast: false, next_to_allocate: false }),
];

export const mockVariantLotPage: AdminVariantLotPage = {
  items: mockVariantLots,
  next_cursor: null,
  total: mockVariantLots.length,
  generated_at: MOCK_GENERATED_AT,
};

const movement = (
  n: number,
  createdAt: string,
  displayKind: AdminInventoryMovement['display_kind'],
  reason: AdminInventoryMovement['reason'],
  lotIndex: number,
  delta: number,
  extra: Partial<Pick<AdminInventoryMovement, 'order' | 'note' | 'actor_id' | 'actor_name'>> = {}
): AdminInventoryMovement => ({
  id: `01900000-0000-7000-8000-0000000006${String(n).padStart(2, '0')}`,
  variant_id: mockSelectedVariant.variant_id,
  lot_id: mockVariantLots[lotIndex].id,
  lot_code: mockVariantLots[lotIndex].lot_code,
  quantity_delta: delta,
  reason,
  display_kind: displayKind,
  reference_id: extra.order?.id ?? null,
  order: extra.order ?? null,
  actor_id: extra.actor_id ?? null,
  actor_name: extra.actor_name ?? null,
  note: extra.note ?? null,
  created_at: createdAt,
});

const order = (n: number, orderNumber: string, reservationState: 'held' | 'committed' | 'released') => ({
  id: `01900000-0000-7000-8000-0000000007${String(n).padStart(2, '0')}`,
  order_number: orderNumber,
  status: reservationState === 'held' ? 'pending_payment' : reservationState === 'released' ? 'expired' : 'paid',
  reservation_state: reservationState,
});

const ANDRES = { actor_id: '01900000-0000-7000-8000-000000000002', actor_name: 'Andrés Peña' };
const GONE_ADMIN = { actor_id: '01900000-0000-7000-8000-0000000000ff', actor_name: null };

/** Newest first. The first two rows are reservations; the last is a person's receipt. */
export const mockMovements: AdminInventoryMovement[] = [
  movement(1, '2026-10-20T14:12:00Z', 'reservation', 'sale', 1, -2, { order: order(1, 'ORD-7K2M9Q4X', 'held') }),
  movement(2, '2026-10-20T14:12:00Z', 'reservation', 'sale', 2, -1, { order: order(1, 'ORD-7K2M9Q4X', 'held') }),
  movement(3, '2026-10-19T21:40:00Z', 'release', 'release', 1, 1, { order: order(2, 'ORD-8M4Q1Z7D', 'released') }),
  movement(4, '2026-10-19T16:05:00Z', 'damage', 'damage', 2, -1, { note: 'Bolsa rota en bodega', ...ANDRES }),
  movement(5, '2026-10-18T23:30:00Z', 'sale', 'sale', 1, -1, { order: order(3, 'ORD-9P3K7M2Q', 'committed') }),
  movement(6, '2026-10-17T20:15:00Z', 'allocation', 'sale', 3, -1, { order: order(4, 'ORD-5T8N2R6V', 'committed'), ...GONE_ADMIN }),
  movement(7, '2026-10-14T13:00:00Z', 'receipt', 'receipt', 3, 10, { note: 'Tostión del 14 de octubre', ...ANDRES }),
];

export const mockMovementPage: AdminInventoryMovementPage = {
  items: mockMovements,
  next_cursor: null,
  total: mockMovements.length,
  generated_at: MOCK_GENERATED_AT,
};

const norm = (text: string) => text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/** The list endpoint's filters over the fixtures: literal case-insensitive title or SKU, then the enum filters. */
export function filterInventoryVariants(query: Pick<ListAdminInventoryVariantsQuery, 'search' | 'product_id' | 'status' | 'stock'>): AdminInventoryVariant[] {
  const search = query.search ? norm(query.search.trim()) : '';
  return mockInventoryVariants.filter((item) =>
    (!search || norm(item.product_title).includes(search) || norm(item.sku).includes(search)) &&
    (!query.product_id || item.product_id === query.product_id) &&
    (!query.status || query.status === 'all' || item.variant_status === query.status) &&
    (query.stock !== 'low_or_empty' || item.low_stock));
}
