// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('Pre-rendered HTML output invariants', () => {
  const fixtureDir = path.resolve('node_modules/.cache/test-prerender-dist');

  beforeAll(async () => {
    // Perform an isolated build to a private cache fixture so tests never depend on stale pre-existing dist
    const { build } = await import('astro');
    await build({
      root: path.resolve('.'),
      outDir: fixtureDir,
      logLevel: 'silent',
    });
  }, 30000);

  afterAll(async () => {
    // Clean up isolated test fixture
    if (fs.existsSync(fixtureDir)) {
      fs.rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it('generates all expected static pages in the build output matching demo fixtures', () => {
    expect(fs.existsSync(path.join(fixtureDir, 'tienda/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/finca-el-mirador/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/finca-la-maria/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/chocolate-70/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/chocolate-85/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'origenes/finca-el-mirador/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'origenes/demo-cacao-origin/index.html'))).toBe(true);
  });

  it('tienda.astro renders the listing island with client:visible and live price slots', () => {
    const tiendaHtml = fs.readFileSync(path.join(fixtureDir, 'tienda/index.html'), 'utf-8');

    // Headless island is mounted with client:visible
    expect(tiendaHtml).toContain('client="visible"');
    expect(tiendaHtml).toContain('<astro-island');

    // Price slots are present on every product card in placeholder state (no prices pre-rendered)
    expect(tiendaHtml).toContain('data-live-price-slot="finca-el-mirador"');
    expect(tiendaHtml).toContain('Consultando precio...');
    expect(tiendaHtml).not.toMatch(/\$3[89]\.000/);
  });

  it('product detail page mounts ProductPurchaseIsland with client:load and no pre-rendered live prices', () => {
    const productHtml = fs.readFileSync(
      path.join(fixtureDir, 'productos/finca-el-mirador/index.html'),
      'utf-8'
    );

    // Island container with client:load
    expect(productHtml).toContain('id="product-purchase-island-container"');
    expect(productHtml).toContain('client="load"');
    expect(productHtml).toContain('<astro-island');

    // Invariant: Initial server render has loading placeholder and NO authoritative live values
    expect(productHtml).toContain('Cargando disponibilidad y precio...');
    expect(productHtml).not.toMatch(/\$3[89]\.000/);
    expect(productHtml).not.toContain('Añadir al carrito');
    expect(productHtml).not.toContain('Agregar al carrito');
    expect(productHtml).not.toContain('Comprar');
    expect(productHtml).not.toMatch(/Tostado el \d+/);
  });


  it('originless product page does not display an origin link', () => {
    const chocolate85Html = fs.readFileSync(
      path.join(fixtureDir, 'productos/chocolate-85/index.html'),
      'utf-8'
    );

    expect(chocolate85Html).not.toContain('/origenes/');
    expect(chocolate85Html).not.toContain('Conocer el origen');
  });

  it('origin page renders origin facts and related products', () => {
    const originHtml = fs.readFileSync(
      path.join(fixtureDir, 'origenes/finca-el-mirador/index.html'),
      'utf-8'
    );

    expect(originHtml).toContain('Finca El Mirador');
    expect(originHtml).toContain('Demo coffee producer');
    expect(originHtml).toContain('1700');
    expect(originHtml).toContain('/productos/finca-el-mirador');
  });
});
