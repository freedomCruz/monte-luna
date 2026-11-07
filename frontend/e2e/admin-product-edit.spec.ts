import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockAdminProductsRoutes } from './helpers/mock-admin-products';
import { mockProductDetail, mockProductTypes } from '../src/mocks/admin-products';

const staff: AdminUser = {
  id: '01900000-0000-7000-8000-000000000002',
  email: 'andres@monteluna.co',
  display_name: 'Andrés Peña',
  role: 'staff',
  status: 'active',
  totp_confirmed_at: '2026-10-09T12:00:00Z',
  last_login_at: '2026-10-20T13:14:00Z',
  password_changed_at: '2026-10-01T12:00:00Z',
  version: 1,
  created_at: '2026-01-01T12:00:00Z',
  updated_at: '2026-10-20T13:14:00Z',
};

const PRODUCT_URL = `/admin/producto/?id=${mockProductDetail.id}`;
// The e2e project has no Node typings; Playwright runs in Node, so Buffer exists at runtime.
const NodeBuffer = (globalThis as unknown as { Buffer: { from(data: string, encoding: string): never; alloc(size: number): never } }).Buffer;
const PNG = NodeBuffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function open(page: Page, width: number, url = PRODUCT_URL) {
  await page.setViewportSize({ width, height: 1300 });
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${staff.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(staff),
  }));
  await mockAdminOrdersRoutes(page);
  const mock = await mockAdminProductsRoutes(page);
  await page.goto(url);
  return mock;
}

const title = (page: Page) => page.getByRole('heading', { level: 1, name: mockProductDetail.title });
const save = (page: Page) => page.getByRole('button', { name: 'Guardar cambios' });

