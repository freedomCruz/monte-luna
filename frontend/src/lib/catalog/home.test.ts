import { describe, it, expect } from 'vitest';
import { selectHomeProducts, buildOriginBand, selectPackshots } from './home';
import { mockCatalogData, mockOriginCoffee, mockCoffeeProduct } from '../../mocks/catalog';
import type { Product } from './catalog';

describe('selectHomeProducts', () => {
  const products = mockCatalogData.products;

  it('keeps the first four products in catalog order', () => {
    const many = [...products, { ...products[0], slug: 'quinto-producto' }];
    expect(selectHomeProducts(many).map((p) => p.slug)).toEqual(products.slice(0, 4).map((p) => p.slug));
  });

  it('returns every product when fewer than four exist and none when the catalog is empty', () => {
    expect(selectHomeProducts(products.slice(0, 2))).toHaveLength(2);
    expect(selectHomeProducts([])).toEqual([]);
  });
});

describe('buildOriginBand', () => {
  it('returns null when no origin is published', () => {
    expect(buildOriginBand(undefined, [])).toBeNull();
  });

  it('takes origin facts from the origin and variety and cupping score from its first product', () => {
    const band = buildOriginBand(mockOriginCoffee, [mockCoffeeProduct]);

    expect(band).toEqual({
      slug: 'finca-el-mirador',
      name: 'Finca El Mirador',
      eyebrow: 'Finca El Mirador · Huila',
      story: mockOriginCoffee.story,
      chips: ['Productora: Productor de café demo', 'Variedad Geisha, Bourbon', 'Puntaje SCA 88.5'],
      photo: { url: '/images/photo-coffee-cherries.webp', alt: 'Paisaje de finca cafetera demo' },
      packageImage: { url: mockCoffeeProduct.images[0].url, alt: '' },
      ctaLabel: 'Conocer Finca El Mirador',
      href: '/origenes/finca-el-mirador',
    });
  });

  it('hides product chips, package and missing origin facts instead of inventing them', () => {
    const bare = { ...mockOriginCoffee, department: null, story: null, images: [] };
    const withoutAttributes: Product = { ...mockCoffeeProduct, attributes: [], images: [] };

    expect(buildOriginBand(bare, [])).toMatchObject({
      eyebrow: 'Finca El Mirador',
      story: null,
      chips: ['Productora: Productor de café demo'],
      photo: null,
      packageImage: null,
    });
    expect(buildOriginBand(bare, [withoutAttributes])?.chips).toEqual(['Productora: Productor de café demo']);
  });
});

describe('selectPackshots', () => {
  const products = mockCatalogData.products;

  it('takes the first image of the first products of one product type, in catalog order', () => {
    const coffee = products.filter((p) => p.product_type.slug === 'coffee' && p.images.length > 0);
    const shots = selectPackshots(products, 'coffee', 1);

    expect(shots).toEqual([{ url: coffee[0].images[0].url, alt: coffee[0].images[0].alt_text ?? coffee[0].title }]);
  });

  it('skips products without images and returns nothing for an unknown type', () => {
    const withoutImages = products.map((p) => ({ ...p, images: [] }));

    expect(selectPackshots(withoutImages, 'coffee', 2)).toEqual([]);
    expect(selectPackshots(products, 'unknown', 2)).toEqual([]);
  });
});
