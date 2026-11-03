import type {
  AdminOrder,
  AdminOrderMetrics,
  AdminOrderPage,
  AdminOrderRow,
  AdminShipment,
} from '../lib/admin/orders';

// Deterministic admin orders fixtures typed from contracts/openapi/orders.yaml and
// shipping.yaml, with the sample data of the A-Pedidos and A-Pedido canvas. Shared by
// Vitest and the Playwright route mocks so screens never wait for backend code.

const row = (
  n: number,
  orderNumber: string,
  placedAt: string,
  customer: string,
  municipality: string,
  department: string,
  total: number,
  status: AdminOrderRow['status'],
  payment: AdminOrderRow['payment']
): AdminOrderRow => ({
  id: `01900000-0000-7000-8000-0000000001${String(n).padStart(2, '0')}`,
  order_number: orderNumber,
  placed_at: placedAt,
  customer_name: customer,
  customer_email: `${orderNumber.toLowerCase()}@clientes.monteluna.test`,
  municipality_name: municipality,
  department_name: department,
  total_amount: total,
  status,
  payment,
});

export const mockOrderRows: AdminOrderRow[] = [
  row(1, 'ORD-7K2M9Q4X', '2026-10-20T14:12:00Z', 'María Fernanda Ruiz', 'Medellín', 'Antioquia', 11210000, 'paid', { status: 'approved', payment_method_type: 'nequi' }),
  row(2, 'ORD-3F8W2N6B', '2026-10-20T13:47:00Z', 'Carlos Andrés Mejía', 'Bogotá, D. C.', 'Bogotá, D. C.', 5200000, 'pending_payment', { status: 'pending', payment_method_type: 'pse' }),
  row(3, 'ORD-6R2B8K1M', '2026-10-20T02:40:00Z', 'Natalia Cárdenas', 'Bucaramanga', 'Santander', 9000000, 'paid', { status: 'approved', payment_method_type: 'card' }),
  row(4, 'ORD-9P3K7M2Q', '2026-10-19T23:30:00Z', 'Juliana Ortiz', 'Cali', 'Valle del Cauca', 11800000, 'preparing', { status: 'approved', payment_method_type: 'card' }),
  row(5, 'ORD-5T1H8R4Y', '2026-10-19T19:05:00Z', 'Sebastián Gómez', 'Pitalito', 'Huila', 4750000, 'shipped', { status: 'approved', payment_method_type: 'bancolombia_transfer' }),
  row(6, 'ORD-4H8T2W9C', '2026-10-19T00:15:00Z', 'Andrea Salazar', 'Pasto', 'Nariño', 6400000, 'cancelled', { status: 'approved', payment_method_type: 'bancolombia_transfer' }),
  row(7, 'ORD-2C6V9X3L', '2026-10-18T16:20:00Z', 'Paola Restrepo', 'Pereira', 'Risaralda', 6600000, 'delivered', { status: 'approved', payment_method_type: 'card' }),
  row(8, 'ORD-8M4Q1Z7D', '2026-10-18T14:02:00Z', 'Diego Castaño', 'Manizales', 'Caldas', 3800000, 'expired', { status: 'declined', payment_method_type: 'card' }),
];

export const mockOrderPage: AdminOrderPage = {
  items: mockOrderRows,
  next_cursor: null,
  total: mockOrderRows.length,
  pending_dispatch_count: 6,
};

const order = mockOrderRows[0];

export const mockShipment: AdminShipment = {
  id: '01900000-0000-7000-8000-000000000201',
  order_id: order.id,
  status: 'pending',
  carrier_name: null,
  tracking_number: null,
  tracking_url: null,
  shipped_at: null,
  delivered_at: null,
  actor_id: null,
  version: 1,
};

