import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import type { AdminUser } from '../src/lib/admin/client';
import { mockAdminOrdersRoutes } from './helpers/mock-admin-orders';
import { mockAdminInventoryRoutes } from './helpers/mock-admin-inventory';

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

async function prepare(page: Page, overrides: Parameters<typeof mockAdminInventoryRoutes>[1] = {}) {
  await page.route('**/api/v1/admin/sessions/current', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    headers: { ETag: `"${staff.version}"`, 'Cache-Control': 'no-store' },
    body: JSON.stringify(staff),
  }));
  await mockAdminOrdersRoutes(page);
  return mockAdminInventoryRoutes(page, overrides);
}

const LOT_COLUMNS: Record<number, string[]> = {
  1440: ['Lote', 'Tueste', 'Vence', 'Disponible', 'Reservado', 'Estado'],
  1024: ['Lote', 'Tueste', 'Disponible', 'Reservado', 'Estado'],
  768: ['Lote', 'Tueste', 'Disponible', 'Estado'],
};
const MOVEMENT_COLUMNS: Record<number, string[]> = {
  1440: ['Fecha', 'Movimiento', 'Lote', 'Cantidad', 'Detalle', 'Quién'],
  1024: ['Fecha', 'Movimiento', 'Lote', 'Cantidad', 'Quién'],
  768: ['Fecha', 'Movimiento', 'Lote', 'Cantidad', 'Quién'],
};

const chromiumOnly = (browserName: string, projectName: string) => browserName !== 'chromium' || projectName !== 'chromium-desktop';

async function loaded(page: Page) {
  await expect(page.getByRole('heading', { level: 1, name: 'Inventario y lotes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Registrar entrada de lote' })).toBeVisible();
  await expect(page.getByText('MIR-0915', { exact: true }).first()).toBeVisible();
}

