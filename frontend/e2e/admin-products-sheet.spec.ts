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

  for (const dismiss of ['Cancelar', 'Cerrar', 'Escape', 'outside'] as const) {
    test(`confirms dirty dismissal via ${dismiss} without writing (F2c)`, async ({ page }) => {
      const mock = await openList(page, 1440);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: TITLE });
      await sheet.getByLabel('Estado de publicación').selectOption('draft');
      const requestClose = async () => {
        if (dismiss === 'Escape') await page.keyboard.press('Escape');
        else if (dismiss === 'outside') await page.locator('[data-state="open"][aria-hidden="true"]').click({ position: { x: 20, y: 300 } });
        else await sheet.getByRole('button', { name: dismiss, exact: true }).click();
      };
      await requestClose();
      const confirm = page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByText(`Perderás los cambios que hiciste en ${TITLE}.`, { exact: true })).toBeVisible();
      await expect(confirm.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
      expect(mock.writes).toEqual([]);
      await confirm.getByRole('button', { name: 'Seguir editando' }).click();
      await expect(confirm).toHaveCount(0);
      await expect(sheet.getByLabel('Estado de publicación')).toHaveValue('draft');
      await expect(sheet.getByRole('button', { name: 'Guardar' })).toBeEnabled();
      await requestClose();
      await expect(confirm).toBeVisible();
      await confirm.getByRole('button', { name: 'Salir sin guardar', exact: true }).click();
      await expect(sheet).toHaveCount(0);
      expect(mock.writes).toEqual([]);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      await expect(sheet.getByLabel('Estado de publicación')).toHaveValue('published');
    });

    test(`closes a clean Sheet immediately via ${dismiss} (F2c)`, async ({ page }) => {
      const mock = await openList(page, 1440);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: TITLE });
      await expect(sheet.getByLabel('Estado de publicación')).toHaveValue('published');
      if (dismiss === 'Escape') await page.keyboard.press('Escape');
      else if (dismiss === 'outside') await page.locator('[data-state="open"][aria-hidden="true"]').click({ position: { x: 20, y: 300 } });
      else await sheet.getByRole('button', { name: dismiss, exact: true }).click();
      await expect(sheet).toHaveCount(0);
      await expect(page.getByRole('alertdialog')).toHaveCount(0);
      expect(mock.writes).toEqual([]);
    });
  }

  test('matches the discard dialog reference and passes axe at every catalog width (F2c)', async ({ page }, testInfo) => {
    for (const width of [1440, 1024, 768]) {
      await openList(page, width);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: TITLE });
      await sheet.getByLabel('Estado de publicación').selectOption('draft');
      await sheet.getByRole('button', { name: 'Cancelar', exact: true }).click();
      const confirm = page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });
      await expect(confirm).toBeVisible();
      await expect(confirm.getByRole('button', { name: 'Seguir editando' })).toBeFocused();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe discard dialog at ${width}px`).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath(`productos-discard-${width}.png`) });
      await confirm.getByRole('button', { name: 'Seguir editando' }).click();
      await expect(sheet.getByLabel('Estado de publicación')).toHaveValue('draft');
      await page.unrouteAll();
    }
  });

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

  for (const width of [1440, 1024, 768]) {
    test(`matches the archive confirmation at ${width}px without changing its behavior (F2d)`, async ({ page }, testInfo) => {
      const mock = await openList(page, width);
      await page.getByRole('button', { name: TITLE, exact: true }).click();
      const sheet = page.getByRole('dialog', { name: TITLE });
      await sheet.getByLabel('Estado de publicación').selectOption('archived');
      await sheet.getByRole('button', { name: 'Guardar' }).click();
      const archive = page.getByRole('alertdialog', { name: `¿Archivar ${TITLE}?` });
      await expect(archive).toBeVisible();
      await expect(archive.getByText('Deja de verse en la tienda y nadie podrá comprarlo. Los pedidos que ya lo incluyen no cambian. Puedes volver a publicarlo cuando quieras.', { exact: true })).toBeVisible();
      await expect.soft(archive.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
      const cancel = archive.getByRole('button', { name: 'Cancelar', exact: true });
      await expect(cancel).toHaveCSS('box-sizing', 'content-box');
      expect((await cancel.boundingBox())?.height).toBe(46);
      const icon = archive.locator('svg');
      await expect.soft(icon).toHaveAttribute('aria-hidden', 'true');
      await expect.soft(icon).toHaveAttribute('width', '22');
      await expect.soft(icon).toHaveAttribute('height', '22');
      await expect.soft(icon.locator('path')).toHaveAttribute('d', 'M3 7h18M5 7v12h14V7M9 11h6M9 3h6');
      await expect.soft(icon).toHaveCSS('stroke', 'rgb(155, 28, 28)');
      const circle = icon.locator('..');
      await expect.soft(circle).toHaveCSS('width', '48px');
      await expect.soft(circle).toHaveCSS('height', '48px');
      await expect.soft(circle).toHaveCSS('border-radius', '50%');
      await expect.soft(circle).toHaveCSS('background-color', 'rgb(243, 230, 196)');
      await expect.soft(archive).toHaveCSS('border', '1px solid rgb(230, 217, 188)');
      await expect.soft(archive).toHaveCSS('border-radius', '20px');
      await expect.soft(archive).toHaveCSS('padding', '24px');
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe archive dialog at ${width}px`).toEqual([]);
      await archive.screenshot({ path: testInfo.outputPath(`productos-archive-${width}.png`) });
      expect(mock.writes).toEqual([]);
      await archive.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect(sheet.getByLabel('Estado de publicación')).toHaveValue('archived');
      await sheet.getByRole('button', { name: 'Guardar' }).click();
      await archive.getByRole('button', { name: 'Archivar producto' }).click();
      await expect(sheet).toHaveCount(0);
      expect(mock.writes).toEqual([{ method: 'PATCH', path: '/' + mockProductDetail.id, ifMatch: '"3"', body: { status: 'archived' } }]);
    });
  }

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
