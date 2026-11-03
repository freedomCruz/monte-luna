import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockPaidOrder } from '../src/mocks/admin-orders';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';

const owner: AdminUser = {
  id: '01900000-0000-7000-8000-000000000001',
  email: 'laura@monteluna.co',
  display_name: 'Laura Ríos',
  role: 'owner',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  version: 1,
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};

const URL = `/admin/pedido/?id=${mockPaidOrder.id}`;

async function open(page: Page, path = URL) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: '"1"', 'Cache-Control': 'no-store' },
    body: JSON.stringify(owner),
  }));
  const mock = await mockAdminOrdersRoutes(page);
  await page.goto(path);
  return mock;
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();

test.describe('Admin Pedido (F3: S4, S5, S8)', () => {
  test('never prerenders order data', async ({ request }) => {
    const html = await (await request.get(URL)).text();
    expect(html).not.toContain('ORD-');
    expect(html).not.toContain('Calle 10');
  });

  test('shows the order and has no WCAG A/AA violations', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('heading', { name: 'Productos · 3 unidades' })).toBeVisible();
    await expect(page.getByText('Pagado · por despachar')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Factura' })).toHaveCount(0);
    expect((await axe(page)).violations).toEqual([]);
  });

  test('registers the dispatch from the sheet and reaches Enviado', async ({ page }, testInfo) => {
    const mock = await open(page);
    const mobile = testInfo.project.name === 'chromium-mobile';
    await page.getByRole('button', { name: 'Registrar despacho' }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Registrar despacho' });
    await expect(sheet).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await sheet.getByLabel('Transportadora').fill('Coordinadora');
    await sheet.getByLabel(/Número de guía/).fill('54872013369');
    await sheet.getByRole('button', { name: 'Registrar despacho' }).click();
    await expect(page.getByText('Despacho registrado. Le avisamos a María por correo.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Marcar como entregado' })).toBeVisible({ timeout: 10_000 });
    expect(mock.writes).toEqual(['dispatch']);
    if (!mobile) await expect(page.getByRole('region', { name: 'Envío' })).toContainText('Coordinadora');
  });

  test('cancels from the menu with a reason that reaches the timeline', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Cancelling is desktop and tablet only');
    await open(page);
    await page.getByRole('button', { name: 'Más acciones: cancelar pedido' }).click();
    await page.getByRole('menuitem', { name: 'Cancelar pedido' }).click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
    await dialog.getByLabel(/Motivo/).fill('Cliente lo pidió');
    await dialog.getByRole('button', { name: 'Cancelar pedido' }).click();
    await expect(page.getByRole('region', { name: 'Línea de tiempo' })).toContainText('Cliente lo pidió');
    await expect(page.getByRole('button', { name: 'Más acciones: cancelar pedido' })).toHaveCount(0);
  });

  test('moves to preparing and then dispatches from preparing', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'The prepare action is not on the 390 px canvas');
    await open(page);
    await page.getByRole('button', { name: 'Pasar a «En preparación»' }).click();
    await expect(page.getByRole('button', { name: 'Pasar a «En preparación»' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Registrar despacho' })).toBeVisible();
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`renders Pedido at ${width}px, with the sheet`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width, height: 1000 });
      await open(page);
      await expect(page.getByRole('heading', { name: 'Productos · 3 unidades' })).toBeVisible();
      const lotsVisible = await page.getByText('· tostado 12 oct').isVisible();
      expect(lotsVisible).toBe(width > 390);
      await page.screenshot({ path: testInfo.outputPath(`pedido-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Registrar despacho' }).first().click();
      const sheet = page.getByRole('dialog', { name: 'Registrar despacho' });
      await expect(sheet).toBeVisible();
      const box = await sheet.boundingBox();
      expect(Math.round(box!.width)).toBe(width >= 1024 ? 520 : width);
      await page.screenshot({ path: testInfo.outputPath(`pedido-${width}-sheet.png`) });
    });
  }
});
