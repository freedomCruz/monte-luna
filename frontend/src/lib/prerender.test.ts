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

  it('contains NO <astro-island> tags across any generated HTML page', () => {
    const htmlFiles = [
      'tienda/index.html',
      'productos/finca-el-mirador/index.html',
      'productos/finca-la-maria/index.html',
      'productos/chocolate-70/index.html',
      'productos/chocolate-85/index.html',
      'origenes/finca-el-mirador/index.html',
      'origenes/demo-cacao-origin/index.html',
      'index.html',
    ];

    for (const file of htmlFiles) {
      const filePath = path.join(fixtureDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('<astro-island');
      }
    }
  });

  it('tienda.astro renders grouped category sections with collision-free article IDs for multi-category products', () => {
    const tiendaHtml = fs.readFileSync(path.join(fixtureDir, 'tienda/index.html'), 'utf-8');

    // Category navigation links target exact group sections
    expect(tiendaHtml).toContain('href="#cat-group-coffee"');
    expect(tiendaHtml).toContain('href="#cat-group-cacao"');
    expect(tiendaHtml).toContain('href="#cat-group-chocolate"');

    // Distinct section IDs exist for each group
    expect(tiendaHtml).toContain('id="cat-group-coffee"');
    expect(tiendaHtml).toContain('id="cat-group-cacao"');
    expect(tiendaHtml).toContain('id="cat-group-chocolate"');

    // Multi-category products (like chocolate-70 and chocolate-85) appear under both cacao and chocolate groups
    // with distinct, collision-free DOM IDs scoped by category group
    expect(tiendaHtml).toContain('id="product-cacao-chocolate-70"');
    expect(tiendaHtml).toContain('id="product-chocolate-chocolate-70"');

    // All product article IDs must be strictly unique across the entire DOM tree
    const productIds = Array.from(tiendaHtml.matchAll(/id="(product-[^"]+)"/g)).map((m) => m[1]);
    expect(productIds.length).toBeGreaterThan(0);
    const uniqueIds = new Set(productIds);
    expect(productIds.length).toBe(uniqueIds.size);
  });

  it('product detail page does NOT contain hardcoded prices, add-to-cart buttons, or static availability claims', () => {
    const productHtml = fs.readFileSync(
      path.join(fixtureDir, 'productos/finca-el-mirador/index.html'),
      'utf-8'
    );

    // Checks that placeholder slot exists
    expect(productHtml).toContain('data-product-slug="finca-el-mirador"');
    expect(productHtml).toContain('id="purchase-action-island-slot"');

    // Invariant: No hardcoded prices or add-to-cart button
    expect(productHtml).not.toMatch(/\$3[89]\.000/);
    expect(productHtml).not.toContain('Añadir al carrito');
    expect(productHtml).not.toContain('Agregar al carrito');

    // Invariant: Pre-rendered markup must never claim "Disponible" or "Agotado" before live data arrives
    expect(productHtml).not.toContain('<span>Disponible</span>');
    expect(productHtml).not.toContain('<span>Agotado</span>');
    expect(productHtml).toContain('data-variant-stock-slot');
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
