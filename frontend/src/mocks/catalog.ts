import type { components } from '../generated/catalog';

export type Product = components['schemas']['Product'];
export type Category = components['schemas']['Category'];
export type Origin = components['schemas']['Origin'];
export type Variant = components['schemas']['Variant'];

export const mockOriginCoffee: Origin = {
  slug: 'finca-el-mirador',
  name: 'Finca El Mirador',
  producer_name: 'Demo coffee producer',
  country_code: 'CO',
  department: 'Huila',
  municipality_code: '41668',
  municipality_name: 'San Agustín',
  altitude_min_masl: 1700,
  altitude_max_masl: 1900,
  story: '[Demo story] A fictional coffee farm used to demonstrate reusable origin facts.',
  images: [
    {
      url: '/images/photo-coffee-cherries.jpg',
      alt_text: 'Demo coffee farm landscape',
    },
    {
      url: '/images/photo-roasted-beans-concrete.jpg',
      alt_text: 'Granos de café reposando tras el secado al sol',
    },
  ],
};

export const mockOriginCacao: Origin = {
  slug: 'demo-cacao-origin',
  name: '[Demo cacao origin]',
  producer_name: 'Demo cacao producer',
  country_code: 'CO',
  department: 'Santander',
  municipality_code: '68689',
  municipality_name: 'San Vicente de Chucurí',
  altitude_min_masl: 400,
  altitude_max_masl: 700,
  story: '[Demo story] A fictional cacao producer unit; the merchant must replace these facts.',
  images: [
    {
      url: '/images/photo-cacao-pods-trunk.jpg',
      alt_text: 'Demo cacao farm landscape',
    },
    {
      url: '/images/photo-cacao-pods-colourful.jpg',
      alt_text: 'Cosecha de mazorcas multicolores de cacao fino de aroma',
    },
  ],
};

export const mockCategories: Category[] = [
  {
    slug: 'coffee',
    name: 'Coffee',
    parent_slug: null,
    position: 0,
  },
  {
    slug: 'cacao',
    name: 'Cacao',
    parent_slug: null,
    position: 1,
  },
  {
    slug: 'chocolate',
    name: 'Chocolate',
    parent_slug: 'cacao',
    position: 2,
  },
];

export const mockProductTypeCoffee = {
  slug: 'coffee',
  name: 'Coffee',
};

export const mockProductTypeCacao = {
  slug: 'cacao',
  name: 'Cacao',
};

export const mockBrandMonteluna = {
  slug: 'monteluna',
  name: 'Monteluna',
};

