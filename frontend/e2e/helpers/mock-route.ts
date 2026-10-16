import type { Page, Route } from '@playwright/test';
import { mockAvailabilitiesFixture, type ProductAvailabilityPage } from '../fixtures/availabilities';

/**
 * Intercepts /api/v1/products and /api/v1/origins requests for known catalog items
 * so live client fetches work in E2E environments without a live backend running.
 */
export async function mockCatalogRoutes(page: Page) {
  await page.route('**/api/v1/products/*', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/products/finca-el-mirador')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'finca-el-mirador',
          name: 'Finca El Mirador',
          title: 'Finca El Mirador',
          origin: {
            slug: 'finca-el-mirador',
            name: 'Finca El Mirador',
            producer_name: 'María Gómez',
          },
        }),
      });
      return;
    }
    if (url.includes('/api/v1/products/finca-la-maria')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'finca-la-maria',
          name: 'Finca La María',
          title: 'Finca La María',
          origin: {
            slug: 'finca-la-maria',
            name: 'Finca La María',
            producer_name: 'Don Pedro',
          },
        }),
      });
      return;
    }
    if (url.includes('/api/v1/products/chocolate-85') || url.includes('/api/v1/products/chocolate-70')) {
      const slug = url.includes('chocolate-85') ? 'chocolate-85' : 'chocolate-70';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug,
          name: slug,
          title: slug,
          origin: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        title: 'Not Found',
        status: 404,
        code: 'product_not_found',
      }),
    });
  });

  await page.route('**/api/v1/origins/*', async (route: Route) => {
    const url = route.request().url();
    if (url.includes('/api/v1/origins/finca-el-mirador')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'finca-el-mirador',
          name: 'Finca El Mirador',
          producer_name: 'María Gómez',
          department: 'Huila',
          story: 'María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m.',
        }),
      });
      return;
    }
    if (url.includes('/api/v1/origins/finca-la-maria')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          slug: 'finca-la-maria',
          name: 'Finca La María',
          producer_name: 'Don Pedro',
          department: 'Tolima',
          story: null,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 404,
      contentType: 'application/problem+json',
      body: JSON.stringify({
        title: 'Not Found',
        status: 404,
        code: 'origin_not_found',
      }),
    });
  });
}

/**
 * Intercepts /api/v1/product-availabilities requests and responds with
 * filtered mock availability data.
 */
export async function mockAvailabilitiesRoute(
  page: Page,
  customData?: Partial<ProductAvailabilityPage>
) {
  await mockCatalogRoutes(page);
  await page.route('**/api/v1/product-availabilities*', async (route: Route) => {
    const url = new URL(route.request().url());
    const requestedSlugs = url.searchParams.getAll('product_slug');

    const baseData = { ...mockAvailabilitiesFixture, ...customData };
    
    // Filter items to requested slugs if query parameters exist
    const filteredItems = requestedSlugs.length > 0
      ? baseData.items.filter((item: { product_slug: string }) => requestedSlugs.includes(item.product_slug))
      : baseData.items;

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify({
        items: filteredItems,
        next_cursor: null,
      }),
    });
  });
}
