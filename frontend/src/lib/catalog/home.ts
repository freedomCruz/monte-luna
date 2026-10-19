import type { Origin, Product } from './catalog';

const HOME_PRODUCT_LIMIT = 4;

/** Home grid shows the first products of the public listing, in API order. */
export function selectHomeProducts(products: Product[]): Product[] {
  return products.slice(0, HOME_PRODUCT_LIMIT);
}

export interface HomeImage {
  url: string;
  alt: string;
}

export interface OriginBand {
  slug: string;
  name: string;
  eyebrow: string;
  story: string | null;
  chips: string[];
  photo: HomeImage | null;
  /** Decorative package of the origin's first product, overlaid on the photo on desktop. */
  packageImage: HomeImage | null;
  ctaLabel: string;
  href: string;
}

function attributeValue(product: Product | undefined, key: string): string | null {
  const value = product?.attributes.find((a) => a.key === key)?.display_value;
  return value ? String(value) : null;
}

/**
 * Builds the home origin band from the first published origin. Producer comes
 * from the origin; variety and cupping score are attributes of the origin's
 * first product, shown only when that product carries them.
 */
export function buildOriginBand(origin: Origin | undefined, originProducts: Product[]): OriginBand | null {
  if (!origin) return null;

  const product = originProducts[0];
  const varieties = attributeValue(product, 'varieties');
  const cuppingScore = attributeValue(product, 'cupping_score');
  const photo = origin.images[0];
  const cover = product?.images[0];

  return {
    slug: origin.slug,
    name: origin.name,
    eyebrow: origin.department ? `${origin.name} · ${origin.department}` : origin.name,
    story: origin.story,
    chips: [
      `Productora: ${origin.producer_name}`,
      ...(varieties ? [`Variedad ${varieties}`] : []),
      ...(cuppingScore ? [`Puntaje SCA ${cuppingScore}`] : []),
    ],
    photo: photo ? { url: photo.url, alt: photo.alt_text ?? origin.name } : null,
    packageImage: cover ? { url: cover.url, alt: '' } : null,
    ctaLabel: `Conocer ${origin.name}`,
    href: `/origenes/${origin.slug}`,
  };
}