export const mockCoffeeProduct: Product = {
  slug: 'finca-el-mirador',
  title: 'Finca El Mirador',
  description: 'Demo washed coffee with a fixed medium roast and independent stock per presentation and grind.',
  created_at: '2026-10-10T12:00:00Z',
  product_type: mockProductTypeCoffee,
  brand: mockBrandMonteluna,
  origin: {
    slug: mockOriginCoffee.slug,
    name: mockOriginCoffee.name,
    producer_name: mockOriginCoffee.producer_name,
  },
  categories: [mockCategories[0]],
  images: [
    {
      url: '/images/packaging-finca-el-mirador.webp',
      alt_text: 'Demo Finca El Mirador coffee packaging',
      variant_id: null,
    },
    {
      url: '/images/photo-coffee-cherries.jpg',
      alt_text: 'Cerezas de café cosechadas a mano',
      variant_id: null,
    },
  ],
  attributes: [
    {
      key: 'species',
      label: 'Species',
      data_type: 'option',
      unit: null,
      value: 'arabica',
      display_value: 'Arabica',
    },
    {
      key: 'varieties',
      label: 'Varieties',
      data_type: 'multi_option',
      unit: null,
      value: ['geisha', 'bourbon'],
      display_value: 'Geisha, Bourbon',
    },
    {
      key: 'process',
      label: 'Process',
      data_type: 'option',
      unit: null,
      value: 'washed',
      display_value: 'Washed',
    },
    {
      key: 'roast_level',
      label: 'Roast level',
      data_type: 'option',
      unit: null,
      value: 'medium',
      display_value: 'Medium',
    },
    {
      key: 'tasting_notes',
      label: 'Tasting notes',
      data_type: 'text',
      unit: null,
      value: 'Citrus, panela and chocolate (demo)',
      display_value: 'Citrus, panela and chocolate (demo)',
    },
    {
      key: 'cupping_score',
      label: 'Cupping score',
      data_type: 'decimal',
      unit: null,
      value: 88.5,
      display_value: '88.5',
    },
    {
      key: 'cupping_protocol',
      label: 'Assessment protocol',
      data_type: 'option',
      unit: null,
      value: 'sca',
      display_value: 'SCA (demo assessment)',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e01',
      sku: 'MIRADOR-250-WHOLE_BEAN',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '250_g',
          display_value: '250',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'whole_bean',
          display_value: 'Whole bean',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e02',
      sku: 'MIRADOR-250-FINE',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '250_g',
          display_value: '250',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'fine',
          display_value: 'Fine',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e03',
      sku: 'MIRADOR-250-MEDIUM',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '250_g',
          display_value: '250',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'medium',
          display_value: 'Medium',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e04',
      sku: 'MIRADOR-250-COARSE',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '250_g',
          display_value: '250',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'coarse',
          display_value: 'Coarse',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e05',
      sku: 'MIRADOR-500-WHOLE_BEAN',
      weight_grams: 500,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '500_g',
          display_value: '500',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'whole_bean',
          display_value: 'Whole bean',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e06',
      sku: 'MIRADOR-500-FINE',
      weight_grams: 500,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '500_g',
          display_value: '500',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'fine',
          display_value: 'Fine',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e07',
      sku: 'MIRADOR-500-MEDIUM',
      weight_grams: 500,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '500_g',
          display_value: '500',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'medium',
          display_value: 'Medium',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e08',
      sku: 'MIRADOR-500-COARSE',
      weight_grams: 500,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '500_g',
          display_value: '500',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'coarse',
          display_value: 'Coarse',
        },
      ],
    },
  ],
};

export const mockCoffeeProductMaria: Product = {
  slug: 'finca-la-maria',
  title: 'Finca La María',
  description: 'Second demo coffee sharing the reusable coffee origin.',
  created_at: '2026-10-11T10:00:00Z',
  product_type: mockProductTypeCoffee,
  brand: mockBrandMonteluna,
  origin: {
    slug: mockOriginCoffee.slug,
    name: mockOriginCoffee.name,
    producer_name: mockOriginCoffee.producer_name,
  },
  categories: [mockCategories[0]],
  images: [
    {
      url: '/images/packaging-finca-el-mirador.webp',
      alt_text: 'Demo Finca La María coffee packaging',
      variant_id: null,
    },
    {
      url: '/images/photo-roasted-beans-pile.jpg',
      alt_text: 'Granos tostados de Finca La María',
      variant_id: null,
    },
  ],
  attributes: [
    {
      key: 'species',
      label: 'Species',
      data_type: 'option',
      unit: null,
      value: 'arabica',
      display_value: 'Arabica',
    },
    {
      key: 'varieties',
      label: 'Varieties',
      data_type: 'multi_option',
      unit: null,
      value: ['castillo'],
      display_value: 'Castillo',
    },
    {
      key: 'process',
      label: 'Process',
      data_type: 'option',
      unit: null,
      value: 'natural',
      display_value: 'Natural',
    },
    {
      key: 'roast_level',
      label: 'Roast level',
      data_type: 'option',
      unit: null,
      value: 'light',
      display_value: 'Light',
    },
    {
      key: 'tasting_notes',
      label: 'Tasting notes',
      data_type: 'text',
      unit: null,
      value: 'Red fruit (demo)',
      display_value: 'Red fruit (demo)',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e09',
      sku: 'MARIA-250-WHOLE_BEAN',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '250_g',
          display_value: '250',
        },
        {
          key: 'grind',
          label: 'Grind',
          data_type: 'option',
          unit: null,
          value: 'whole_bean',
          display_value: 'Whole bean',
        },
      ],
    },
  ],
};

