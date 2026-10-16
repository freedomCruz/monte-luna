import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import { describe, it, expect, afterEach } from 'vitest';
import { OrderOriginCard } from './OrderOriginCard';

describe('OrderOriginCard (M-Pedido canvas, F1c)', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders card with department, title, story, and origin link', () => {
    render(
      <OrderOriginCard
        title="Mientras llega, conoce de dónde viene tu café."
        originSlug="finca-el-mirador"
        department="Huila"
        farmerStory="María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m."
      />
    );

    expect(screen.getByText('Origen · Huila')).toBeDefined();
    expect(screen.getByText('Mientras llega, conoce de dónde viene tu café.')).toBeDefined();
    expect(screen.getByText('María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m.')).toBeDefined();

    const link = screen.getByRole('link', { name: /Conocer el origen/i });
    expect(link.getAttribute('href')).toBe('/origenes/finca-el-mirador');
  });

  it('renders "Origen" when department is null or not provided', () => {
    render(
      <OrderOriginCard
        title="Mientras llega, conoce de dónde viene tu café."
        originSlug="finca-el-mirador"
        department={null}
      />
    );

    expect(screen.getByText('Origen')).toBeDefined();
  });

  it('renders canvas fixed story copy when farmerStory is not provided or starts with [', () => {
    render(
      <OrderOriginCard
        title="Mientras decides, conoce de dónde viene tu café."
        originSlug="finca-el-mirador"
        department="Huila"
        farmerStory="[Historia demo] Finca cafetera ficticia..."
      />
    );

    expect(
      screen.getByText('María Gómez cultiva en Finca El Mirador, entre 1.500 y 1.900 m s. n. m.')
    ).toBeDefined();
    expect(screen.queryByText(/\[Historia demo\]/i)).toBeNull();
  });

  it('renders "Mientras decides, conoce de dónde viene tu café." title for expired/cancelled states', () => {
    render(
      <OrderOriginCard
        title="Mientras decides, conoce de dónde viene tu café."
        originSlug="finca-el-mirador"
        department="Huila"
      />
    );

    expect(screen.getByText('Mientras decides, conoce de dónde viene tu café.')).toBeDefined();
  });
});
