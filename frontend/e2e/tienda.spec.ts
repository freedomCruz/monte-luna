import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Tienda (/tienda)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('displays coffee and cacao products and hydronated live prices/status', async ({ page }) => {
    await page.goto('/tienda');

    // 1. Verify Page Title & Heading
    await expect(page).toHaveTitle(/Tienda · Monteluna/);
    const heading = page.getByRole('heading', { level: 1, name: /Café y Cacao de Origen/i });
    await expect(heading).toBeVisible();

    // 2. Coffee & Cacao product cards exist (find specifically by their heading)
    const miradorCard = page.locator('article', { has: page.getByRole('heading', { name: 'Finca El Mirador' }) }).first();
    const mariaCard = page.locator('article', { has: page.getByRole('heading', { name: 'Finca La María' }) }).first();
    const choc70Card = page.locator('article', { has: page.getByRole('heading', { name: 'Chocolate 70%' }) }).first();
    const choc85Card = page.locator('article', { has: page.getByRole('heading', { name: 'Chocolate 85%' }) }).first();

    await expect(miradorCard).toBeVisible();
    await expect(mariaCard).toBeVisible();
    await expect(choc70Card).toBeVisible();
    await expect(choc85Card).toBeVisible();

    // 3. Post-hydration prices and badges are rendered in the card price slots
    // Finca El Mirador: in_stock variants start from $32.000 COP
    const miradorPriceSlot = page.locator('[data-live-price-slot="finca-el-mirador"]').first();
    await expect(miradorPriceSlot).toContainText('$32.000');

    // Finca La María: in_stock variants start from $36.000 COP with compare_at $40.000
    const mariaPriceSlot = page.locator('[data-live-price-slot="finca-la-maria"]').first();
    await expect(mariaPriceSlot).toContainText('$36.000');

    // Live savings badge: "Ahorras $4.000" rendered on Finca La María
    const mariaSavingsSlot = page.locator('[data-live-savings-slot="finca-la-maria"]').first();
    await expect(mariaSavingsSlot).toContainText('Ahorras $4.000');

    // Chocolate 70%: $18.000 COP with compare_at $20.000 -> Ahorras $2.000
    const choc70PriceSlot = page.locator('[data-live-price-slot="chocolate-70"]').first();
    await expect(choc70PriceSlot).toContainText('$18.000');
    const choc70SavingsSlot = page.locator('[data-live-savings-slot="chocolate-70"]').first();
    await expect(choc70SavingsSlot).toContainText('Ahorras $2.000');

    // Chocolate 85%: all variants are out_of_stock in our fixture -> renders "Agotado" pill, empty savings
    const choc85PriceSlot = page.locator('[data-live-price-slot="chocolate-85"]').first();
    await expect(choc85PriceSlot).toContainText('Agotado');
    const choc85SavingsSlot = page.locator('[data-live-savings-slot="chocolate-85"]').first();
    await expect(choc85SavingsSlot).toBeEmpty();

    // 4. Invariant: NO add-to-cart or buy buttons anywhere on /tienda
    const addToCartButtons = page.getByRole('button', { name: /comprar|carrito|agregar/i });
    await expect(addToCartButtons).toHaveCount(0);
  });
});
