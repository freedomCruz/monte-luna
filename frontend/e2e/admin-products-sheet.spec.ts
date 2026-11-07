import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockProductDetail } from '../src/mocks/admin-products';
import { mockAdminProductsRoutes } from './helpers/mock-admin-products';

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

const TITLE = 'Finca El Mirador – Geisha Lavado';

async function openList(page: Page, width: number) {
  await page.setViewportSize({ width, height: 1300 });
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${staff.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(staff),
  }));
  await mockAdminOrdersRoutes(page);
  const mock = await mockAdminProductsRoutes(page);
  await page.goto('/admin/productos/');
  await expect(page.getByRole('button', { name: TITLE, exact: true })).toBeVisible();
  return mock;
}

test.describe('Admin Productos quick view (F2b: S2, S3, S7)', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
  });

  for (const width of [1440, 1024, 768]) {
    test(`opens the Vista rápida Sheet at ${width}px (${width >= 1024 ? '520px over the list' : 'full screen'})`, async ({ page }, testInfo) => {
      await openList(page, width);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: TITLE });
      await expect(sheet.getByText('Variantes · 4')).toBeVisible();
      await expect(sheet.getByText('250 g · Grano entero')).toBeVisible();
      const box = await sheet.boundingBox();
      expect(Math.round(box!.width)).toBe(width >= 1024 ? 520 : width);
      await page.screenshot({ path: testInfo.outputPath(`productos-sheet-${width}.png`) });
    });
  }

  test('saves a status change with the product ETag and refreshes the list', async ({ page }) => {
    const mock = await openList(page, 1440);
    const before = mock.requests.length;
    await page.getByRole('button', { name: TITLE, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: TITLE });
    await sheet.getByLabel('Estado de publicación').selectOption('draft');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(sheet).toHaveCount(0);
    expect(mock.writes).toEqual([{ method: 'PATCH', path: '/' + mockProductDetail.id, ifMatch: '"3"', body: { status: 'draft' } }]);
    expect(mock.requests.length).toBeGreaterThan(before);
  });

  test('shows the conflict state on a stale version and recovers after reloading', async ({ page }) => {
    const mock = await openList(page, 1440);
    await page.getByRole('button', { name: TITLE, exact: true }).click();
    const sheet = page.getByRole('dialog', { name: TITLE });
    await expect(sheet.getByText('Variantes · 4')).toBeVisible();
    mock.makeStale();
    await sheet.getByLabel('Estado de publicación').selectOption('draft');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(sheet.getByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeVisible();
    expect(mock.writes).toHaveLength(1);

    await sheet.getByRole('button', { name: 'Recargar' }).click();
    await expect(sheet.getByText('Alguien más cambió este producto.')).toHaveCount(0);
    await sheet.getByLabel('Estado de publicación').selectOption('draft');
    await sheet.getByRole('button', { name: 'Guardar' }).click();
    await expect(sheet).toHaveCount(0);
    expect(mock.writes.at(-1)).toMatchObject({ ifMatch: '"4"', body: { status: 'draft' } });
  });

  test('offers the row actions without bulk or stock actions', async ({ page }) => {
    await openList(page, 1440);
    await page.getByRole('button', { name: `Acciones de ${TITLE}` }).click();
    const menu = page.getByRole('menu');
    await expect(menu.getByRole('menuitem')).toHaveText(['Vista rápida', 'Editar producto', 'Ver en la tienda']);
    await menu.getByRole('menuitem', { name: 'Vista rápida' }).click();
    await expect(page.getByRole('dialog', { name: TITLE })).toBeVisible();
  });

  test('has no WCAG A/AA violations with the Sheet and the menu open', async ({ page }) => {
    for (const width of [1440, 768]) {
      await openList(page, width);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      await expect(page.getByRole('dialog', { name: TITLE }).getByText('Variantes · 4')).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe Sheet at ${width}px`).toEqual([]);
      await page.unrouteAll();
    }
    await openList(page, 1024);
    await page.getByRole('button', { name: `Acciones de ${TITLE}` }).click();
    await expect(page.getByRole('menu')).toBeVisible();
    const menu = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(menu.violations, 'axe menu').toEqual([]);
  });
});
