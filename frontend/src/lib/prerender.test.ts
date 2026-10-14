import { describe, it, expect } from 'vitest';

describe('Pre-rendered HTML output invariants', () => {
  const getFsAndPath = async () => {
    const fs = await import('fs');
    const path = await import('path');
    return { fs, path };
  };

  it('generates all expected static pages in dist', async () => {
    const { fs, path } = await getFsAndPath();
    const distDir = path.resolve('dist');

    expect(fs.existsSync(path.join(distDir, 'tienda/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'productos/finca-el-mirador-lavado/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'productos/chocolate-artesanal-70/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'productos/taza-ceramica-monteluna/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'origenes/finca-el-mirador/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(distDir, 'origenes/finca-la-maria/index.html'))).toBe(true);
  });

  it('contains NO <astro-island> tags across any generated HTML page', async () => {
    const { fs, path } = await getFsAndPath();
    const distDir = path.resolve('dist');
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
      const filePath = path.join(distDir, file);
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        expect(content).not.toContain('<astro-island');
      }
    }
  });

  it('product detail page does NOT contain hardcoded prices or add-to-cart buttons', async () => {
    const { fs, path } = await getFsAndPath();
    const distDir = path.resolve('dist');
    const productHtml = fs.readFileSync(
      path.join(distDir, 'productos/finca-el-mirador-lavado/index.html'),
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

  it('originless product page does not display an origin link', async () => {
    const { fs, path } = await getFsAndPath();
    const distDir = path.resolve('dist');
    const tazaHtml = fs.readFileSync(
      path.join(distDir, 'productos/taza-ceramica-monteluna/index.html'),
      'utf-8'
    );

    expect(tazaHtml).not.toContain('/origenes/');
    expect(tazaHtml).not.toContain('Conocer el origen');
  });

  it('origin page renders origin facts and related products', async () => {
    const { fs, path } = await getFsAndPath();
    const distDir = path.resolve('dist');
    const originHtml = fs.readFileSync(
      path.join(distDir, 'origenes/finca-el-mirador/index.html'),
      'utf-8'
    );

    expect(originHtml).toContain('Finca El Mirador');
    expect(originHtml).toContain('Familia Patiño');
    expect(originHtml).toContain('1650');
    expect(originHtml).toContain('/productos/finca-el-mirador-lavado');
  });
});
