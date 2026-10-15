import { describe, it, expect } from 'vitest';
import {
  mockOriginCoffee,
  mockOriginCacao,
  mockCategories,
  mockProductTypeCoffee,
  mockProductTypeCacao,
  mockCoffeeProduct,
  mockMariaProduct,
  mockChocolateProduct,
  mockNoOriginProduct,
} from '../../mocks/catalog';

describe('Catalog Mock Spanish Seed Alignment (B3 demo_data.go / metadata.sql)', () => {
  it('aligns product types and categories with Spanish seed metadata', () => {
    // Categories
    const coffeeCategory = mockCategories.find((c) => c.slug === 'coffee');
    const cacaoCategory = mockCategories.find((c) => c.slug === 'cacao');
    const chocolateCategory = mockCategories.find((c) => c.slug === 'chocolate');

    expect(coffeeCategory?.name).toBe('Café');
    expect(cacaoCategory?.name).toBe('Cacao');
    expect(chocolateCategory?.name).toBe('Chocolate');

    // Product Types
    expect(mockProductTypeCoffee.name).toBe('Café');
    expect(mockProductTypeCacao.name).toBe('Cacao');
  });

  it('aligns origins metadata and alt text with demo_data.go / metadata.sql', () => {
    // mockOriginCoffee
    expect(mockOriginCoffee.producer_name).toBe('Productor de café demo');
    expect(mockOriginCoffee.story).toBe(
      '[Historia demo] Finca cafetera ficticia utilizada para demostrar datos de origen reutilizables.'
    );
    expect(mockOriginCoffee.images[0]?.alt_text).toBe('Paisaje de finca cafetera demo');

    // mockOriginCacao
    expect(mockOriginCacao.name).toBe('[Origen de cacao demo]');
    expect(mockOriginCacao.producer_name).toBe('Productor de cacao demo');
    expect(mockOriginCacao.story).toBe(
      '[Historia demo] Unidad productora de cacao ficticia; el comerciante debe reemplazar estos datos.'
    );
    expect(mockOriginCacao.images[0]?.alt_text).toBe('Paisaje de finca cacaotera demo');
  });

  it('aligns Finca El Mirador product description, attributes and variant labels with demo_data.go', () => {
    expect(mockCoffeeProduct.description).toBe(
      'Café lavado demo con tostión media fija y existencias independientes por presentación y molienda.'
    );
    expect(mockCoffeeProduct.images[0]?.alt_text).toBe('Empaque de café Finca El Mirador demo');

    // Attributes
    const attrs = Object.fromEntries(mockCoffeeProduct.attributes.map((a) => [a.key, a]));
    expect(attrs.species?.label).toBe('Especie');
    expect(attrs.species?.display_value).toBe('Arábica');

    expect(attrs.varieties?.label).toBe('Variedades');
    expect(attrs.varieties?.display_value).toBe('Geisha, Bourbon');

    expect(attrs.process?.label).toBe('Proceso');
    expect(attrs.process?.display_value).toBe('Lavado');

    expect(attrs.roast_level?.label).toBe('Tostión');
    expect(attrs.roast_level?.display_value).toBe('Media');

    expect(attrs.tasting_notes?.label).toBe('Notas de cata');
    expect(attrs.tasting_notes?.display_value).toBe('Cítricos, panela y chocolate (demo)');

    expect(attrs.cupping_score?.label).toBe('Puntaje de cata');

    expect(attrs.cupping_protocol?.label).toBe('Protocolo de evaluación');
    expect(attrs.cupping_protocol?.display_value).toBe('SCA (evaluación demo)');

    // Variants options
    const firstVariant = mockCoffeeProduct.variants[0];
    const opts = Object.fromEntries(firstVariant.options.map((o) => [o.key, o]));
    expect(opts.presentation?.label).toBe('Presentación');
    expect(opts.grind?.label).toBe('Molienda');
    expect(opts.grind?.display_value).toBe('Grano entero');
  });

  it('aligns Finca La María product description and attributes with demo_data.go', () => {
    expect(mockMariaProduct.description).toBe(
      'Segundo café demo que comparte el origen de café reutilizable.'
    );
    expect(mockMariaProduct.images[0]?.alt_text).toBe('Empaque de café Finca La María demo');

    const attrs = Object.fromEntries(mockMariaProduct.attributes.map((a) => [a.key, a]));
    expect(attrs.process?.display_value).toBe('Natural');
    expect(attrs.roast_level?.display_value).toBe('Clara');
    expect(attrs.tasting_notes?.display_value).toBe('Frutos rojos (demo)');
  });

  it('aligns chocolate products descriptions, attributes and images with demo_data.go', () => {
    // Chocolate 70%
    expect(mockChocolateProduct.description).toBe(
      'Barra de cacao demo; los datos de origen se mantienen separados de los atributos del producto de cacao.'
    );
    expect(mockChocolateProduct.images[0]?.alt_text).toBe('Empaque de barra de chocolate 70 % cacao demo');

    const attrs70 = Object.fromEntries(mockChocolateProduct.attributes.map((a) => [a.key, a]));
    expect(attrs70.genetic_group?.label).toBe('Grupo genético');
    expect(attrs70.genetic_group?.display_value).toBe('Trinitario');
    expect(attrs70.fermentation?.label).toBe('Fermentación');
    expect(attrs70.fermentation?.display_value).toBe('Seis días (demo)');
    expect(attrs70.drying?.label).toBe('Secado');
    expect(attrs70.drying?.display_value).toBe('Secado al sol (demo)');
    expect(attrs70.product_form?.label).toBe('Forma del producto');
    expect(attrs70.product_form?.display_value).toBe('Barra');
    expect(attrs70.cacao_percentage?.label).toBe('Cacao');
    expect(attrs70.fine_or_flavour?.label).toBe('Fino o de aroma (declaración del comerciante)');

    // Chocolate 85%
    expect(mockNoOriginProduct.description).toBe(
      'Producto demo de marca comercial sin origen agrícola; no se muestra enlace de origen.'
    );
    expect(mockNoOriginProduct.images[0]?.alt_text).toBe('Empaque de barra de chocolate 85 % cacao demo');
  });
});
