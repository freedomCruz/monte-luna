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

  it('generates all expected static pages in the build output', () => {
    expect(fs.existsSync(path.join(fixtureDir, 'tienda/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/finca-el-mirador-lavado/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/chocolate-artesanal-70/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'productos/taza-ceramica-monteluna/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'origenes/finca-el-mirador/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(fixtureDir, 'origenes/finca-la-maria/index.html'))).toBe(true);
  });

  it('contains NO <astro-island> tags across any generated HTML page', () => {
    const htmlFiles = [
      'tienda/index.html',
      'productos/finca-el-mirador-lavado/index.html',
      'productos/chocolate-artesanal-70/index.html',
      'productos/taza-ceramica-monteluna/index.html',
      'origenes/finca-el-mirador/index.html',
      'origenes/finca-la-maria/index.html',
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

  it('tienda.astro renders grouped category sections with unique IDs and valid navigation links', () => {
    const tiendaHtml = fs.readFileSync(path.join(fixtureDir, 'tienda/index.html'), 'utf-8');

    // Category navigation links target exact group sections
    expect(tiendaHtml).toContain('href="#cat-group-cafe"');
    expect(tiendaHtml).toContain('href="#cat-group-cacao"');
    expect(tiendaHtml).toContain('href="#cat-group-accesorios"');

    // Distinct section IDs exist for each group
    expect(tiendaHtml).toContain('id="cat-group-cafe"');
    expect(tiendaHtml).toContain('id="cat-group-cacao"');
    expect(tiendaHtml).toContain('id="cat-group-accesorios"');

    // Unique product IDs exist on articles
    expect(tiendaHtml).toContain('id="product-finca-el-mirador-lavado"');
    expect(tiendaHtml).toContain('id="product-chocolate-artesanal-70"');
    expect(tiendaHtml).toContain('id="product-taza-ceramica-monteluna"');

    // No duplicate article IDs: match all id="product-..."
    const productIds = Array.from(tiendaHtml.matchAll(/id="(product-[^"]+)"/g)).map((m) => m[1]);
    const uniqueIds = new Set(productIds);
    expect(productIds.length).toBe(uniqueIds.size);
  });

  it('product detail page does NOT contain hardcoded prices or add-to-cart buttons', () => {
    const productHtml = fs.readFileSync(
      path.join(fixtureDir, 'productos/finca-el-mirador-lavado/index.html'),
      'utf-8'
    );

    // Checks that placeholder slot exists
    expect(productHtml).toContain('data-product-slug="finca-el-mirador-lavado"');
    expect(productHtml).toContain('id="purchase-action-island-slot"');

    // No hardcoded prices or add-to-cart button
    expect(productHtml).not.toMatch(/\$3[89]\.000/);
    expect(productHtml).not.toContain('Añadir al carrito');
    expect(productHtml).not.toContain('Agregar al carrito');
  });

  it('originless product page does not display an origin link', () => {
    const tazaHtml = fs.readFileSync(
      path.join(fixtureDir, 'productos/taza-ceramica-monteluna/index.html'),
      'utf-8'
    );

    expect(tazaHtml).not.toContain('/origenes/');
    expect(tazaHtml).not.toContain('Conocer el origen');
  });

  it('origin page renders origin facts and related products', () => {
    const originHtml = fs.readFileSync(
      path.join(fixtureDir, 'origenes/finca-el-mirador/index.html'),
      'utf-8'
    );

    expect(originHtml).toContain('Finca El Mirador');
    expect(originHtml).toContain('Familia Patiño');
    expect(originHtml).toContain('1650');
    expect(originHtml).toContain('/productos/finca-el-mirador-lavado');
  });
});
