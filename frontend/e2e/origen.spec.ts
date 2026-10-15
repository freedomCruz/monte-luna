import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Origin Detail (/origenes/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('finca-el-mirador: displays origin facts, altitude, location and associated products', async ({ page }) => {
    await page.goto('/origenes/finca-el-mirador');

    // 1. Verify Page Title & Heading
    await expect(page).toHaveTitle(/Finca El Mirador · Origen Monteluna/);
    const heading = page.getByRole('heading', { level: 1, name: 'Finca El Mirador' });
    await expect(heading).toBeVisible();

    // 2. Verify Origin Facts
    // Location, producer, altitude
    await expect(page.locator('dd', { hasText: 'Productor de café demo' })).toBeVisible();
    await expect(page.locator('dd', { hasText: /San Agustín/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /Huila/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /1700 – 1900 m s\. n\. m\./i })).toBeVisible();

    // 3. Verify Associated Products are listed with links to their product detail
    const productCard = page.locator('article', { has: page.getByRole('heading', { name: 'Finca El Mirador' }) }).first();
    await expect(productCard).toBeVisible();

    const detailLink = productCard.locator('a[href="/productos/finca-el-mirador"]').first();
    await expect(detailLink).toBeVisible();

    // 4. Invariant: NO add-to-cart button exists on origin page
    const addToCartButtons = page.getByRole('button', { name: /comprar|carrito|agregar/i });
    await expect(addToCartButtons).toHaveCount(0);
  });

  test('demo-cacao-origin: displays cacao origin facts and associated cacao products', async ({ page }) => {
    await page.goto('/origenes/demo-cacao-origin');

    await expect(page).toHaveTitle(/\[Origen de cacao demo\] · Origen Monteluna/);
    await expect(page.getByRole('heading', { level: 1, name: '[Origen de cacao demo]' })).toBeVisible();

    // Cacao terroir / municipality
    await expect(page.locator('dd', { hasText: /San Vicente de Chucurí/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /Santander/i })).toBeVisible();

    // Associated chocolate product exists
    const chocCard = page.locator('article', { hasText: 'Chocolate 70%' });
    await expect(chocCard).toBeVisible();
  });
});
