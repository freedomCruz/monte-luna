import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';

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

async function mockSession(page: Page, user = owner) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${user.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(user),
  }));
}

async function axe(page: Page) {
  return new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
}

test.describe('Admin access public interface', () => {
  test('sign-in matches the access composition and has no WCAG A/AA violations', async ({ page }) => {
    await page.goto('/admin/ingresar/');
    await expect(page.getByRole('heading', { name: 'Inicia sesión' })).toBeVisible();
    await expect(page.getByLabel('Correo')).toHaveAttribute('autocomplete', 'username');
    await expect(page.getByLabel('Contraseña')).toHaveAttribute('autocomplete', 'current-password');
    expect((await axe(page)).violations).toEqual([]);
  });

  test('reset token is removed from the address bar and never reaches rendered HTML', async ({ page }) => {
    await page.goto('/admin/restablecer-contrasena/#token=secret-reset-token');
    await expect(page).toHaveURL(/\/admin\/restablecer-contrasena\/$/);
    await expect(page.getByRole('heading', { name: 'Crea tu nueva contraseña' })).toBeVisible();
    expect(await page.locator('body').innerHTML()).not.toContain('secret-reset-token');
  });

  test('a staff direct-link to owner administration renders no private administration controls', async ({ page }) => {
    await mockSession(page, staff);
    let listCalled = false;
    await page.route('**/api/v1/admin/users*', (route) => { listCalled = true; return route.abort(); });
    await page.goto('/admin/administradores/');
    await expect(page.getByRole('heading', { name: 'No tienes acceso a esta sección' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Agregar administrador' })).toHaveCount(0);
    expect(listCalled).toBe(false);
  });
});

test.describe('Authenticated admin shell', () => {
  test.beforeEach(async ({ page }) => {
    await mockSession(page);
  });

  test('never prerenders private administrator data', async ({ request }) => {
    const response = await request.get('/admin/cuenta/');
    const html = await response.text();
    expect(html).not.toContain(owner.display_name);
    expect(html).not.toContain(owner.email);
  });

  test('uses 248px at 1440 and 72px at tablet widths', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/admin/cuenta/');
    await expect(page.getByRole('heading', { name: 'Mi cuenta' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCSS('width', '248px');

    for (const width of [1024, 768]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      await expect(page.getByRole('navigation', { name: 'Secciones del panel' })).toHaveCSS('width', '72px');
    }
  });

  test('account and administrators screens have zero WCAG A/AA violations', async ({ page }, testInfo) => {
    await page.route('**/api/v1/admin/users?*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ items: [owner, staff], next_cursor: null }),
    }));
    const mobile = testInfo.project.name === 'chromium-mobile';

    await page.goto('/admin/cuenta/');
    await expect(page.getByRole('heading', { name: mobile ? 'Revísalo desde un computador o una tablet' : 'Mi cuenta' })).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);

    await page.goto('/admin/administradores/');
    await expect(page.getByRole('heading', { name: mobile ? 'Revísalo desde un computador o una tablet' : 'Administradores' })).toBeVisible();
    if (!mobile) await expect(page.getByText('Siempre debe haber al menos una persona propietaria activa.')).toBeVisible();
    expect((await axe(page)).violations).toEqual([]);
  });

  test('390px settings mode does not render editing controls', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Chromium layout contract');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/admin/cuenta/');
    await expect(page.getByRole('heading', { name: 'Revísalo desde un computador o una tablet' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Cambiar contraseña' })).toHaveCount(0);
  });
});
