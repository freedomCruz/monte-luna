import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
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

async function open(page: Page) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: '"1"', 'Cache-Control': 'no-store' },
    body: JSON.stringify(owner),
  }));
  await mockAdminOrdersRoutes(page);
  await page.goto('/admin/pedidos/');
}

test.describe('Admin Pedidos (F2: S3, S8)', () => {
  test('never prerenders order data', async ({ request }) => {
    const html = await (await request.get('/admin/pedidos/')).text();
    expect(html).not.toContain('ORD-');
    expect(html).not.toContain('María Fernanda');
  });

  test('lists orders for the viewport and has no WCAG A/AA violations', async ({ page }, testInfo) => {
    await open(page);
    const mobile = testInfo.project.name === 'chromium-mobile';
    await expect(page.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible();
    if (mobile) {
      await expect(page.getByRole('link', { name: /ORD-7K2M9Q4X/ })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Por despachar · 6' })).toBeVisible();
    } else {
      await expect(page.getByRole('link', { name: 'ORD-7K2M9Q4X' })).toBeVisible();
      await expect(page.getByRole('checkbox')).toHaveCount(0);
      await expect(page.getByRole('status')).toHaveText('1–8 de 8 pedidos');
    }
    expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations).toEqual([]);
  });

  test('applies Por despachar from the header link and clears it', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop toolbar');
    await open(page);
    await page.getByRole('button', { name: 'Ver despachos pendientes · 6' }).click();
    await expect(page).toHaveURL(/pending_dispatch=true/);
    await expect(page.getByRole('button', { name: 'Por despachar', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(page).not.toHaveURL(/pending_dispatch/);
  });

  test('filters from the Estado menu', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === 'chromium-mobile', 'Desktop toolbar');
    await open(page);
    await page.getByRole('button', { name: 'Estado', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Pagado' }).check();
    await expect(page).toHaveURL(/status=paid/);
    await expect(page.getByRole('button', { name: 'Estado: Pagado' })).toBeVisible();
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`renders Pedidos at ${width}px`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width, height: 1000 });
      await open(page);
      await expect(page.getByRole('heading', { name: 'Pedidos', level: 1 })).toBeVisible();
      if (width > 390) {
        await expect(page.getByRole('link', { name: 'ORD-7K2M9Q4X' })).toBeVisible();
        const visible = async (name: string) => page.getByRole('columnheader', { name, exact: true }).isVisible();
        expect(await visible('Fecha ↓')).toBe(width >= 1024);
        expect(await visible('Pago')).toBe(width >= 1024);
        expect(await visible('Destino')).toBe(width >= 1440);
        expect(await visible('Método')).toBe(width >= 1440);
      } else {
        await expect(page.getByRole('link', { name: /ORD-7K2M9Q4X/ })).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath(`pedidos-${width}.png`), fullPage: true });
    });
  }
});
