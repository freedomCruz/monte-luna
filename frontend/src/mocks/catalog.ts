import type { components } from '../generated/catalog';

export type Product = components['schemas']['Product'];
export type Category = components['schemas']['Category'];
export type Origin = components['schemas']['Origin'];
export type Variant = components['schemas']['Variant'];

export const mockOriginCoffee: Origin = {
  slug: 'finca-el-mirador',
  name: 'Finca El Mirador',
  producer_name: 'Familia Patiño',
  country_code: 'CO',
  department: 'Huila',
  municipality_code: '41001',
  municipality_name: 'Pitalito',
  altitude_min_masl: 1650,
  altitude_max_masl: 1850,
  story: 'Cultivado a más de 1.700 metros de altura en las laderas del Huila, este café representa la tradición familiar y un proceso de lavado meticuloso con fermentación extendida.',
  images: [
    {
      url: '/images/photo-coffee-cherries.jpg',
      alt_text: 'Cerezas maduras de café en Finca El Mirador',
    },
    {
      url: '/images/photo-roasted-beans-concrete.jpg',
      alt_text: 'Granos de café reposando tras el secado al sol',
    },
  ],
};

export const mockOriginCacao: Origin = {
  slug: 'finca-la-maria',
  name: 'Finca La María',
  producer_name: 'Comunidad Cacaotera de Tumaco',
  country_code: 'CO',
  department: 'Nariño',
  municipality_code: '52835',
  municipality_name: 'Tumaco',
  altitude_min_masl: 50,
  altitude_max_masl: 120,
  story: 'En el bosque húmedo tropical del Pacífico nariñense, los árboles de cacao fino de aroma crecen bajo sombra nativa, recolectados a mano por familias campesinas.',
  images: [
    {
      url: '/images/photo-cacao-pods-trunk.jpg',
      alt_text: 'Mazorcas de cacao creciendo en el tronco en Finca La María',
    },
    {
      url: '/images/photo-cacao-pods-colourful.jpg',
      alt_text: 'Cosecha de mazorcas multicolores de cacao fino de aroma',
    },
  ],
};

export const mockCategories: Category[] = [
  {
    slug: 'cafe',
    name: 'Café de Especialidad',
    parent_slug: null,
    position: 1,
  },
  {
    slug: 'cacao',
    name: 'Cacao & Chocolate',
    parent_slug: null,
    position: 2,
  },
  {
    slug: 'accesorios',
    name: 'Accesorios & Métodos',
    parent_slug: null,
    position: 3,
  },
];

