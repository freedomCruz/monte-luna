import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Inicio (/)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('renders the home sections with live prices and marks Inicio as current', async ({ page }) => {
    await page.goto('/');

    await expect(page.getByRole('heading', { level: 1, name: 'Café y cacao de las montañas de Colombia.' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Principal' }).getByRole('link', { name: 'Inicio' })).toHaveAttribute(
      'aria-current',
      'page'
    );

    // Product grid: first four catalog products with prices fetched in the browser
    const cards = page.locator('article[id^="inicio-"]');
    await expect(cards).toHaveCount(4);
    await expect(page.locator('[data-live-price-slot="finca-el-mirador"]')).toContainText('$32.000');
    await expect(page.locator('[data-live-savings-slot="finca-la-maria"]')).toContainText('Ahorras $4.000');
    await expect(page.locator('main').getByRole('button', { name: /comprar|carrito|agregar/i })).toHaveCount(0);

    // Origin band links to the first origin page
    await page.getByRole('link', { name: 'Conocer Finca El Mirador' }).click();
    await expect(page).toHaveURL(/\/origenes\/finca-el-mirador\/?$/);
  });

  test('stops the marquee and floating animations under reduced motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    for (const selector of ['.cinta', '.flota', '.flota-b']) {
      const animation = await page.locator(selector).first().evaluate((el) => getComputedStyle(el).animationName);
      expect(animation, selector).toBe('none');
    }
  });

  test('has no detectable accessibility violations', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[data-live-price-slot="finca-el-mirador"]')).toContainText('$32.000');

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(results.violations).toEqual([]);
  });

  test('captures home visual evidence (M-Inicio canvas)', async ({ page }, testInfo) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.locator('[data-live-price-slot="finca-el-mirador"]')).toContainText('$32.000');
    await page.screenshot({
      path: `test-results/screenshots/inicio-${testInfo.project.name}.png`,
      fullPage: true,
    });
  });
});
