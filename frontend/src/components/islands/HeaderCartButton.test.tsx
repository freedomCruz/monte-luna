import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import React from 'react';
import { HeaderCartButton } from './HeaderCartButton';
import { $cart, $isCartOpen, addItem, clearCart, closeCart } from '../../lib/cart-store';

describe('HeaderCartButton', () => {
  beforeEach(() => {
    clearCart();
    closeCart();
  });

  afterEach(() => {
    cleanup();
  });

  it('renders cart buttons with 0 count initially', () => {
    render(<HeaderCartButton />);
    const desktopBtn = screen.getByTestId('header-cart-desktop');
    const mobileBtn = screen.getByTestId('header-cart-mobile');
    expect(desktopBtn).toBeDefined();
    expect(desktopBtn.textContent).toContain('0');
    expect(mobileBtn).toBeDefined();
    expect(mobileBtn.textContent).toContain('0');
  });

  it('reactively updates count when items are added to $cart', async () => {
    render(<HeaderCartButton />);
    expect(screen.getByTestId('header-cart-desktop').textContent).toContain('0');

    addItem({
      variant_id: 'v1',
      quantity: 3,
      product_slug: 'finca-el-mirador',
      product_name: 'Finca El Mirador',
    });

    await waitFor(() => {
      expect(screen.getByTestId('header-cart-desktop').textContent).toContain('3');
      expect(screen.getByTestId('header-cart-mobile').textContent).toContain('3');
    });
  });

  it('calls openCart and sets $isCartOpen to true on click', () => {
    render(<HeaderCartButton />);
    expect($isCartOpen.get()).toBe(false);

    fireEvent.click(screen.getByTestId('header-cart-desktop'));
    expect($isCartOpen.get()).toBe(true);

    closeCart();
    expect($isCartOpen.get()).toBe(false);

    fireEvent.click(screen.getByTestId('header-cart-mobile'));
    expect($isCartOpen.get()).toBe(true);
  });
});
