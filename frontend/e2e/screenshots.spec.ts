import { test } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Screenshots for Visual Verification', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('capture /tienda page visual evidence', async ({ page }, testInfo) => {
    await page.goto('/tienda');
    await page.waitForSelector('[data-live-price-slot="finca-el-mirador"] span');
    // Ensure all images are loaded
    await page.waitForLoadState('networkidle');

    const project = testInfo.project.name;
    await page.screenshot({
      path: `test-results/screenshots/tienda-${project}.png`,
      fullPage: true,
    });
  });

  test('capture /origenes/finca-el-mirador visual evidence', async ({ page }, testInfo) => {
    await page.goto('/origenes/finca-el-mirador');
    await page.waitForSelector('[data-live-price-slot="finca-el-mirador"] span');
    await page.waitForLoadState('networkidle');

    const project = testInfo.project.name;
    await page.screenshot({
      path: `test-results/screenshots/origen-${project}.png`,
      fullPage: true,
    });
  });
});
