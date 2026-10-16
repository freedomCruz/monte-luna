import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrderLineItem } from './order-line-item';

describe('OrderLineItem', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders compact variant for checkout aside', () => {
    render(
      <OrderLineItem
        variant="compact"
        title="Café Finca El Mirador"
        variantLabel="500 g · Grano entero"
        quantity={2}
        amountMinor={3800000}
        compareAtAmountMinor={4200000}
        productionDate="2 oct 2026"
        isCoffee={true}
      />
    );

    expect(screen.getByText('Café Finca El Mirador')).not.toBeNull();
    expect(screen.getByText('500 g · Grano entero')).not.toBeNull();
    expect(screen.getByText('2')).not.toBeNull();
    expect(screen.getByText('Tostado el 2 oct 2026')).not.toBeNull();
    expect(screen.getByText('$76.000')).not.toBeNull();
    expect(screen.getByLabelText('Precio regular')).not.toBeNull();
  });

  it('renders panel variant with remove action and controls slot', () => {
    const onRemove = vi.fn();
    render(
      <OrderLineItem
        variant="panel"
        title="Chocolate oscuro 65 %"
        variantLabel="Barra de 80 g"
        titleHref="/productos/chocolate-65"
        quantity={1}
        amountMinor={1400000}
        onRemove={onRemove}
        controlsSlot={<div data-testid="stepper-slot">Stepper</div>}
      />
    );

    expect(screen.getByRole('link', { name: 'Chocolate oscuro 65 %' })).not.toBeNull();
    expect(screen.getByTestId('stepper-slot')).not.toBeNull();
    const removeBtn = screen.getByRole('button', { name: 'Quitar Chocolate oscuro 65 % del carrito' });
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledOnce();
  });

  it('renders page variant matching /carrito list items', () => {
    render(
      <OrderLineItem
        variant="page"
        title="Café Finca El Mirador"
        titleHref="/productos/finca-el-mirador"
        variantLabel="500 g"
        quantity={1}
        amountMinor={3800000}
        originSlug="finca-el-mirador"
        originName="Huila"
        controlsSlot={<div>Controls</div>}
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Café Finca El Mirador' })).not.toBeNull();
    expect(screen.getByRole('link', { name: 'De Huila →' })).not.toBeNull();
  });
});
