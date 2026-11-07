import { describe, expect, it } from 'vitest';
import { productPriceLabel, productStatusPresentation, productTypeColor, stockBadge } from './product-format';

describe('Productos presentation (F2: S2)', () => {
  it('shows one price, a range, or a dash when no active variant has a price', () => {
    expect(productPriceLabel(1_400_000, 1_400_000)).toBe('$14.000');
    expect(productPriceLabel(3_800_000, 7_200_000)).toBe('$38.000 – $72.000');
    expect(productPriceLabel(null, null)).toBe('—');
  });

  it('names the three publication states with the canvas tones', () => {
    expect(productStatusPresentation('published')).toEqual({ label: 'Publicado', tone: 'done' });
    expect(productStatusPresentation('draft')).toEqual({ label: 'Borrador', tone: 'neutral' });
    expect(productStatusPresentation('archived')).toEqual({ label: 'Archivado', tone: 'neutral' });
  });

  it('marks out of stock for a non-archived product and low stock for 1 to 9 units', () => {
    expect(stockBadge({ available_quantity: 0, low_stock: true, status: 'published' })).toEqual({ label: 'Agotado', tone: 'problem' });
    expect(stockBadge({ available_quantity: 0, low_stock: true, status: 'draft' })).toEqual({ label: 'Agotado', tone: 'problem' });
    expect(stockBadge({ available_quantity: 9, low_stock: true, status: 'published' })).toEqual({ label: 'Poco stock', tone: 'action' });
  });

  it('shows no stock badge for enough stock or an archived product without units', () => {
    expect(stockBadge({ available_quantity: 10, low_stock: false, status: 'published' })).toBeNull();
    expect(stockBadge({ available_quantity: 0, low_stock: true, status: 'archived' })).toBeNull();
  });

  it('colours coffee green and cacao purple, any other type neutral', () => {
    expect(productTypeColor('coffee')).toBe('text-brand-green');
    expect(productTypeColor('cacao')).toBe('text-brand-purple');
    expect(productTypeColor('tea')).toBe('text-foreground');
  });
});