export const mockCoffeeProduct: Product = {
  slug: 'finca-el-mirador-lavado',
  title: 'Finca El Mirador · Lavado',
  description: 'Un café balanceado y brillante con notas de durazno, panela y jazmín. Cosechado a mano en Huila y tostado con perfil medio para resaltar su dulzura natural.',
  created_at: '2026-10-10T12:00:00Z',
  product_type: {
    slug: 'cafe',
    name: 'Café de Especialidad',
  },
  brand: {
    slug: 'monteluna',
    name: 'Monteluna',
  },
  origin: {
    slug: mockOriginCoffee.slug,
    name: mockOriginCoffee.name,
    producer_name: mockOriginCoffee.producer_name,
  },
  categories: [mockCategories[0]],
  images: [
    {
      url: '/images/packaging-finca-el-mirador.webp',
      alt_text: 'Bolsa de Café Finca El Mirador Lavado',
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
      label: 'Especie',
      data_type: 'text',
      unit: null,
      value: 'Arábica',
      display_value: '100 % Arábica',
    },
    {
      key: 'varieties',
      label: 'Variedad',
      data_type: 'multi_option',
      unit: null,
      value: ['caturra', 'castillo'],
      display_value: 'Caturra, Castillo',
    },
    {
      key: 'process',
      label: 'Proceso',
      data_type: 'option',
      unit: null,
      value: 'washed',
      display_value: 'Lavado 36h',
    },
    {
      key: 'roast_level',
      label: 'Tueste',
      data_type: 'option',
      unit: null,
      value: 'medium',
      display_value: 'Medio',
    },
    {
      key: 'tasting_notes',
      label: 'Notas de cata',
      data_type: 'text',
      unit: null,
      value: 'Durazno, Panela, Jazmín',
      display_value: 'Durazno, Panela, Jazmín',
    },
    {
      key: 'cupping_score',
      label: 'Puntaje de cata',
      data_type: 'decimal',
      unit: 'pts SCA',
      value: 86.5,
      display_value: '86.5',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e01',
      sku: 'MIR-LAV-250-GRA',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentación',
          data_type: 'option',
          unit: 'g',
          value: '250g',
          display_value: '250 g',
        },
        {
          key: 'grind',
          label: 'Molienda',
          data_type: 'option',
          unit: null,
          value: 'whole_bean',
          display_value: 'En grano',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e02',
      sku: 'MIR-LAV-250-MED',
      weight_grams: 250,
      options: [
        {
          key: 'presentation',
          label: 'Presentación',
          data_type: 'option',
          unit: 'g',
          value: '250g',
          display_value: '250 g',
        },
        {
          key: 'grind',
          label: 'Molienda',
          data_type: 'option',
          unit: null,
          value: 'medium_grind',
          display_value: 'Molido medio (Filtro)',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-1a2b3c4d5e03',
      sku: 'MIR-LAV-500-GRA',
      weight_grams: 500,
      options: [
        {
          key: 'presentation',
          label: 'Presentación',
          data_type: 'option',
          unit: 'g',
          value: '500g',
          display_value: '500 g',
        },
        {
          key: 'grind',
          label: 'Molienda',
          data_type: 'option',
          unit: null,
          value: 'whole_bean',
          display_value: 'En grano',
        },
      ],
    },
  ],
};

export const mockCacaoProduct: Product = {
  slug: 'chocolate-artesanal-70',
  title: 'Chocolate Artesanal 70% Tumaco',
  description: 'Barra de chocolate oscuro elaborado con cacao fino de aroma del Pacífico. Sabor profundo con notas terrosas, miel y frutos rojos silvestres.',
  created_at: '2026-10-11T14:30:00Z',
  product_type: {
    slug: 'cacao',
    name: 'Cacao & Chocolate',
  },
  brand: {
    slug: 'monteluna',
    name: 'Monteluna',
  },
  origin: {
    slug: mockOriginCacao.slug,
    name: mockOriginCacao.name,
    producer_name: mockOriginCacao.producer_name,
  },
  categories: [mockCategories[1]],
  images: [
    {
      url: '/images/packaging-chocolate-75-100.webp',
      alt_text: 'Barra de Chocolate Artesanal 70% Tumaco',
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
      key: 'cacao_percentage',
      label: 'Porcentaje de cacao',
      data_type: 'integer',
      unit: '%',
      value: 70,
      display_value: '70',
    },
    {
      key: 'genetic_group',
      label: 'Grupo genético',
      data_type: 'text',
      unit: null,
      value: 'Trinitario Acriollado',
      display_value: 'Trinitario Acriollado',
    },
    {
      key: 'product_form',
      label: 'Forma',
      data_type: 'option',
      unit: null,
      value: 'bar',
      display_value: 'Barra',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-2a2b3c4d5e01',
      sku: 'CHO-TUM-70-80G',
      weight_grams: 80,
      options: [
        {
          key: 'presentation',
          label: 'Presentación',
          data_type: 'option',
          unit: 'g',
          value: '80g',
          display_value: '80 g',
        },
      ],
    },
  ],
};

export const mockOriginlessProduct: Product = {
  slug: 'taza-ceramica-monteluna',
  title: 'Taza Cerámica Monteluna Artesanal',
  description: 'Taza de cerámica esmaltada hecha a mano por artesanos locales en El Carmen de Viboral. Diseño ergonómico de 300 ml para disfrutar café o chocolate.',
  created_at: '2026-10-12T09:15:00Z',
  product_type: {
    slug: 'accesorios',
    name: 'Accesorios & Métodos',
  },
  brand: {
    slug: 'monteluna',
    name: 'Monteluna',
  },
  origin: null,
  categories: [mockCategories[2]],
  images: [
    {
      url: '/images/photo-roasted-beans-pile.jpg',
      alt_text: 'Taza de cerámica artesanal Monteluna',
      variant_id: null,
    },
  ],
  attributes: [
    {
      key: 'material',
      label: 'Material',
      data_type: 'text',
      unit: null,
      value: 'Cerámica gres',
      display_value: 'Cerámica gres',
    },
    {
      key: 'capacity',
      label: 'Capacidad',
      data_type: 'integer',
      unit: 'ml',
      value: 300,
      display_value: '300',
    },
  ],
  variants: [
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-3a2b3c4d5e01',
      sku: 'ACC-TAZ-CREMA',
      weight_grams: 280,
      options: [
        {
          key: 'color',
          label: 'Color',
          data_type: 'option',
          unit: null,
          value: 'crema',
          display_value: 'Crema Arena',
        },
      ],
    },
    {
      id: '0199c4e2-7a1b-7c3d-9e0f-3a2b3c4d5e02',
      sku: 'ACC-TAZ-VERDE',
      weight_grams: 280,
      options: [
        {
          key: 'color',
          label: 'Color',
          data_type: 'option',
          unit: null,
          value: 'verde',
          display_value: 'Verde Bosque',
        },
      ],
    },
  ],
};

export const mockCatalogData = {
  origins: [mockOriginCoffee, mockOriginCacao],
  categories: mockCategories,
  products: [mockCoffeeProduct, mockCacaoProduct, mockOriginlessProduct],
};
