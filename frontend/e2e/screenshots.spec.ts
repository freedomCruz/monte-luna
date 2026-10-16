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

  test('capture /productos/finca-el-mirador visual evidence', async ({ page }, testInfo) => {
    await page.goto('/productos/finca-el-mirador');
    await page.waitForSelector('#product-purchase-island-container');
    await page.waitForLoadState('networkidle');

    const project = testInfo.project.name;
    await page.screenshot({
      path: `test-results/screenshots/detalle-${project}.png`,
      fullPage: true,
    });
  });

  test('capture checkout step 3 and order tracking visual evidence (M-Checkout-Pago, M-Pedido)', async ({
    page,
  }, testInfo) => {
    const project = testInfo.project.name;

    // 1. Order tracking: Pagado
    await page.route('**/api/v1/orders/track?token=tok_shot_paid', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_number: 'ORD-7K2M9Q4X',
          status: 'paid',
          placed_at: '2026-10-15T15:00:00Z',
          reservation_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          lines: [
            {
              variant_id: '01912345-6789-7abc-def0-123456789abc',
              product_slug: 'finca-el-mirador',
              product_title: 'Finca El Mirador',
              variant_label: '500 g / Grano entero',
              sku: 'MTL-MIR-500-GR',
              unit_price_amount: 3800000,
              quantity: 2,
              line_total_amount: 7600000,
              production_date: '2026-10-02',
            },
          ],
          shipping: {
            zone: 'national',
            method: 'standard',
            rate_amount: 950000,
            free_shipping_threshold_amount: 15000000,
            amount_to_free_shipping: 7400000,
          },
          subtotal_amount: 7600000,
          shipping_amount: 950000,
          tax_amount: 0,
          total_amount: 8550000,
          shipping_address: {
            recipient_name: 'Carlos Mendoza',
            recipient_phone: '3001234567',
            municipality_code: '11001',
            municipality_name: 'Bogotá, D.C.',
            department_name: 'Bogotá, D.C.',
            address_line1: 'Carrera 7 # 71-21',
            address_line2: 'Torre B, Apto 502',
            delivery_notes: 'Tocar timbre',
          },
          shipment: null,
          tracking_token: 'tok_shot_paid',
          payment: {
            latest_attempt_status: 'approved',
            payment_method_type: 'nequi',
          },
        }),
      });
    });

    await page.goto('/pedido?token=tok_shot_paid');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pedido-pagado-${project}.png`,
      fullPage: true,
    });

    // 2. Order tracking: Rechazado
    await page.route('**/api/v1/orders/track?token=tok_shot_declined', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          order_number: 'ORD-7K2M9Q4X',
          status: 'pending_payment',
          placed_at: '2026-10-15T15:00:00Z',
          reservation_expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
          lines: [
            {
              variant_id: '01912345-6789-7abc-def0-123456789abc',
              product_slug: 'finca-el-mirador',
              product_title: 'Finca El Mirador',
              variant_label: '500 g / Grano entero',
              sku: 'MTL-MIR-500-GR',
              unit_price_amount: 3800000,
              quantity: 2,
              line_total_amount: 7600000,
              production_date: '2026-10-02',
            },
          ],
          shipping: {
            zone: 'national',
            method: 'standard',
            rate_amount: 950000,
            free_shipping_threshold_amount: 15000000,
            amount_to_free_shipping: 7400000,
          },
          subtotal_amount: 7600000,
          shipping_amount: 950000,
          tax_amount: 0,
          total_amount: 8550000,
          shipping_address: {
            recipient_name: 'Carlos Mendoza',
            recipient_phone: '3001234567',
            municipality_code: '11001',
            municipality_name: 'Bogotá, D.C.',
            department_name: 'Bogotá, D.C.',
            address_line1: 'Carrera 7 # 71-21',
            address_line2: 'Torre B, Apto 502',
            delivery_notes: 'Tocar timbre',
          },
          shipment: null,
          tracking_token: 'tok_shot_declined',
          payment: {
            latest_attempt_status: 'declined',
            payment_method_type: 'card',
          },
        }),
      });
    });

    await page.goto('/pedido?token=tok_shot_declined');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pedido-rechazado-${project}.png`,
      fullPage: true,
    });
  });
});
