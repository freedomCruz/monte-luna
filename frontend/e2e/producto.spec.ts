import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Product Detail (/productos/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('finca-el-mirador: variant selection updates price, roast date and out-of-stock badge', async ({ page }) => {
    await page.goto('/productos/finca-el-mirador');

    // 1. Verify Page Title & Heading
    await expect(page).toHaveTitle(/Finca El Mirador · Monteluna/);
    await expect(page.getByRole('heading', { level: 1, name: 'Finca El Mirador' })).toBeVisible();

    // 2. Initial state (default selection: 250g, Whole bean)
    // Price: $32.000, roast date: 1 oct 2026
    const island = page.locator('[data-testid="product-purchase-island"]');
    await expect(island).toBeVisible();

    await expect(island).toContainText('$32.000');
    await expect(island).toContainText('Tostado el 1 oct 2026');
    await expect(island).toContainText('Disponible en 250 · Whole bean');

    // 3. Select out-of-stock variant (250g, Fine)
    // The option chip for "Fine" has "Agotado" indicator and clicking it sets out of stock
    const fineBtn = page.getByRole('button', { name: /fine/i });
    await expect(fineBtn).toContainText('Agotado');
    await fineBtn.click();

    await expect(island).toContainText('Sin existencias para 250 · Fine');

    // 4. Select discounted variant with compare-at price (250g, Medium)
    // price: 32.000, compare_at: 35.000, savings: 3.000, roast: 2 oct 2026
    const mediumBtn = page.getByRole('button', { name: /^medium$/i });
    await mediumBtn.click();

    await expect(island).toContainText('$32.000');
    await expect(island).toContainText('$35.000');
    await expect(island).toContainText('Ahorras $3.000');
    await expect(island).toContainText('Tostado el 2 oct 2026');
    await expect(island).toContainText('Disponible en 250 · Medium');

    // 5. Select 500g presentation
    // Switch presentation to 500g (with Medium still selected -> in_stock, $58.000, 30 sep 2026)
    const pres500Btn = page.getByRole('button', { name: /^500$/i });
    await pres500Btn.click();

    await expect(island).toContainText('$58.000');
    await expect(island).toContainText('Tostado el 30 sep 2026');
    await expect(island).toContainText('Disponible en 500 · Medium');

    // 6. Invariant Gate G2 / S4: NO add-to-cart button exists anywhere on the page
    const addToCartButtons = page.getByRole('button', { name: /comprar|carrito|agregar/i });
    await expect(addToCartButtons).toHaveCount(0);
  });

  test('chocolate-85: product without origin displays no origin link and shows out-of-stock badge', async ({ page }) => {
    await page.goto('/productos/chocolate-85');

    await expect(page).toHaveTitle(/Chocolate 85% · Monteluna/);
    await expect(page.getByRole('heading', { level: 1, name: 'Chocolate 85%' })).toBeVisible();

    // S5 Invariant: Product without origin shows no origin link
    const originLinks = page.locator('a[href^="/origenes/"]');
    await expect(originLinks).toHaveCount(0);

    // Island renders Agotado since all variants are out_of_stock
    const island = page.locator('[data-testid="product-purchase-island"]');
    await expect(island).toContainText('Sin existencias');

    // Invariant Gate G2 / S4: NO add-to-cart button
    const addToCartButtons = page.getByRole('button', { name: /comprar|carrito|agregar/i });
    await expect(addToCartButtons).toHaveCount(0);
  });
});
