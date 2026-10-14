import type { components } from '../src/generated/catalog';

export type ProductAvailabilityPage = components['schemas']['ProductAvailabilityPage'];

/**
 * Fixture data for /api/v1/product-availabilities matching the demo catalog products.
 */
export const mockAvailabilitiesFixture: ProductAvailabilityPage = {
  items: [
    {
      product_slug: 'finca-el-mirador',
      variants: [
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e01', // 250g, whole_bean
          price_amount: 3200000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-01',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e02', // 250g, fine
          price_amount: 3200000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'out_of_stock',
          production_date: null,
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e03', // 250g, medium
          price_amount: 3200000,
          compare_at_price_amount: 3500000,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-02',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e04', // 250g, coarse
          price_amount: 3200000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-03',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e05', // 500g, whole_bean
          price_amount: 5800000,
          compare_at_price_amount: 6200000,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-09-28',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e06', // 500g, fine
          price_amount: 5800000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-09-29',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e07', // 500g, medium
          price_amount: 5800000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-09-30',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e08', // 500g, coarse
          price_amount: 5800000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'out_of_stock',
          production_date: null,
        },
      ],
    },
    {
      product_slug: 'finca-la-maria',
      variants: [
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e09', // 250g, whole_bean
          price_amount: 3600000,
          compare_at_price_amount: 4000000,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-04',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e10', // 250g, fine
          price_amount: 3600000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-04',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e11', // 250g, medium
          price_amount: 3600000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-04',
        },
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e12', // 250g, coarse
          price_amount: 3600000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'in_stock',
          production_date: '2026-10-04',
        },
      ],
    },
    {
      product_slug: 'chocolate-70',
      variants: [
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-2a2b3c4d5e01', // 80g
          price_amount: 1800000,
          compare_at_price_amount: 2000000,
          currency: 'COP',
          availability: 'in_stock',
          production_date: null,
        },
      ],
    },
    {
      product_slug: 'chocolate-85',
      variants: [
        {
          variant_id: '0199c4e2-7a1b-7c3d-9e0f-3a2b3c4d5e01', // 80g
          price_amount: 1900000,
          compare_at_price_amount: null,
          currency: 'COP',
          availability: 'out_of_stock',
          production_date: null,
        },
      ],
    },
  ],
  next_cursor: null,
};
