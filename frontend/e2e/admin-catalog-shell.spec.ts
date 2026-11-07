import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';

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

const SCREENS = [
  { path: '/admin/productos/', title: 'Productos', nav: 'Productos' },
  { path: '/admin/producto/?id=01900000-0000-7000-8000-0000000000a1', title: 'Producto', nav: 'Productos' },
  { path: '/admin/inventario/', title: 'Inventario', nav: 'Inventario' },
] as const;

async function prepare(page: Page) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${staff.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(staff),
  }));
  await mockAdminOrdersRoutes(page);
}

const GATE = 'Revísalo desde un computador o una tablet';

test.describe('Admin catalog shell and tablet-and-up gate (F1: S1, S7)', () => {
  for (const screen of SCREENS) {
    test(`${screen.path} never prerenders private data`, async ({ request }) => {
      const html = await (await request.get(screen.path.split('?')[0])).text();
      expect(html).not.toContain(staff.display_name);
    });

    for (const width of [1440, 1024, 768]) {
      test(`${screen.title} renders normally inside the shell at ${width}px`, async ({ page, browserName }, testInfo) => {
        test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
        await page.setViewportSize({ width, height: 900 });
        await prepare(page);
        await page.goto(screen.path);
        await expect(page.getByRole('heading', { level: 1, name: screen.title })).toBeVisible();
        await expect(page.getByText(GATE)).toHaveCount(0);
        const sidebar = page.getByRole('navigation', { name: 'Secciones del panel' });
        await expect(sidebar.getByRole('link', { name: screen.nav })).toHaveAttribute('aria-current', 'page');
        await expect(sidebar.getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/admin/productos/');
        await expect(sidebar.getByRole('link', { name: 'Inventario' })).toHaveAttribute('href', '/admin/inventario/');
        await expect(sidebar).toHaveCSS('width', width === 1440 ? '248px' : '72px');
      });
    }

    test(`${screen.title} shows only the use-a-computer-or-tablet message at 390px`, async ({ page, browserName }, testInfo) => {
      test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
      await page.setViewportSize({ width: 390, height: 844 });
      await prepare(page);
      await page.goto(screen.path);
      await expect(page.getByRole('heading', { level: 1, name: GATE })).toBeVisible();
      await expect(page.getByRole('heading', { level: 1, name: screen.title })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Productos' })).toHaveCount(0);
      await expect(page.getByRole('link', { name: 'Inventario' })).toHaveCount(0);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations).toEqual([]);
    });
  }

  test('has no WCAG A/AA violations at 1024px', async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
    await page.setViewportSize({ width: 1024, height: 900 });
    await prepare(page);
    await page.goto('/admin/productos/');
    await expect(page.getByRole('heading', { level: 1, name: 'Productos' })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
