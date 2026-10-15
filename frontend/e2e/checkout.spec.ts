import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

const mockOrderQuoteResponse = {
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
};

const mockPlacedOrderResponse = {
  order_number: 'ORD-7K2M9Q4X',
  status: 'pending_payment',
  placed_at: '2026-10-15T15:00:00Z',
  reservation_expires_at: '2026-10-15T15:30:00Z',
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
      production_date: '2026-10-02',
    },
  ],
  shipping: {
    zone: 'national',
    method: 'standard',
    rate_amount: 950000,
    free_shipping_threshold_amount: 15000000,
    amount_to_free_shipping: 11200000,
  },
  subtotal_amount: 3800000,
  shipping_amount: 950000,
  tax_amount: 0,
  total_amount: 4750000,
  shipping_address: {
    recipient_name: 'María Gómez',
    recipient_phone: '3105550142',
    municipality_code: '41551',
    municipality_name: 'Pitalito',
    department_name: 'Huila',
    address_line1: 'Calle 5 # 12-34',
    address_line2: null,
    delivery_notes: null,
  },
  shipment: null,
  tracking_token: 'tok_test123456789',
};

test.describe('Checkout Flow (S3, S4, S5, S6)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);

    // Mock quote API endpoint
    await page.route('**/api/v1/orders/quote', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        const body = request.postDataJSON();
        if (body?.municipality_code === '88564') {
          // Unsupported destination example (Providencia)
          await route.fulfill({
            status: 422,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'https://monteluna.co/errors/unsupported-destination',
              title: 'Unsupported Destination',
              status: 422,
              code: 'unsupported_destination',
              detail: 'No shipping rate covers the given destination and weight band',
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(mockOrderQuoteResponse),
        });
        return;
      }
      await route.continue();
    });

    // Mock order placement endpoint
    await page.route('**/api/v1/orders', async (route) => {
      const request = route.request();
      if (request.method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify(mockPlacedOrderResponse),
        });
        return;
      }
      await route.continue();
    });

    // Mock guest order tracking endpoint
    await page.route('**/api/v1/orders/track*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        const url = new URL(request.url());
        const token = url.searchParams.get('token');
        if (token === 'tok_test123456789') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockPlacedOrderResponse),
          });
          return;
        }
        await route.fulfill({
          status: 404,
          contentType: 'application/problem+json',
          body: JSON.stringify({
            type: 'https://monteluna.co/problems/not-found',
            title: 'Not Found',
            status: 404,
            code: 'order_not_found',
            detail: 'Order not found',
          }),
        });
        return;
      }
      await route.continue();
    });
  });

  test('empty cart displays empty state notice on /checkout', async ({ page }) => {
    await page.goto('/checkout');
    await expect(page.locator('h1')).toHaveText('Tu carrito está vacío');
    await expect(page.locator('a:has-text("Explorar la tienda")')).toBeVisible();
  });

  test('validates required fields, triggers quote calculation, and proceeds to payment shell', async ({
    page,
  }) => {
    // 1. Seed cart in localStorage
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

    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    // Verify Step 2 header & DIVIPOLA attribution
    await expect(page.locator('h1')).toHaveText('¿A dónde lo enviamos?');
    await expect(page.locator('text=DANE (DIVIPOLA)')).toBeVisible();
    await expect(page.locator('text=CC BY-SA 4.0')).toBeVisible();

    // Verify no coupon field is present anywhere on the page (Finding L22)
    await expect(page.locator('input[placeholder*="cupón" i]')).toHaveCount(0);
    await expect(page.locator('input[placeholder*="cupon" i]')).toHaveCount(0);
    await expect(page.locator('button:has-text("Aplicar")')).toHaveCount(0);

    // 2. Submit empty form to trigger validation errors
    const submitBtn = page.locator('button:has-text("Continuar al pago"):visible');
    await submitBtn.click();

    await expect(page.locator('text=Faltan datos requeridos para continuar')).toBeVisible();
    await expect(page.locator('text=Escribe tu correo')).toBeVisible();
    await expect(page.locator('text=Escribe tu nombre completo')).toBeVisible();

    // 3. Fill required fields
    await page.fill('#checkout-email', 'maria.gomez@correo.com');
    await page.fill('#checkout-fullname', 'María Gómez');
    await page.fill('#checkout-recipient-phone', '3105550142');

    // Select Department (Huila: 41)
    await page.selectOption('#checkout-department', '41');

    // Select Municipality (Pitalito: 41551)
    await page.selectOption('#checkout-municipality', '41551');

    // Fill address
    await page.fill('#checkout-address1', 'Calle 5 # 12-34');

    // Accept data policy
    await page.locator('label[for="checkout-consent-data-policy"]').click();

    // 4. Verify live quote results rendered
    await expect(page.locator('text=Envío a Pitalito, Huila')).toBeVisible();
    await expect(page.locator('text=Llega en 2 a 4 días hábiles')).toBeVisible();
    await expect(page.locator('text=$47.500').first()).toBeVisible();

    // 5. Check WCAG 2 A/AA accessibility with form populated
    const accessibilityScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(accessibilityScanResults.violations).toEqual([]);

    // 6. Continue to Step 3 (Payment shell)
    await page.locator('button:has-text("Continuar al pago"):visible').click();

    // Verify Step 3 header & Wompi payment method cards
    await expect(page.locator('h1')).toHaveText('Revisa y paga');
    await expect(page.locator('text=Pagas en la ventana segura de Wompi.')).toBeVisible();
    await expect(page.getByRole('list', { name: 'Medios de pago disponibles' }).getByText('Tarjeta', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Medios de pago disponibles' }).getByText('PSE', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Medios de pago disponibles' }).getByText('Nequi', { exact: true })).toBeVisible();
    await expect(page.getByRole('list', { name: 'Medios de pago disponibles' }).getByText('Bancolombia', { exact: true })).toBeVisible();
    await expect(page.locator('button:has-text("Pagar $47.500")')).toBeVisible();
    await expect(page.locator('text=El pago en línea estará disponible pronto.')).toBeVisible();
    const payBtn = page.locator('button:has-text("Pagar $47.500")');
    await expect(payBtn).toHaveAttribute('aria-disabled', 'true');

    // Verify contact review summary in Step 3
    await expect(page.locator('text=María Gómez').first()).toBeVisible();
    await expect(page.locator('text=maria.gomez@correo.com')).toBeVisible();
    await expect(page.locator('text=Calle 5 # 12-34')).toBeVisible();
    await expect(page.locator('text=Pitalito, Huila')).toBeVisible();

    // Verify order reservation link to /pedido?token=... in Step 3 (S4, S5)
    const trackingLink = page.locator('a[href*="/pedido?token=tok_test123456789"]').first();
    await expect(trackingLink).toBeVisible();

    // Verify cart was cleared in localStorage
    const storedCart = await page.evaluate(() => localStorage.getItem('monteluna:cart'));
    expect(storedCart).toBe('{}');

    // Check WCAG 2 A/AA on Step 3
    const step3ScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(step3ScanResults.violations).toEqual([]);

    // 7. Click on tracking link and navigate to Guest Order Tracking Page (/pedido)
    await Promise.all([
      page.waitForURL(/.*\/pedido\?token=tok_test123456789/),
      trackingLink.click(),
    ]);

    // Verify /pedido page content and canvas elements (M-Pedido / M-Pedido-390)
    await expect(page.locator('text=ORD-7K2M9Q4X')).toBeVisible();
    await expect(page.locator('text=Estamos confirmando tu pago.')).toBeVisible();
    await expect(page.locator('text=Tu pedido sigue apartado')).toBeVisible();
    await expect(page.locator('text=Calle 5 # 12-34')).toBeVisible();
    await expect(page.locator('text=Pitalito, Huila')).toBeVisible();
    await expect(page.locator('text=Finca El Mirador')).toBeVisible();
    await expect(page.locator('text=$47.500').first()).toBeVisible();

    // Check WCAG 2 A/AA on /pedido
    const pedidoScanResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(pedidoScanResults.violations).toEqual([]);
  });

  test('displays unsupported destination alert when selecting non-covered municipality', async ({
    page,
  }) => {
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

    await page.goto('/checkout');
    await page.waitForLoadState('networkidle');

    // Select San Andrés y Providencia (88)
    await page.selectOption('#checkout-department', '88');

    // Select Providencia (88564)
    await page.selectOption('#checkout-municipality', '88564');

    // Verify unsupported destination banner
    await expect(page.locator('text=Todavía no llegamos a Providencia')).toBeVisible();
    await expect(page.locator('text=Prueba con otro municipio o escríbenos.')).toBeVisible();
  });
});
