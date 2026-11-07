import type {
  AdminCategoryPage,
  AdminProductPage,
  AdminProductRow,
  AdminProductTypePage,
} from '../lib/admin/catalog';

// Deterministic admin Productos fixtures typed from contracts/openapi/catalog.yaml,
// with the sample rows of the A-Productos canvas. Shared by Vitest and the Playwright
// route mocks so the screen never waits for backend code. Test data only.

export const mockProductTypes: AdminProductTypePage = {
  items: [
    { id: '01900000-0000-7000-8000-000000000a01', slug: 'coffee', name: 'Café', attribute_definitions: [] },
    { id: '01900000-0000-7000-8000-000000000a02', slug: 'cacao', name: 'Cacao', attribute_definitions: [] },
  ],
  next_cursor: null,
  total: 2,
};

const category = (n: number, slug: string, name: string) => ({
  id: `01900000-0000-7000-8000-000000000b0${n}`,
  slug,
  name,
  parent_id: null,
  position: n,
  status: 'active' as const,
});

export const mockCategories: AdminCategoryPage = {
  items: [category(1, 'cafes-de-origen', 'Cafés de origen'), category(2, 'chocolates', 'Chocolates')],
  next_cursor: null,
  total: 2,
};

const coffee = { id: mockProductTypes.items[0].id, slug: 'coffee', name: 'Café' };
const cacao = { id: mockProductTypes.items[1].id, slug: 'cacao', name: 'Cacao' };

const origin = (n: number, name: string) => ({
  id: `01900000-0000-7000-8000-000000000c0${n}`,
  slug: name.toLowerCase().replace(/\s+/g, '-'),
  name,
  producer_name: 'Productor de prueba',
  country_code: 'CO',
  department: 'Huila',
  municipality_code: null,
  municipality_name: null,
  altitude_min_masl: null,
  altitude_max_masl: null,
  story: null,
  status: 'active' as const,
});

const row = (
  n: number,
  title: string,
  type: AdminProductRow['product_type'],
  categoryIndex: 0 | 1,
  status: AdminProductRow['status'],
  variants: number,
  min: number | null,
  max: number | null,
  stock: number,
  image: string | null
): AdminProductRow => ({
  id: `01900000-0000-7000-8000-0000000002${String(n).padStart(2, '0')}`,
  title,
  slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  product_type: type,
  categories: [mockCategories.items[categoryIndex]],
  origin: type.slug === 'coffee' ? origin(n, title.split(' – ')[0]) : null,
  status,
  variant_count: variants,
  min_price_amount: min,
  max_price_amount: max,
  available_quantity: stock,
  low_stock: stock < 10,
  image_url: image ? `/images/${image}` : null,
  version: 1,
});

export const mockProductRows: AdminProductRow[] = [
  row(1, 'Finca El Mirador – Geisha Lavado', coffee, 0, 'published', 8, 3_800_000, 7_200_000, 64, 'packaging-finca-el-mirador.webp'),
  row(2, 'Finca La María – Caturra', coffee, 0, 'published', 8, 4_200_000, 8_000_000, 120, 'packaging-finca-la-maria.webp'),
  row(3, 'Chocolate oscuro 65 %', cacao, 1, 'published', 1, 1_400_000, 1_400_000, 0, 'packaging-chocolate-65.webp'),
  row(4, 'Chocolate oscuro 75 %', cacao, 1, 'published', 1, 1_500_000, 1_500_000, 9, 'packaging-chocolate-75-100.webp'),
  row(5, 'Chocolate oscuro 100 %', cacao, 1, 'draft', 1, 1_600_000, 1_600_000, 22, 'packaging-chocolate-75-100.webp'),
  row(6, 'Finca La María – Cosecha 2025', coffee, 0, 'archived', 4, 4_000_000, 7_600_000, 0, 'packaging-finca-la-maria.webp'),
];

export const mockProductPage: AdminProductPage = { items: mockProductRows, next_cursor: null, total: mockProductRows.length };
