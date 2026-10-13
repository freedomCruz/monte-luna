import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './button';

describe('Monteluna button', () => {
  it('uses the brand action tokens and a 44px touch target', () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Comprar</Button>);

    const button = screen.getByRole('button', { name: 'Comprar' });
    expect(button.className).toContain('bg-accent');
    expect(button.className).toContain('min-h-[44px]');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('renders an accessible link when used as a child', () => {
    render(<Button asChild><a href="/tienda">Explorar</a></Button>);
    expect(screen.getByRole('link', { name: 'Explorar' }).getAttribute('href')).toBe('/tienda');
  });
});