/** A paid order with two lines, two payment attempts and a pending shipment (A-Pedido). */
export const mockPaidOrder: AdminOrder = {
  id: order.id,
  order_number: order.order_number,
  status: 'paid',
  payment: { status: 'approved', payment_method_type: 'nequi' },
  placed_at: order.placed_at,
  paid_at: '2026-10-20T14:13:00Z',
  cancelled_at: null,
  customer: { full_name: order.customer_name, email: order.customer_email, phone: '3105550142' },
  shipping_address: {
    recipient_name: 'María Fernanda Ruiz',
    recipient_phone: '3105550142',
    municipality_code: '05001',
    municipality_name: 'Medellín',
    department_name: 'Antioquia',
    address_line1: 'Calle 10 # 43-12',
    address_line2: 'Apto 502',
    postal_code: null,
    delivery_notes: 'Dejar con portería',
  },
  lines: [
    {
      id: '01900000-0000-7000-8000-000000000301',
      variant_id: '01900000-0000-7000-8000-000000000401',
      product_slug: 'finca-el-mirador',
      product_title: 'Finca El Mirador',
      variant_label: '250 g / Grano entero',
      sku: 'MTL-MIR-250-GR',
      image_url: null,
      quantity: 2,
      unit_price_amount: 3200000,
      discount_amount: 0,
      tax_amount: 0,
      line_total_amount: 6400000,
      lot_allocations: [{ lot_id: '01900000-0000-7000-8000-000000000501', lot_code: 'L-2026-041', production_date: '2026-10-12', quantity: 2 }],
    },
    {
      id: '01900000-0000-7000-8000-000000000302',
      variant_id: '01900000-0000-7000-8000-000000000402',
      product_slug: 'cacao-sierra',
      product_title: 'Cacao Sierra',
      variant_label: '200 g / Barra',
      sku: 'MTL-CAC-200-BA',
      image_url: null,
      quantity: 1,
      unit_price_amount: 3800000,
      discount_amount: 0,
      tax_amount: 0,
      line_total_amount: 3800000,
      lot_allocations: [{ lot_id: '01900000-0000-7000-8000-000000000502', lot_code: 'L-2026-033', production_date: '2026-09-28', quantity: 1 }],
    },
  ],
  summary: {
    subtotal_amount: 10200000,
    discount_amount: 0,
    coupon_code: null,
    shipping_amount: 1010000,
    shipping_discount_amount: 0,
    tax_amount: 0,
    total_amount: 11210000,
    shipping: {
      rate_name: 'Antioquia estándar',
      zone_name: null,
      min_weight_grams: null,
      max_weight_grams: null,
      estimated_days_min: 3,
      estimated_days_max: 5,
    },
  },
  payment_attempts: [
    {
      id: '01900000-0000-7000-8000-000000000601',
      reference: 'REF-ORD-7K2M9Q4X-1',
      payment_method_type: 'card',
      status: 'declined',
      provider_transaction_id: '128734-1729-38231',
      created_at: '2026-10-20T14:05:00Z',
      finalized_at: '2026-10-20T14:06:00Z',
    },
    {
      id: '01900000-0000-7000-8000-000000000602',
      reference: 'REF-ORD-7K2M9Q4X-2',
      payment_method_type: 'nequi',
      status: 'approved',
      provider_transaction_id: '128734-1729-41907',
      created_at: '2026-10-20T14:12:00Z',
      finalized_at: '2026-10-20T14:13:00Z',
    },
  ],
  status_history: [
    { id: '01900000-0000-7000-8000-000000000701', from_status: null, to_status: 'pending_payment', actor_type: 'customer', actor_id: null, note: null, created_at: order.placed_at },
    { id: '01900000-0000-7000-8000-000000000702', from_status: 'pending_payment', to_status: 'paid', actor_type: 'system', actor_id: null, note: null, created_at: '2026-10-20T14:13:00Z' },
  ],
  shipment: mockShipment,
  version: 2,
};

const kpi = (value: number, previous: number) => ({
  value,
  previous_value: previous,
  delta_percentage: previous === 0 ? null : (100 * (value - previous)) / previous,
});

/** Metrics for the last 7 days, 3 daily buckets kept short for tests. */
export const mockOrderMetrics: AdminOrderMetrics = {
  period: 'last_7_days',
  generated_at: '2026-10-20T15:00:00Z',
  time_zone: 'America/Bogota',
  from_at: '2026-10-14T05:00:00Z',
  to_at: '2026-10-20T15:00:00Z',
  previous_from_at: '2026-10-07T19:00:00Z',
  previous_to_at: '2026-10-14T05:00:00Z',
  granularity: 'day',
  kpis: {
    paid_sales_amount: kpi(48620000, 41100000),
    orders: kpi(52, 47),
    average_order_amount: kpi(935000, 874000),
    units_sold: kpi(131, 118),
  },
  series: [
    { from_at: '2026-10-18T05:00:00Z', to_at: '2026-10-19T05:00:00Z', previous_from_at: '2026-10-11T05:00:00Z', previous_to_at: '2026-10-12T05:00:00Z', sales_amount: 6400000, previous_sales_amount: 5100000 },
    { from_at: '2026-10-19T05:00:00Z', to_at: '2026-10-20T05:00:00Z', previous_from_at: '2026-10-12T05:00:00Z', previous_to_at: '2026-10-13T05:00:00Z', sales_amount: 9300000, previous_sales_amount: 7800000 },
    { from_at: '2026-10-20T05:00:00Z', to_at: '2026-10-20T15:00:00Z', previous_from_at: '2026-10-13T05:00:00Z', previous_to_at: '2026-10-13T15:00:00Z', sales_amount: 20410000, previous_sales_amount: 14000000 },
  ],
  attention: { role: 'owner', pending_dispatch_count: 6, oldest_pending_dispatch_paid_at: '2026-10-17T15:00:00Z', manual_refund_count: 1 },
  latest_orders: mockOrderRows.slice(0, 6),
};
