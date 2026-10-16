import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuantityStepper } from './quantity-stepper';

describe('QuantityStepper', () => {
  afterEach(() => {
    cleanup();
  });

  it('renders quantity with default label and handles increment and decrement', () => {
    const onIncrement = vi.fn();
    const onDecrement = vi.fn();

    render(
      <QuantityStepper
        quantity={3}
        onIncrement={onIncrement}
        onDecrement={onDecrement}
        label="Cantidad de Café Monteluna"
      />
    );

    const group = screen.getByRole('group', { name: 'Cantidad de Café Monteluna' });
    expect(group).not.toBeNull();

    const decBtn = screen.getByRole('button', { name: 'Quitar una unidad' });
    const incBtn = screen.getByRole('button', { name: 'Agregar una unidad' });

    expect(screen.getByText('3')).not.toBeNull();

    fireEvent.click(incBtn);
    expect(onIncrement).toHaveBeenCalledOnce();

    fireEvent.click(decBtn);
    expect(onDecrement).toHaveBeenCalledOnce();
  });

  it('disables decrement button when quantity <= min', () => {
    const onDecrement = vi.fn();
    render(
      <QuantityStepper
        quantity={1}
        min={1}
        onIncrement={() => {}}
        onDecrement={onDecrement}
      />
    );

    const decBtn = screen.getByRole('button', { name: 'Quitar una unidad' });
    expect(decBtn.hasAttribute('disabled')).toBe(true);

    fireEvent.click(decBtn);
    expect(onDecrement).not.toHaveBeenCalled();
  });

  it('respects overall disabled and isIncrementDisabled props', () => {
    render(
      <QuantityStepper
        quantity={2}
        onIncrement={() => {}}
        onDecrement={() => {}}
        isIncrementDisabled={true}
      />
    );

    const incBtn = screen.getByRole('button', { name: 'Agregar una unidad' });
    expect(incBtn.hasAttribute('disabled')).toBe(true);
  });
});
