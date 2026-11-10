import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockProductDetail, mockProductRows } from '../src/mocks/admin-products';
import { mockAdminInventoryRoutes } from './helpers/mock-admin-inventory';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockAdminProductsRoutes } from './helpers/mock-admin-products';

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

interface SessionControl {
  /** Session checks received, the first one on load and one per section change. */
  checks: () => number;
  /** From now on the backend answers that the session expired. */
  expire: () => void;
}

async function prepare(page: Page): Promise<SessionControl> {
  let checks = 0;
  let expired = false;
  await page.route('**/api/v1/admin/sessions/current', (route) => {
    checks += 1;
    if (expired) {
      return route.fulfill({
        status: 401,
        contentType: 'application/problem+json',
        headers: { 'Cache-Control': 'no-store' },
        body: JSON.stringify({ type: 'https://monteluna.co/problems/authentication_required', title: 'authentication_required', status: 401, code: 'authentication_required' }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { ETag: `"${owner.version}"`, 'Cache-Control': 'no-store' },
      body: JSON.stringify(owner),
    });
  });
  await mockAdminOrdersRoutes(page);
  await mockAdminProductsRoutes(page);
  await mockAdminInventoryRoutes(page);
  return { checks: () => checks, expire: () => { expired = true; } };
}

const sidebar = (page: Page) => page.getByRole('navigation', { name: 'Secciones del panel' });
const heading = (page: Page, name: string | RegExp) => page.getByRole('heading', { level: 1, name });
const inicio = (page: Page) => heading(page, 'Hola, Laura');
const productHeading = (page: Page) => heading(page, mockProductDetail.title);
const dialog = (page: Page) => page.getByRole('alertdialog', { name: '¿Salir sin guardar?' });

async function openProductFromList(page: Page) {
  await page.getByRole('button', { name: `Acciones de ${mockProductRows[0].title}` }).click();
  await page.getByRole('menuitem', { name: 'Editar producto' }).click();
  await expect(productHeading(page)).toBeVisible();
}

test.describe('Admin persistent navigation (admin-navigation-v1 T3: S2)', () => {
  test.beforeEach(async ({ page, browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium desktop contract');
    await page.setViewportSize({ width: 1440, height: 900 });
  });

  test('moves between sections without a document load, keeping the same shell, and revalidates the session each time', async ({ page }) => {
    const session = await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();

    const documents: string[] = [];
    page.on('request', (request) => { if (request.resourceType() === 'document') documents.push(request.url()); });
    await page.evaluate(() => {
      (window as unknown as { shellMarker: string }).shellMarker = 'same document';
      document.querySelector('nav[aria-label="Secciones del panel"]')?.setAttribute('data-marker', 'same shell');
    });

    const steps: [string | RegExp, string | RegExp, string, string][] = [
      ['Productos', 'Productos', '/admin/productos/', 'Productos · Admin Monteluna'],
      ['Inventario', 'Inventario y lotes', '/admin/inventario/', 'Inventario · Admin Monteluna'],
      [/^Pedidos/, 'Pedidos', '/admin/pedidos/', 'Pedidos · Admin Monteluna'],
      [/^Inicio$/, 'Hola, Laura', '/admin/', 'Inicio · Admin Monteluna'],
    ];
    let checks = session.checks();
    for (const [link, name, path, title] of steps) {
      await sidebar(page).getByRole('link', { name: link }).click();
      await expect(heading(page, name)).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(sidebar(page).getByRole('link', { name: link })).toHaveAttribute('aria-current', 'page');
      // Accessibility of the swap: focus on the new title, the page title and a polite announcement.
      await expect(heading(page, name)).toBeFocused();
      await expect(page).toHaveTitle(title);
      await expect(page.locator('[aria-live="polite"]')).toHaveText(title);
      // The session is checked again in the background, once per change.
      await expect.poll(() => session.checks()).toBe(checks + 1);
      checks += 1;
    }

    expect(await page.evaluate(() => (window as unknown as { shellMarker?: string }).shellMarker)).toBe('same document');
    await expect(page.locator('nav[aria-label="Secciones del panel"][data-marker="same shell"]')).toHaveCount(1);
    expect(documents).toEqual([]);
  });

  test('also takes links rendered in portals: the user menu and the quick view sheet', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/productos/');
    await expect(heading(page, 'Productos')).toBeVisible();
    const documents: string[] = [];
    page.on('request', (request) => { if (request.resourceType() === 'document') documents.push(request.url()); });

    await page.getByRole('button', { name: `Acciones de ${mockProductRows[0].title}` }).click();
    await page.getByRole('menuitem', { name: 'Vista rápida' }).click();
    await page.getByRole('dialog').getByRole('link', { name: /Editar el producto completo/ }).click();
    await expect(productHeading(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/admin/producto/');

    await page.getByRole('button', { name: 'Menú de Laura Ríos' }).click();
    await page.getByRole('menuitem', { name: 'Mi cuenta' }).click();
    await expect(heading(page, 'Mi cuenta')).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/admin/cuenta/');
    expect(documents).toEqual([]);
  });

  test('keeps the sidebar visible while the next section loads and never shows the session skeleton again', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();

    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    await page.route('**/api/v1/admin/products?**', async (route) => {
      await gate;
      await route.fallback();
    });
    await sidebar(page).getByRole('link', { name: 'Productos' }).click();

    await expect(heading(page, 'Productos')).toBeVisible();
    await expect(sidebar(page)).toBeVisible();
    await expect(page.getByRole('status', { name: 'Comprobando tu sesión' })).toHaveCount(0);
    release();
    await expect(page.getByRole('button', { name: `Acciones de ${mockProductRows[0].title}` })).toBeVisible();
  });

  test('follows the browser back and forward buttons', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();
    await sidebar(page).getByRole('link', { name: /^Pedidos/ }).click();
    await expect(heading(page, 'Pedidos')).toBeVisible();
    await sidebar(page).getByRole('link', { name: 'Productos' }).click();
    await expect(heading(page, 'Productos')).toBeVisible();

    await page.goBack();
    await expect(heading(page, 'Pedidos')).toBeVisible();
    await expect(sidebar(page).getByRole('link', { name: /^Pedidos/ })).toHaveAttribute('aria-current', 'page');
    await expect(page).toHaveTitle('Pedidos · Admin Monteluna');
    await page.goBack();
    await expect(inicio(page)).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/admin/');

    await page.goForward();
    await expect(heading(page, 'Pedidos')).toBeVisible();
    await page.goForward();
    await expect(heading(page, 'Productos')).toBeVisible();
  });

  test('reads the filters again when the same section is opened with another address', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/productos/');
    const search = page.getByPlaceholder('Buscar por nombre o SKU');
    await search.fill('Geisha');
    await expect.poll(() => new URL(page.url()).search).not.toBe('');

    await sidebar(page).getByRole('link', { name: 'Productos' }).click();
    await expect(page).toHaveURL(/\/admin\/productos\/$/);
    await expect(search).toHaveValue('');

    await page.goBack();
    await expect.poll(() => new URL(page.url()).search).not.toBe('');
    await expect(search).toHaveValue('Geisha');
  });

  test('ends at sign-in, with a document load, when the session expired during navigation', async ({ page }) => {
    const session = await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();

    session.expire();
    await sidebar(page).getByRole('link', { name: /^Pedidos/ }).click();
    await expect(page).toHaveURL(/\/admin\/ingresar\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  test('leaves modified clicks and external links to the browser', async ({ page, context }) => {
    await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();

    const [popup] = await Promise.all([
      context.waitForEvent('page'),
      sidebar(page).getByRole('link', { name: 'Productos' }).click({ modifiers: ['Control'] }),
    ]);
    expect(new URL(popup.url()).pathname === '/admin/productos/' || popup.url() === 'about:blank').toBe(true);
    await popup.close();
    expect(new URL(page.url()).pathname).toBe('/admin/');
    await expect(inicio(page)).toBeVisible();
  });

  test.describe('unsaved changes', () => {
    test('asks before a link leaves an edited product, and again for the sidebar', async ({ page }) => {
      await prepare(page);
      await page.goto('/admin/productos/');
      await openProductFromList(page);
      await page.getByLabel('Nombre').fill('Finca El Mirador – Geisha Natural');

      await page.getByRole('navigation', { name: 'Ruta' }).getByRole('link', { name: 'Productos' }).click();
      await expect(dialog(page)).toBeVisible();
      await expect(dialog(page).getByText(`Perderás los cambios que hiciste en ${mockProductDetail.title}.`)).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect(page.getByLabel('Nombre')).toHaveValue('Finca El Mirador – Geisha Natural');
      expect(new URL(page.url()).pathname).toBe('/admin/producto/');

      await sidebar(page).getByRole('link', { name: /^Pedidos/ }).click();
      await dialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
      await expect(heading(page, 'Pedidos')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/admin/pedidos/');
    });

    test('asks on the browser back button and puts the address back with "Seguir editando"', async ({ page }) => {
      await prepare(page);
      await page.goto('/admin/productos/');
      await openProductFromList(page);
      const address = page.url();
      await page.getByLabel('Nombre').fill('Finca El Mirador – Geisha Natural');

      await page.goBack();
      await expect(dialog(page)).toBeVisible();
      await dialog(page).getByRole('button', { name: 'Seguir editando' }).click();
      await expect(dialog(page)).toHaveCount(0);
      await expect.poll(() => page.url()).toBe(address);
      await expect(page.getByLabel('Nombre')).toHaveValue('Finca El Mirador – Geisha Natural');

      await page.goBack();
      await dialog(page).getByRole('button', { name: 'Salir sin guardar' }).click();
      await expect(heading(page, 'Productos')).toBeVisible();
      expect(new URL(page.url()).pathname).toBe('/admin/productos/');
    });

    test('does not ask for an untouched product but asks once a new product has a name', async ({ page }) => {
      await prepare(page);
      await page.goto('/admin/producto/');
      await expect(heading(page, 'Nuevo producto')).toBeVisible();

      await sidebar(page).getByRole('link', { name: 'Productos' }).click();
      await expect(heading(page, 'Productos')).toBeVisible();
      await expect(dialog(page)).toHaveCount(0);

      await page.goBack();
      await expect(heading(page, 'Nuevo producto')).toBeVisible();
      await page.getByLabel('Nombre').fill('Geisha');
      await sidebar(page).getByRole('link', { name: 'Productos' }).click();
      await expect(dialog(page)).toBeVisible();
    });
  });

  test('has no WCAG A/AA violations on a client-navigated section', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/');
    await expect(inicio(page)).toBeVisible();
    await sidebar(page).getByRole('link', { name: /^Pedidos/ }).click();
    await expect(heading(page, 'Pedidos')).toBeFocused();
    await expect(page.getByRole('link', { name: 'Pedidos, 6 pendientes' }).or(page.getByText('Pedidos · 6')).first()).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('has no WCAG A/AA violations with the discard dialog open on a client-navigated screen', async ({ page }) => {
    await prepare(page);
    await page.goto('/admin/productos/');
    await openProductFromList(page);
    await page.getByLabel('Nombre').fill('Finca El Mirador – Geisha Natural');
    await sidebar(page).getByRole('link', { name: /^Pedidos/ }).click();
    await expect(dialog(page)).toBeVisible();

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });
});
