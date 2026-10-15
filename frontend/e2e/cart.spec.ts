import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Cart and Header Counter E2E', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('header shows cart button with 0 items initially', async ({ page }) => {
    await page.goto('/tienda');
    await page.waitForLoadState('networkidle');

    const cartBtn = page.locator('header').getByRole('button', { name: /Abrir el carrito/i });
    await expect(cartBtn).toBeVisible();
  });

  test('clicking header cart button opens slide-over panel, escape closes it', async ({ page }) => {
    await page.goto('/tienda');
    await page.waitForLoadState('networkidle');

    const cartBtn = page.locator('header').getByRole('button', { name: /Abrir el carrito/i });
    await cartBtn.click();

    const dialog = page.getByRole('dialog', { name: /Tu carrito/i });
    await expect(dialog).toBeVisible();
    await expect(page.getByText('Tu carrito está vacío')).toBeVisible();

    // Escape closes dialog
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
  });

  test('slide-over panel has zero WCAG 2 A/AA violations when opened', async ({ page }) => {
    await page.goto('/tienda');
    await page.waitForLoadState('networkidle');

    const cartBtn = page.locator('header').getByRole('button', { name: /Abrir el carrito/i });
    await cartBtn.click();

    const dialog = page.getByRole('dialog', { name: /Tu carrito/i });
    await expect(dialog).toBeVisible();

    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();

    expect(accessibilityScanResults.violations).toEqual([]);
  });

  test('persists cart state across reloads and pages via localStorage', async ({ page }) => {
    // Navigate to /tienda first
    await page.goto('/tienda');
    await page.waitForLoadState('networkidle');

    // Inject mock cart directly into localStorage and dispatch storage event
    await page.evaluate(() => {
      const mockCart = {
        '4bb83d96-419b-43fe-a862-2124578b87e1': {
          variant_id: '4bb83d96-419b-43fe-a862-2124578b87e1',
          quantity: 2,
          product_slug: 'finca-el-mirador',
          product_name: 'Finca El Mirador',
          variant_label: '500 g · Grano entero',
          image_url: '/images/packaging-finca-el-mirador.webp',
          origin_slug: 'finca-el-mirador',
          origin_name: 'Finca El Mirador, Huila',
          product_type: 'coffee',
        },
      };
      window.localStorage.setItem('monteluna:cart', JSON.stringify(mockCart));
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'monteluna:cart',
          newValue: JSON.stringify(mockCart),
        })
      );
    });

    // Header counter should update to 2
    const cartBtn = page.locator('header').getByRole('button', { name: /Abrir el carrito \(2 productos\)/i });
    await expect(cartBtn).toBeVisible();

    // Navigate to /carrito full page
    await page.goto('/carrito');
    await page.waitForLoadState('networkidle');

    await expect(page.getByRole('heading', { level: 2 }).getByRole('link', { name: 'Finca El Mirador' })).toBeVisible();
    await expect(page.getByText('500 g · Grano entero')).toBeVisible();
    await expect(page.getByText('2 productos')).toBeVisible();

    // Quantity controls: increment item
    const incBtn = page.getByRole('button', { name: 'Agregar una unidad' });
    await incBtn.click();
    await expect(page.getByText('3 productos')).toBeVisible();

    // Check localStorage was updated
    const saved = await page.evaluate(() => window.localStorage.getItem('monteluna:cart'));
    expect(saved).toContain('"quantity":3');
  });
});
