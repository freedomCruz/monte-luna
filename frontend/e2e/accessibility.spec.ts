import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

const pagesToScan = [
  { name: 'Tienda', path: '/tienda' },
  { name: 'Product Detail (Coffee with origin)', path: '/productos/finca-el-mirador' },
  { name: 'Product Detail (Cacao without origin)', path: '/productos/chocolate-85' },
  { name: 'Origin Detail (Coffee)', path: '/origenes/finca-el-mirador' },
  { name: 'Origin Detail (Cacao)', path: '/origenes/demo-cacao-origin' },
  { name: 'Cart Page', path: '/carrito' },
];

test.describe('WCAG 2 A/AA Accessibility Scans (axe-core)', () => {
  for (const pageItem of pagesToScan) {
    test(`${pageItem.name} (${pageItem.path}) has zero WCAG 2 A/AA violations`, async ({ page }) => {
      await mockAvailabilitiesRoute(page);
      await page.goto(pageItem.path);

      // Wait for network/hydration to settle
      await page.waitForLoadState('networkidle');

      const accessibilityScanResults = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();

      expect(accessibilityScanResults.violations).toEqual([]);
    });
  }
});
