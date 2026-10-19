import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

const mockBaseOrder = {
  order_number: 'ORD-7K2M9Q4X',
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
};

test.describe('Screenshots for Visual Verification', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('capture /tienda page visual evidence', async ({ page }, testInfo) => {
    await page.goto('/tienda');
    await page.waitForSelector('[data-live-price-slot="finca-el-mirador"] span');
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
    test.setTimeout(60000);
    await page.goto('/productos/finca-el-mirador');
    await page.waitForSelector('#product-purchase-island-container');
    await page.waitForLoadState('networkidle');

    const project = testInfo.project.name;
    await page.screenshot({
      path: `test-results/screenshots/detalle-${project}.png`,
      fullPage: true,
    });
  });

  test('capture checkout Por pagar and Ventana de pago visual evidence (M-Checkout-Pago canvas)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(60000);
    const project = testInfo.project.name;

    // Seed cart with Finca El Mirador
    await page.addInitScript(() => {
      const cart = {
        '01912345-6789-7abc-def0-123456789abc': {
          variant_id: '01912345-6789-7abc-def0-123456789abc',
          product_slug: 'finca-el-mirador',
          product_name: 'Finca El Mirador',
          variant_label: '500 g / Grano entero',
          origin_name: 'Huila',
          quantity: 1,
          product_type: 'coffee',
        },
      };
      localStorage.setItem('monteluna:cart', JSON.stringify(cart));
    });

    // Mock quote
    await page.route('**/api/v1/orders/quote', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          lines: [
            {
              variant_id: '01912345-6789-7abc-def0-123456789abc',
              product_slug: 'finca-el-mirador',
              product_title: 'Finca El Mirador',
              variant_label: '500 g / Grano entero',
              sku: 'MTL-MIR-500-GR',
              unit_price_amount: 3800000,
              quantity: 1,
              line_total_amount: 3800000,
            },
          ],
          shipping: {
            rate_name: 'Huila estándar',
            shipping_amount: 950000,
            is_free_shipping: false,
            estimated_days_min: 2,
            estimated_days_max: 4,
          },
          subtotal_amount: 3800000,
          shipping_amount: 950000,
          tax_amount: 0,
          total_amount: 4750000,
        }),
      });
    });

    // Mock order placement
    await page.route('**/api/v1/orders', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          order_number: 'ORD-7K2M9Q4X',
          status: 'pending_payment',
          tracking_token: 'tok_checkout_shot',
        }),
      });
    });

    // Mock payments initiation (hangs widget open for Ventana de pago screenshot)
    await page.route('**/api/v1/payments', async (route) => {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          checkout: {
            currency: 'COP',
            amount_in_cents: 4750000,
            reference: 'MTL-ORD-7K2M9Q4X-P1',
            public_key: 'pub_test_wompi_mock',
            redirect_url: 'https://monteluna.co/pedido?token=tok_checkout_shot',
            customer_data: {
              email: 'maria.gomez@correo.com',
              full_name: 'María Gómez',
              phone_number: '3105550142',
            },
          },
          expires_at: new Date(Date.now() + 25 * 60 * 1000).toISOString(),
        }),
      });
    });

    // Mock Wompi widget script to avoid external network dependencies
    await page.route('https://checkout.wompi.co/widget.js', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript',
        body: `
          window.WidgetCheckout = function(config) {
            return {
              open: function(callback) {
                // Keep open so we capture the PaymentWindowModal
              }
            };
          };
        `,
      });
    });

    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    // Fill form
    await page.fill('#checkout-email', 'maria.gomez@correo.com');
    await page.fill('#checkout-fullname', 'María Gómez');
    await page.fill('#checkout-recipient-phone', '3105550142');
    await page.selectOption('#checkout-department', '41');
    await page.selectOption('#checkout-municipality', '41551');
    await page.fill('#checkout-address1', 'Calle 5 # 12-34');
    await page.locator('label[for="checkout-consent-data-policy"]').click();

    // Advance to Step 3: Por pagar
    await page.locator('button:has-text("Continuar al pago"):visible').click();
    await page.waitForSelector('text=Revisa y paga');
    await page.waitForLoadState('networkidle');

    // Screenshot 1: Checkout Por pagar
    await page.screenshot({
      path: `test-results/screenshots/checkout-por-pagar-${project}.png`,
      fullPage: true,
    });

    // Click "Pagar $47.500" to open Ventana de pago modal
    await page.locator('button:has-text("Pagar"):visible').first().click();
    await page.waitForSelector('role=dialog[name="ORD-7K2M9Q4X"]');

    // Screenshot 2: Checkout Ventana de pago
    await page.screenshot({
      path: `test-results/screenshots/checkout-ventana-pago-${project}.png`,
      fullPage: true,
    });
  });

  test('capture order tracking visual evidence for all states (/pedido)', async ({
    page,
  }, testInfo) => {
    test.setTimeout(90000);
    const project = testInfo.project.name;

    // 1. Order tracking: Pagado
    await page.route('**/api/v1/orders/track?token=tok_shot_paid', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          status: 'paid',
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

    // 2. Order tracking: Confirmando
    await page.route('**/api/v1/orders/track?token=tok_shot_confirming', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          status: 'pending_payment',
          tracking_token: 'tok_shot_confirming',
          payment: {
            latest_attempt_status: 'pending',
            payment_method_type: 'pse',
          },
        }),
      });
    });
    await page.goto('/pedido?token=tok_shot_confirming');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pedido-confirmando-${project}.png`,
      fullPage: true,
    });

    // 3. Order tracking: Rechazado
    await page.route('**/api/v1/orders/track?token=tok_shot_declined', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          status: 'pending_payment',
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

    // 4. Order tracking: Vencido
    await page.route('**/api/v1/orders/track?token=tok_shot_expired', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          status: 'expired',
          tracking_token: 'tok_shot_expired',
          payment: null,
        }),
      });
    });
    await page.goto('/pedido?token=tok_shot_expired');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pedido-vencido-${project}.png`,
      fullPage: true,
    });

    // 5. Order tracking: Cancelado
    await page.route('**/api/v1/orders/track?token=tok_shot_cancelled', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ...mockBaseOrder,
          status: 'cancelled',
          tracking_token: 'tok_shot_cancelled',
          payment: {
            latest_attempt_status: 'approved',
            payment_method_type: 'card',
          },
        }),
      });
    });
    await page.goto('/pedido?token=tok_shot_cancelled');
    await page.waitForLoadState('networkidle');
    await page.screenshot({
      path: `test-results/screenshots/pedido-cancelado-${project}.png`,
      fullPage: true,
    });
  });
});
