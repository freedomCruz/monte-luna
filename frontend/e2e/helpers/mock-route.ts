import type { Page, Route } from '@playwright/test';
import { mockAvailabilitiesFixture, type ProductAvailabilityPage } from '../fixtures/availabilities';

/**
 * Intercepts /api/v1/product-availabilities requests and responds with
 * filtered mock availability data.
 */
export async function mockAvailabilitiesRoute(
  page: Page,
  customData?: Partial<ProductAvailabilityPage>
) {
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