test.describe('Admin Producto (F3: S3, S5, S7)', () => {
  test.beforeEach(({ browserName }, testInfo) => {
    test.skip(browserName !== 'chromium' || testInfo.project.name !== 'chromium-desktop', 'Chromium layout contract');
  });

  test('never prerenders catalog data', async ({ request }) => {
    const html = await (await request.get('/admin/producto/')).text();
    expect(html).not.toContain(mockProductDetail.title);
  });

  for (const width of [1440, 1024, 768]) {
    test(`renders every tab at ${width}px`, async ({ page }, testInfo) => {
      await open(page, width);
      await expect(title(page)).toBeVisible();
      for (const [name, key] of [['General', 'general'], ['Atributos', 'atributos'], ['Imágenes', 'imagenes'], ['Variantes', 'variantes']] as const) {
        await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
        await expect(page.getByRole('tabpanel', { name })).toBeVisible();
        await page.screenshot({ path: testInfo.outputPath(`producto-${key}-${width}.png`) });
      }
      const columns = await page.getByRole('columnheader').filter({ visible: true }).allInnerTexts();
      expect(columns.map((text) => text.trim().toLowerCase())).toEqual(
        width >= 1440
          ? ['variante', 'sku', 'código de barras', 'peso (g)', 'precio', 'precio de referencia', 'impuesto', 'estado', 'stock']
          : ['variante', 'sku', 'precio', 'precio de referencia', 'stock', 'más']
      );
    });
  }

  test('edits and saves the product with the product ETag, then shows the saved notice', async ({ page }) => {
    const mock = await open(page, 1440);
    await page.getByLabel('Nombre').fill('Finca El Mirador – Geisha Natural');
    await expect(page.getByText('Cambios sin guardar en el producto')).toBeVisible();
    await save(page).click();
    await expect(page.getByRole('status')).toContainText('Producto guardado');
    expect(mock.writes).toEqual([{ method: 'PATCH', path: `/${mockProductDetail.id}`, ifMatch: '"3"', body: { title: 'Finca El Mirador – Geisha Natural' } }]);
  });

  test('shows the conflict pattern on a stale version and keeps the unsaved edits', async ({ page }) => {
    const mock = await open(page, 1440);
    await expect(title(page)).toBeVisible();
    mock.makeStale();
    await page.getByLabel('Nombre').fill('Otro nombre');
    await save(page).click();
    const alert = page.getByRole('alert');
    await expect(alert).toContainText('Alguien más cambió este producto. Recarga para ver la versión actual.');
    await expect(page.getByLabel('Nombre')).toHaveValue('Otro nombre');
    await alert.getByRole('button', { name: 'Recargar' }).click();
    await expect(page.getByLabel('Nombre')).toHaveValue(mockProductDetail.title);
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('shows a slug conflict on the slug field (409)', async ({ page }) => {
    await open(page, 1440);
    await page.getByLabel('Slug').fill('duplicado');
    await save(page).click();
    await expect(page.getByText('Ya existe un producto con este enlace.')).toBeVisible();
  });

  test('edits a variant price in minor units and validates the reference price', async ({ page }) => {
    const mock = await open(page, 1440);
    await page.getByRole('tab', { name: /^Variantes/ }).click();
    await page.getByLabel('Precio de referencia de 250 g Grano entero').fill('38.000');
    await save(page).click();
    await expect(page.getByText('Debe ser mayor que el precio.')).toBeVisible();
    expect(mock.writes).toHaveLength(0);

    await page.getByLabel('Precio de referencia de 250 g Grano entero').fill('45.000');
    await expect(page.getByText('Ahorras $7.000')).toBeVisible();
    await page.getByLabel('Precio de 250 g Grano entero').fill('39.000');
    await save(page).click();
    await expect(page.getByRole('status')).toContainText('Producto guardado');
    expect(mock.writes).toHaveLength(1);
    expect(mock.writes[0]).toMatchObject({ method: 'PATCH', ifMatch: '"3"', body: { price_amount: 3_900_000, compare_at_price_amount: 4_500_000 } });
  });

  test('creates a variant from the product type options', async ({ page }) => {
    const mock = await open(page, 1440);
    await page.getByRole('tab', { name: /^Variantes/ }).click();
    await page.getByRole('button', { name: 'Nueva variante' }).click();
    const sheet = page.getByRole('dialog', { name: 'Nueva variante' });
    await sheet.getByLabel('Presentación').selectOption('250g');
    await sheet.getByLabel('Molienda').selectOption('fine');
    await sheet.getByLabel('SKU').fill('ML-MIR-250-FI');
    await sheet.getByLabel('Precio', { exact: true }).fill('38.000');
    await sheet.getByLabel('Peso en gramos').fill('250');
    await sheet.getByLabel('Categoría de impuesto').selectOption('standard');
    await sheet.getByRole('button', { name: 'Crear variante' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByLabel('SKU de 250 g Fina')).toHaveValue('ML-MIR-250-FI');
    expect(mock.writes[0]).toMatchObject({ method: 'POST', path: `/${mockProductDetail.id}/variants`, ifMatch: '"3"', body: { sku: 'ML-MIR-250-FI', price_amount: 3_800_000 } });
  });

  test('uploads an image, rejects a wrong type and a too-large file, and explains a 503', async ({ page }) => {
    const mock = await open(page, 1440);
    await page.getByRole('tab', { name: /^Imágenes/ }).click();
    const chooser = page.getByLabel('Elegir archivos', { exact: true }).and(page.locator('input'));

    await chooser.setInputFiles({ name: 'a.gif', mimeType: 'image/gif', buffer: PNG });
    await expect(page.getByText('Usa una imagen JPG, PNG o WebP.')).toBeVisible();
    await chooser.setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: NodeBuffer.alloc(5 * 1024 * 1024 + 1) });
    await expect(page.getByText('La imagen pesa más de 5 MiB.')).toBeVisible();
    expect(mock.writes).toHaveLength(0);
    await page.getByRole('button', { name: 'Quitar' }).first().click();
    await page.getByRole('button', { name: 'Quitar' }).first().click();

    await chooser.setInputFiles({ name: 'storage-down.png', mimeType: 'image/png', buffer: PNG });
    await page.getByPlaceholder('Describe lo que se ve').first().fill('Taza de café');
    await page.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(page.getByText('el almacenamiento de imágenes no está disponible ahora')).toBeVisible();
    await page.getByRole('button', { name: 'Quitar' }).click();

    await chooser.setInputFiles({ name: 'taza.png', mimeType: 'image/png', buffer: PNG });
    await page.getByPlaceholder('Describe lo que se ve').first().fill('Taza de café');
    await page.getByRole('button', { name: 'Subir imagen' }).click();
    await expect(page.getByRole('button', { name: 'Subir imagen' })).toHaveCount(0);
    await expect(page.getByRole('tab', { name: /^Imágenes/ })).toContainText('2');
    const uploads = mock.writes.filter((write) => write.path.endsWith('/images'));
    expect(uploads.map((upload) => upload.ifMatch)).toEqual(['"3"', '"3"']);
  });

  test('creates a new product and opens it', async ({ page }) => {
    const mock = await open(page, 1440, '/admin/producto/');
    await expect(page.getByRole('heading', { level: 1, name: 'Nuevo producto' })).toBeVisible();
    await page.getByLabel('Tipo de producto').selectOption(mockProductTypes.items[0].id);
    await page.getByLabel('Nombre').fill('Finca Nueva – Pink Bourbon');
    await expect(page.getByLabel('Slug')).toHaveValue('finca-nueva-pink-bourbon');
    await page.getByRole('tab', { name: 'Atributos' }).click();
    await page.getByLabel('Especie').selectOption('arabica');
    await page.getByRole('button', { name: 'Crear producto' }).click();
    await expect(page).toHaveURL(/\/admin\/producto\/\?id=/);
    expect(mock.writes[0]).toMatchObject({ method: 'POST', ifMatch: undefined, body: { slug: 'finca-nueva-pink-bourbon', status: 'draft' } });
  });

  test('has no WCAG A/AA violations on every tab and with the variant Sheet open', async ({ page }) => {
    await open(page, 1440);
    await expect(title(page)).toBeVisible();
    for (const name of ['General', 'Atributos', 'Imágenes', 'Variantes']) {
      await page.getByRole('tab', { name: new RegExp(`^${name}`) }).click();
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe ${name}`).toEqual([]);
    }
    await page.setViewportSize({ width: 768, height: 1300 });
    await page.getByRole('button', { name: /^Más datos de 250 g Grano entero/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    const sheet = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(sheet.violations, 'axe variant sheet').toEqual([]);
  });
});
