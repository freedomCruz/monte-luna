import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockAdminProductsRoutes } from './helpers/mock-admin-products';
import { mockProductRows } from '../src/mocks/admin-products';

const staff: AdminUser = {
  id: '01900000-0000-7000-8000-000000000002',
  email: 'andres@monteluna.co',
  display_name: 'Andrés Peña',
  role: 'staff',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  version: 1,
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};

async function prepare(page: Page, overrides: Parameters<typeof mockAdminProductsRoutes>[1] = {}) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${staff.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(staff),
  }));
  await mockAdminOrdersRoutes(page);
  return mockAdminProductsRoutes(page, overrides);
}

const COLUMNS: Record<number, string[]> = {
  1440: ['Producto', 'Tipo', 'Categoría', 'Estado', 'Variantes', 'Precio', 'Stock', 'Acciones'],
  1024: ['Producto', 'Tipo', 'Estado', 'Precio', 'Stock', 'Acciones'],
  768: ['Producto', 'Estado', 'Precio', 'Stock', 'Acciones'],
};

test.describe('Admin Productos (F2: S2, S7)', () => {
  test('never prerenders catalog data', async ({ request }) => {
    const html = await (await request.get('/admin/productos/')).text();
    for (const row of mockProductRows) expect(html).not.toContain(row.title);
  });

  for (const width of [1440, 1024, 768]) {
    test(`renders Productos at ${width}px with the canvas columns`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width, height: 1300 });
      await prepare(page);
      await page.goto('/admin/productos/');
      await expect(page.getByRole('heading', { level: 1, name: 'Productos' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Finca El Mirador – Geisha Lavado', exact: true })).toBeVisible();

      const headers = await page.getByRole('columnheader').filter({ visible: true }).allInnerTexts();
      expect(headers.map((text) => text.replace(/[↑↓↕]/, '').trim().toLowerCase())).toEqual(COLUMNS[width].map((name) => name.toLowerCase()));
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Nuevo producto' })).toHaveAttribute('href', '/admin/producto/');
      await page.screenshot({ path: testInfo.outputPath(`productos-${width}.png`), fullPage: true });
    });
  }

  test('filters through the API and mirrors the address', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 900 });
    const mock = await prepare(page);
    await page.goto('/admin/productos/');
    await expect(page.getByRole('button', { name: 'Finca El Mirador – Geisha Lavado', exact: true })).toBeVisible();
    await page.getByRole('group', { name: 'Filtros' }).getByRole('button', { name: 'Stock' }).click();
    await expect(page).toHaveURL(/stock=low_or_empty/);
    await expect.poll(() => mock.requests.at(-1)?.searchParams.get('stock')).toBe('low_or_empty');
  });

  test('shows the error state with a retry', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
    await page.setViewportSize({ width: 1024, height: 900 });
    await prepare(page, { fail: true });
    await page.goto('/admin/productos/');
    await expect(page.getByRole('heading', { name: 'No pudimos cargar los productos' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('has no WCAG A/AA violations at 1440, 1024 and 768', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
    await prepare(page);
    for (const width of [1440, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/productos/');
      await expect(page.getByRole('button', { name: 'Finca El Mirador – Geisha Lavado', exact: true })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe at ${width}px`).toEqual([]);
    }
  });
});
