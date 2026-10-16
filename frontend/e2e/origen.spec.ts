import { test, expect } from '@playwright/test';
import { mockAvailabilitiesRoute } from './helpers/mock-route';

test.describe('Origin Detail (/origenes/[slug])', () => {
  test.beforeEach(async ({ page }) => {
    await mockAvailabilitiesRoute(page);
  });

  test('finca-el-mirador: displays all canonical canvas sections, floating product, ticker, process and figures', async ({ page }) => {
    await page.goto('/origenes/finca-el-mirador');

    // 1. Page Title & Heading
    await expect(page).toHaveTitle(/Finca El Mirador · Origen Monteluna/);
    const heading = page.getByRole('heading', { level: 1, name: 'Finca El Mirador' });
    await expect(heading).toBeVisible();

    // 2. Eyebrow pre-title (Dynamic "Origen de café · Huila, Colombia")
    await expect(page.locator('text=Origen de café · Huila, Colombia')).toBeVisible();

    // 3. Floating product animation overlay (.flota) in hero
    const floatingProduct = page.locator('.flota img');
    await expect(floatingProduct).toBeVisible();

    // 4. Hero Altitude Badge
    const altitudeBadge = page.getByText('1700–1900', { exact: true });
    await expect(altitudeBadge).toBeVisible();

    // 5. Origin Facts Cards
    await expect(page.locator('dd', { hasText: 'Productor de café demo' })).toBeVisible();
    await expect(page.locator('dd', { hasText: /San Agustín/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /Huila/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /1700 – 1900 m s\. n\. m\./i })).toBeVisible();

    // 6. Story Section ("Quién lo cultiva y dónde.")
    const storyHeading = page.getByRole('heading', { level: 2, name: 'Quién lo cultiva y dónde.' });
    await expect(storyHeading).toBeVisible();

    // 7. Sliding Marquee Ticker (.cinta) with dynamic and static data
    const ticker = page.locator('.cinta');
    await expect(ticker).toBeVisible();
    await expect(ticker).toContainText('Finca El Mirador');
    await expect(ticker).toContainText('Origen Colombia');
    await expect(ticker).toContainText('Huila');

    // 8. Process Section ("Del árbol a tu bolsa") with 4 steps
    const processHeading = page.getByRole('heading', { level: 2, name: 'Del árbol a tu bolsa' });
    await expect(processHeading).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Cosecha' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Beneficio' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Tostión' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'A tu medida' })).toBeVisible();

    // 9. "El origen en cifras" Large Band
    const cifrasSection = page.locator('section[aria-label="El origen en cifras"]');
    await expect(cifrasSection).toBeVisible();
    await expect(cifrasSection.locator('text=1700 m')).toBeVisible();
    await expect(cifrasSection.locator('text=1900 m')).toBeVisible();

    // 10. Origin Photos Gallery
    const gallerySection = page.locator('section[aria-label="Fotos del origen"]');
    await expect(gallerySection).toBeVisible();
    const galleryImages = gallerySection.locator('img');
    await expect(galleryImages).toHaveCount(3);

    // 11. Associated Products Section ("Llévate la montaña a casa.")
    const productsHeading = page.getByRole('heading', { level: 2, name: 'Llévate la montaña a casa.' });
    await expect(productsHeading).toBeVisible();
    const productCard = page.locator('article', { has: page.getByRole('heading', { name: 'Finca El Mirador' }) }).first();
    await expect(productCard).toBeVisible();
    const detailLink = productCard.locator('a[href="/productos/finca-el-mirador"]').first();
    await expect(detailLink).toBeVisible();

    // Invariant: NO add-to-cart or buy buttons in main content
    const addToCartButtons = page.locator('main').getByRole('button', { name: /comprar|carrito|agregar/i });
    await expect(addToCartButtons).toHaveCount(0);

    // 12. "Otros orígenes" Section
    const otrosHeading = page.getByRole('heading', { level: 2, name: 'Otros orígenes' });
    await expect(otrosHeading).toBeVisible();
    const otherOriginLink = page.locator('a[href="/origenes/demo-cacao-origin"]');
    await expect(otherOriginLink).toBeVisible();
  });

  test('demo-cacao-origin: displays cacao domain, process ("Del árbol a tu barra") and associated products', async ({ page }) => {
    await page.goto('/origenes/demo-cacao-origin');

    await expect(page).toHaveTitle(/\[Origen de cacao demo\] · Origen Monteluna/);
    await expect(page.getByRole('heading', { level: 1, name: '[Origen de cacao demo]' })).toBeVisible();

    // Cacao eyebrow
    await expect(page.locator('text=Origen de cacao · Santander, Colombia')).toBeVisible();

    // Cacao terroir / municipality
    await expect(page.locator('dd', { hasText: /San Vicente de Chucurí/i })).toBeVisible();
    await expect(page.locator('dd', { hasText: /Santander/i })).toBeVisible();

    // Cacao process title ("Del árbol a tu barra")
    const processHeading = page.getByRole('heading', { level: 2, name: 'Del árbol a tu barra' });
    await expect(processHeading).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'Fermentación y secado' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 3, name: 'En barra' })).toBeVisible();

    // Associated chocolate product exists
    const chocCard = page.locator('article', { hasText: 'Chocolate 70%' });
    await expect(chocCard).toBeVisible();

    // Other origin link to coffee
    const otherOriginLink = page.locator('a[href="/origenes/finca-el-mirador"]');
    await expect(otherOriginLink).toBeVisible();
  });
});
