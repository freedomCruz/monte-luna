import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockStaffOrderMetrics } from '../src/mocks/admin-orders';

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
const staff: AdminUser = { ...owner, id: '01900000-0000-7000-8000-000000000002', role: 'staff', display_name: 'Andrés Peña', email: 'andres@monteluna.co' };

async function mockSession(page: Page, user: AdminUser) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${user.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(user),
  }));
}

test.describe('Admin Inicio dashboard (F4: S2, S8)', () => {
  test('renders greeting, 4 KPIs, chart, alerts, and latest orders for owner', async ({ page }) => {
    await mockSession(page, owner);
    await mockAdminOrdersRoutes(page);
    await page.goto('/admin/');

    await expect(page.getByRole('heading', { name: 'Hola, Laura', level: 1 })).toBeVisible();
    const vp = page.viewportSize();
    if (!vp || vp.width > 600) { await expect(page.getByText('hora de Colombia')).toBeVisible(); }

    // KPIs
    const kpiRegion = page.getByRole('region', { name: 'Indicadores del periodo' });
    await expect(kpiRegion).toBeVisible();
    await expect(kpiRegion.getByText('Ventas pagadas')).toBeVisible();
    await expect(kpiRegion.getByText('$4.860.000')).toBeVisible();
    await expect(kpiRegion.getByText('Pedidos')).toBeVisible();
    await expect(kpiRegion.getByText('92')).toBeVisible();
    await expect(kpiRegion.getByText('Ticket promedio')).toBeVisible();
    await expect(kpiRegion.getByText('$52.800')).toBeVisible();
    await expect(kpiRegion.getByText('Unidades vendidas')).toBeVisible();
    await expect(kpiRegion.getByText('168')).toBeVisible();

    // Attention alerts
    const alertsRegion = page.getByRole('region', { name: /Requiere atención/ });
    await expect(alertsRegion).toBeVisible();
    await expect(alertsRegion.getByText(/Pedidos pagados por despachar/)).toBeVisible();
    await expect(alertsRegion.getByText(/Reembolso manual pendiente/)).toBeVisible();

    // Latest orders
    const ordersRegion = page.getByRole('region', { name: 'Últimos pedidos' });
    await expect(ordersRegion).toBeVisible();
    await expect(ordersRegion.getByRole('link', { name: /Ver todos/ })).toHaveAttribute('href', '/admin/pedidos/');

    // Accessible
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('staff role hides refund alerts completely', async ({ page }) => {
    await mockSession(page, staff);
    await mockAdminOrdersRoutes(page, { metrics: mockStaffOrderMetrics });
    await page.goto('/admin/');

    await expect(page.getByRole('heading', { name: 'Hola, Andrés', level: 1 })).toBeVisible();
    await expect(page.getByText(/Pedidos pagados por despachar/)).toBeVisible();
    await expect(page.getByText(/reembolso/i)).toHaveCount(0);
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`renders Inicio dashboard at ${width}px`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width, height: 1000 });
      await mockSession(page, owner);
      await mockAdminOrdersRoutes(page);
      await page.goto('/admin/');

      await expect(page.getByRole('heading', { name: 'Hola, Laura', level: 1 })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Indicadores del periodo' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`inicio-${width}.png`), fullPage: true });
    });
  }
});
