import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

const expiresFuture = new Date(Date.now() + 25 * 60 * 1000).toISOString();

const mockOrderPending = {
  order_number: 'ORD-7K2M9Q4X',
  status: 'pending_payment',
  placed_at: new Date().toISOString(),
  reservation_expires_at: expiresFuture,
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
  tracking_token: 'tok_pending_valid',
};

const mockOrderShipped = {
  ...mockOrderPending,
  order_number: 'ORD-8Y4B1W9Z',
  status: 'shipped',
  tracking_token: 'tok_shipped_valid',
  shipment: {
    carrier_name: 'Coordinadora',
    tracking_number: 'GUIA-88776655',
    tracking_url: 'https://coordinadora.com/rastreo?guia=GUIA-88776655',
    shipped_at: '2026-10-15T14:30:00Z',
    delivered_at: null,
  },
};

test.describe('Guest Order Tracking Page (/pedido?token=...) (S4, S5)', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);

    await page.route('**/api/v1/orders/track*', async (route) => {
      const request = route.request();
      if (request.method() === 'GET') {
        const url = new URL(request.url());
        const token = url.searchParams.get('token');

        if (token === 'tok_pending_valid') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockOrderPending),
          });
          return;
        }

        if (token === 'tok_shipped_valid') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(mockOrderShipped),
          });
          return;
        }

        if (token === 'tok_invalid_format') {
          await route.fulfill({
            status: 400,
            contentType: 'application/problem+json',
            body: JSON.stringify({
              type: 'https://monteluna.co/problems/invalid-token',
              title: 'Bad Request',
              status: 400,
              code: 'invalid_token_format',
              detail: 'Token has an invalid format',
            }),
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

  test('displays missing token error state when token query param is omitted', async ({ page }) => {
    await page.goto('/pedido');
    await expect(page.locator('h1')).toHaveText('Enlace no válido');
    await expect(
      page.locator('text=No se proporcionó un token de seguimiento.')
    ).toBeVisible();
    await expect(page.locator('a:has-text("Ir a la tienda")')).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  });

  test('displays 404 not found error state for unknown token', async ({ page }) => {
    await page.goto('/pedido?token=tok_unknown_order');
    await expect(page.locator('h1')).toHaveText('Pedido no encontrado');
    await expect(
      page.locator('text=No encontramos ningún pedido asociado a este enlace.')
    ).toBeVisible();
    await expect(page.locator('a:has-text("Ir a la tienda")')).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  });

  test('renders pending_payment order matching canvas M-Pedido / M-Pedido-390 with countdown and steps', async ({
    page,
  }) => {
    await page.goto('/pedido?token=tok_pending_valid');

    // Hero title & Order number
    await expect(page.locator('text=ORD-7K2M9Q4X')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('Estamos confirmando tu pago.');
    await expect(page.locator('text=Tu pedido sigue apartado')).toBeVisible();

    // 4-step progress timeline
    await expect(page.locator('text=Confirmando pago')).toBeVisible();
    await expect(page.locator('text=Preparando')).toBeVisible();
    await expect(page.locator('text=Enviado')).toBeVisible();
    await expect(page.locator('text=Entregado')).toBeVisible();

    // Delivery address & recipient
    await expect(page.getByRole('heading', { name: 'Entrega' })).toBeVisible();
    await expect(page.locator('text=Carrera 7 # 71-21, Torre B, Apto 502')).toBeVisible();
    await expect(page.locator('text=Recibe Carlos Mendoza · 3001234567')).toBeVisible();
    await expect(page.locator('text=Tocar timbre')).toBeVisible();

    // Order summary lines, subtotal, shipping, and authoritative total
    await expect(page.locator('text=Resumen')).toBeVisible();
    await expect(page.locator('text=Finca El Mirador')).toBeVisible();
    await expect(page.locator('text=500 g / Grano entero')).toBeVisible();
    await expect(page.locator('span:text-is("$76.000")').first()).toBeVisible();
    await expect(page.locator('span:text-is("$9.500")')).toBeVisible();
    await expect(page.locator('span:text-is("$85.500")')).toBeVisible();

    // Origin card
    await expect(page.locator('text=Mientras llega, conoce de dónde viene tu café.')).toBeVisible();
    await expect(page.locator('a:has-text("Conocer el origen")')).toBeVisible();

    // Canvas notices grid
    await expect(page.locator('text=No pagues dos veces')).toBeVisible();
    await expect(page.getByText('Te avisamos por correo', { exact: true })).toBeVisible();

    // Accessibility check
    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  });

  test('renders shipped order with tracking guide and carrier details', async ({ page }) => {
    await page.goto('/pedido?token=tok_shipped_valid');

    await expect(page.locator('text=ORD-8Y4B1W9Z')).toBeVisible();
    await expect(page.locator('h1')).toHaveText('¡Gracias! Tu café ya es tuyo.');
    await expect(page.locator('text=Coordinadora: GUIA-88776655')).toBeVisible();
    await expect(
      page.locator('a[href="https://coordinadora.com/rastreo?guia=GUIA-88776655"]')
    ).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .analyze();
    expect(axe.violations).toEqual([]);
  });
});