export const mockCacaoProduct: Product = {
  slug: 'chocolate-70',
  title: 'Chocolate 70%',
  description: 'Demo cacao bar; origin facts stay separate from cacao product attributes.',
  created_at: '2026-10-11T14:30:00Z',
  product_type: mockProductTypeCacao,
  brand: mockBrandMonteluna,
  origin: {
    slug: mockOriginCacao.slug,
    name: mockOriginCacao.name,
    producer_name: mockOriginCacao.producer_name,
  },
  // In backend seed: chocolate-70 belongs to both 'cacao' and 'chocolate' categories!
  categories: [mockCategories[1], mockCategories[2]],
  images: [
    {
      url: '/images/packaging-chocolate-75-100.webp',
      alt_text: 'Demo 70 percent cacao bar packaging',
      variant_id: null,
    },
    {
      url: '/images/photo-cacao-pods-trunk.jpg',
      alt_text: 'Cacao fino de aroma en árbol',
      variant_id: null,
    },
  ],
  attributes: [
    {
      key: 'genetic_group',
      label: 'Genetic group',
      data_type: 'option',
      unit: null,
      value: 'trinitario',
      display_value: 'Trinitario',
    },
    {
      key: 'fermentation',
      label: 'Fermentation',
      data_type: 'text',
      unit: null,
      value: 'Six days (demo)',
      display_value: 'Six days (demo)',
    },
    {
      key: 'drying',
      label: 'Drying',
      data_type: 'text',
      unit: null,
      value: 'Sun-dried (demo)',
      display_value: 'Sun-dried (demo)',
    },
    {
      key: 'product_form',
      label: 'Product form',
      data_type: 'option',
      unit: null,
      value: 'bar',
      display_value: 'Bar',
    },
    {
      key: 'cacao_percentage',
      label: 'Cacao',
      data_type: 'integer',
      unit: '%',
      value: 70,
      display_value: '70',
    },
    {
      key: 'fine_or_flavour',
      label: 'Fine or flavour (merchant declaration)',
      data_type: 'boolean',
      unit: null,
      value: true,
      display_value: 'true',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-2a2b3c4d5e01',
      sku: 'CHOCOLATE-70-80',
      weight_grams: 80,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '80_g',
          display_value: '80',
        },
      ],
    },
  ],
};

export const mockOriginlessProduct: Product = {
  slug: 'chocolate-85',
  title: 'Chocolate 85%',
  description: 'Demo commercial-brand product without an agricultural origin; no origin link is shown.',
  created_at: '2026-10-12T09:15:00Z',
  product_type: mockProductTypeCacao,
  brand: mockBrandMonteluna,
  origin: null,
  // Also multi-category in backend demo seed
  categories: [mockCategories[1], mockCategories[2]],
  images: [
    {
      url: '/images/packaging-chocolate-75-100.webp',
      alt_text: 'Demo 85 percent cacao bar packaging',
      variant_id: null,
    },
  ],
  attributes: [
    {
      key: 'product_form',
      label: 'Product form',
      data_type: 'option',
      unit: null,
      value: 'bar',
      display_value: 'Bar',
    },
    {
      key: 'cacao_percentage',
      label: 'Cacao',
      data_type: 'integer',
      unit: '%',
      value: 85,
      display_value: '85',
    },
    {
      key: 'fine_or_flavour',
      label: 'Fine or flavour (merchant declaration)',
      data_type: 'boolean',
      unit: null,
      value: false,
      display_value: 'false',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-3a2b3c4d5e01',
      sku: 'CHOCOLATE-85-80',
      weight_grams: 80,
      options: [
        {
          key: 'presentation',
          label: 'Presentation',
          data_type: 'option',
          unit: 'g',
          value: '80_g',
          display_value: '80',
        },
      ],
    },
  ],
};

export const mockCatalogData = {
  origins: [mockOriginCoffee, mockOriginCacao],
  categories: mockCategories,
  products: [mockCoffeeProduct, mockCoffeeProductMaria, mockCacaoProduct, mockOriginlessProduct],
};
