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
const staff: AdminUser = { ...owner, id: '01900000-0000-7000-8000-000000000002', role: 'staff', display_name: 'Andrés Peña', email: 'andres@monteluna.co' };

async function mockSession(page: Page, user: AdminUser) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${user.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(user),
  }));
}

test.describe('Admin orders shell (F1: S1, S8)', () => {
  test('/admin/ lands on Inicio, never prerenders private data and shows the pending dispatch badge', async ({ page, request }) => {
    const html = await (await request.get('/admin/')).text();
    expect(html).not.toContain(owner.display_name);
    expect(html).not.toContain('ORD-');

    await mockSession(page, owner);
    await mockAdminOrdersRoutes(page);
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/$/);
    const pedidos = page.getByRole('link', { name: /^Pedidos/ }).first();
    await expect(pedidos).toHaveAttribute('href', '/admin/pedidos/');
    await expect(page.getByRole('link', { name: 'Pedidos, 6 pendientes' }).or(page.getByText('Pedidos · 6')).first()).toBeVisible();
  });

  test('staff sees Inicio and Pedidos but not Administradores', async ({ page }) => {
    await mockSession(page, staff);
    await mockAdminOrdersRoutes(page);
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Administradores' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: /^Pedidos/ }).first()).toBeVisible();
  });

  test('has no WCAG A/AA violations', async ({ page }) => {
    await mockSession(page, owner);
    await mockAdminOrdersRoutes(page);
    await page.goto('/admin/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Pedidos, 6 pendientes' }).or(page.getByText('Pedidos · 6')).first()).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  for (const width of [1440, 1024, 768, 390]) {
    test(`renders the shell at ${width}px`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width, height: 900 });
      await mockSession(page, owner);
      await mockAdminOrdersRoutes(page);
      await page.goto('/admin/');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.getByRole('link', { name: 'Pedidos, 6 pendientes' }).or(page.getByText('Pedidos · 6')).first()).toBeVisible();
      if (width >= 391) {
        await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCSS('width', width === 1440 ? '248px' : '72px');
      } else {
        await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible();
      }
      await page.screenshot({ path: testInfo.outputPath(`inicio-shell-${width}.png`) });
    });
  }
});