test.describe('Admin Inventario (F4: S4, S7)', () => {
  test('never prerenders catalog data', async ({ request }) => {
    const html = await (await request.get('/admin/inventario/')).text();
    expect(html).not.toContain('Finca El Mirador');
    expect(html).not.toContain('MIR-0915');
  });

  for (const width of [1440, 1024, 768]) {
    test(`renders Inventario at ${width}px with the canvas columns`, async ({ page, browserName }, testInfo) => {
      test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
      await page.setViewportSize({ width, height: 1500 });
      await prepare(page);
      await page.goto('/admin/inventario/');
      await loaded(page);

      const lots = page.getByRole('region', { name: 'Lotes' });
      const ledger = page.getByRole('region', { name: 'Historial de movimientos' });
      expect((await lots.getByRole('columnheader').filter({ visible: true }).allInnerTexts()).map((text) => text.trim().toLowerCase())).toEqual(LOT_COLUMNS[width].map((name) => name.toLowerCase()));
      expect((await ledger.getByRole('columnheader').filter({ visible: true }).allInnerTexts()).map((text) => text.trim().toLowerCase())).toEqual(MOVEMENT_COLUMNS[width].map((name) => name.toLowerCase()));

      if (width >= 1024) {
        await expect(page.getByRole('region', { name: 'Variantes' })).toBeVisible();
        await expect(page.getByRole('combobox', { name: 'Variante' })).toHaveCount(0);
      } else {
        await expect(page.getByRole('combobox', { name: 'Variante' })).toBeVisible();
        await expect(page.getByRole('region', { name: 'Variantes' })).toHaveCount(0);
      }
      await expect(page.getByRole('navigation', { name: 'Secciones del panel' }).getByRole('link', { name: 'Inventario, 4 pendientes' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByRole('button', { name: /ajust/i })).toHaveCount(0);
      await page.screenshot({ path: testInfo.outputPath(`inventario-${width}.png`), fullPage: true });
      await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
      await expect(page.getByRole('dialog', { name: 'Registrar entrada de lote' })).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`inventario-${width}-entrada.png`) });
    });
  }

  test('shows both server flags, including zero units and exactly 30 days as sent', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1500 });
    await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);

    const variants = page.getByRole('region', { name: 'Variantes' });
    await expect(variants.getByRole('button', { name: /250 g · Fina.*Poco stock/ })).toBeVisible();
    await expect(variants.getByRole('button', { name: /500 g · Fina.*Agotado/ })).toBeVisible();
    await expect(variants.getByRole('button', { name: /Chocolate oscuro 75 %.*Poco stock/ })).toBeVisible();

    const lots = page.getByRole('region', { name: 'Lotes' });
    await expect(lots.getByRole('row', { name: /MIR-0820.*Lote agotado/ })).toBeVisible();
    await expect(lots.getByRole('row', { name: /MIR-0915.*Sale primero.*Tueste antiguo/ })).toBeVisible();
    await expect(lots.getByRole('row', { name: /MIR-0930.*Lote activo/ })).toBeVisible();
  });

  test('reads the SKU from the Producto link and mirrors the search', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 900 });
    const mock = await prepare(page);
    await page.goto('/admin/inventario/?search=ML-MIR-250-FI');
    await expect(page.getByRole('searchbox', { name: 'Buscar variante' })).toHaveValue('ML-MIR-250-FI');
    await expect(page.getByRole('heading', { level: 2, name: 'Finca El Mirador · 250 g · Fina' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Variantes' }).getByRole('list').getByRole('button')).toHaveCount(1);
    expect(mock.listRequests.some((url) => url.searchParams.get('search') === 'ML-MIR-250-FI')).toBe(true);
    await expect(page).toHaveURL(/search=ML-MIR-250-FI/);
  });

  test('filters through the API and mirrors the address', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 900 });
    const mock = await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);

    const filters = page.getByRole('group', { name: 'Filtros' });
    await filters.getByRole('button', { name: 'Stock' }).click();
    await expect(page).toHaveURL(/stock=low_or_empty/);
    await expect.poll(() => mock.listRequests.at(-1)?.searchParams.get('stock')).toBe('low_or_empty');

    await filters.getByRole('button', { name: 'Estado' }).click();
    await page.getByRole('radio', { name: 'Archivadas' }).click();
    await expect.poll(() => mock.listRequests.at(-1)?.searchParams.get('status')).toBe('archived');
    await expect(page).toHaveURL(/status=archived/);
  });

  test('shows the ledger with display kinds and a missing actor', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1500 });
    await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);
    const ledger = page.getByRole('region', { name: 'Historial de movimientos' });
    await expect(ledger.getByRole('row', { name: /Reserva.*MIR-0915.*−2.*Pedido ORD-7K2M9Q4X esperando pago.*Sistema/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Asignación.*Persona no disponible/ })).toBeVisible();
    await expect(ledger.getByRole('row', { name: /Entrada.*\+10.*Andrés Peña/ })).toBeVisible();
  });

  test('registers a lot receipt with the product ETag and shows the result', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1100 });
    const mock = await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);

    await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
    const sheet = page.getByRole('dialog', { name: 'Registrar entrada de lote' });
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(sheet.getByText('Escribe el código del lote.')).toBeVisible();
    await expect(sheet.getByText('Elige la fecha de tueste.')).toBeVisible();
    expect(mock.receipts).toHaveLength(0);

    await sheet.getByLabel('Código del lote').fill('MIR-1020');
    await sheet.getByLabel('Fecha de tueste').fill('2026-10-20');
    await sheet.getByLabel('Cantidad que entra').fill('24');
    await expect(sheet.getByText('Disponible pasará de 18 a 42.')).toBeVisible();
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();

    await expect(page.getByText('Entrada registrada en el lote MIR-1020: +24 unidades.')).toBeVisible();
    expect(mock.receipts).toHaveLength(1);
    expect(mock.receipts[0].ifMatch).toBe('"3"');
    expect(mock.receipts[0].body).toEqual({ lot_code: 'MIR-1020', production_date: '2026-10-20', quantity: 24 });
    await expect(page.getByRole('region', { name: 'Lotes' }).getByRole('row', { name: /MIR-1020/ })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Historial de movimientos' }).getByRole('row', { name: /Entrada.*MIR-1020.*\+24/ })).toBeVisible();
    await expect(page.getByText('unidades para vender').locator('xpath=preceding-sibling::span[1]')).toHaveText('42');

    // The returned ETag is the next If-Match.
    await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
    const again = page.getByRole('dialog', { name: 'Registrar entrada de lote' });
    await again.getByLabel('Código del lote').fill('MIR-1021');
    await again.getByLabel('Fecha de tueste').fill('2026-10-20');
    await again.getByLabel('Cantidad que entra').fill('1');
    await again.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(page.getByText('Entrada registrada en el lote MIR-1021: +1 unidad.')).toBeVisible();
    expect(mock.receipts[1].ifMatch).toBe('"4"');
  });

  test('shows server validation and lot conflicts', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1100 });
    await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);
    await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
    const sheet = page.getByRole('dialog', { name: 'Registrar entrada de lote' });
    await sheet.getByLabel('Código del lote').fill('MIR-1020');
    await sheet.getByLabel('Fecha de tueste').fill('2026-10-20');
    await sheet.getByLabel('Cantidad que entra').fill('999999999');
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(sheet.getByText('La cantidad no es válida.')).toBeVisible();

    await sheet.getByLabel('Cantidad que entra').fill('3');
    await sheet.getByLabel('Código del lote').fill('CONFLICTO');
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(sheet.getByText(/Ese código ya existe con otras fechas/)).toBeVisible();
  });

  test('shows the version conflict (412) with Recargar and recovers', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1440, height: 1100 });
    const mock = await prepare(page);
    await page.goto('/admin/inventario/');
    await loaded(page);
    await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
    const sheet = page.getByRole('dialog', { name: 'Registrar entrada de lote' });
    await sheet.getByLabel('Código del lote').fill('MIR-1020');
    await sheet.getByLabel('Fecha de tueste').fill('2026-10-20');
    await sheet.getByLabel('Cantidad que entra').fill('24');

    mock.makeStale();
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(sheet.getByText('Alguien más cambió este producto. Recarga para ver la versión actual.')).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('inventario-1440-conflicto.png') });

    await sheet.getByRole('button', { name: 'Recargar' }).click();
    await expect(sheet.getByText('Alguien más cambió este producto.')).toHaveCount(0);
    await expect(sheet.getByLabel('Código del lote')).toHaveValue('MIR-1020');
    await sheet.getByRole('button', { name: 'Registrar entrada' }).click();
    await expect(page.getByText('Entrada registrada en el lote MIR-1020: +24 unidades.')).toBeVisible();
    expect(mock.receipts.map((receipt) => receipt.ifMatch)).toEqual(['"3"', '"4"']);
  });

  test('shows the error state with a retry', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await page.setViewportSize({ width: 1024, height: 900 });
    await prepare(page, { failList: true });
    await page.goto('/admin/inventario/');
    await expect(page.getByText('No pudimos cargar las variantes.')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible();
  });

  test('has no WCAG A/AA violations at 1440, 1024 and 768, also with the receipt Sheet open', async ({ page, browserName }, testInfo) => {
    test.skip(chromiumOnly(browserName, testInfo.project.name), 'Chromium layout contract');
    await prepare(page);
    for (const width of [1440, 1024, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/admin/inventario/');
      await loaded(page);
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(results.violations, `axe at ${width}px`).toEqual([]);

      await page.getByRole('button', { name: 'Registrar entrada de lote' }).click();
      await expect(page.getByRole('dialog', { name: 'Registrar entrada de lote' })).toBeVisible();
      const withSheet = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
      expect(withSheet.violations, `axe with the Sheet at ${width}px`).toEqual([]);
    }
  });
});
