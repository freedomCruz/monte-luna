import { describe, it, expect, beforeEach } from 'vitest';
import {
  $cart,
  $totalItems,
  $cartItems,
  $isCartOpen,
  addItem,
  incrementItem,
  decrementItem,
  removeItem,
  setQuantity,
  clearCart,
  openCart,
  closeCart,
  toggleCart,
  type CartItem,
} from './cart-store';

describe('cart-store', () => {
  beforeEach(() => {
    clearCart();
    closeCart();
  });

  const sampleItem1: Omit<CartItem, 'quantity'> = {
    variant_id: 'var-mirador-500',
    product_slug: 'finca-el-mirador',
    product_name: 'Finca El Mirador',
    variant_label: '500 g · Grano entero',
    image_url: '/images/packaging-finca-el-mirador.webp',
    origin_slug: 'finca-el-mirador',
    origin_name: 'Finca El Mirador, Huila',
    product_type: 'coffee',
  };

  const sampleItem2: Omit<CartItem, 'quantity'> = {
    variant_id: 'var-chocolate-80',
    product_slug: 'chocolate-oscuro-65',
    product_name: 'Chocolate oscuro 65 %',
    variant_label: 'Barra de 80 g',
    image_url: '/images/packaging-chocolate-65.webp',
    product_type: 'chocolate',
  };

  it('starts with an empty cart and totalItems = 0', () => {
    expect($cart.get()).toEqual({});
    expect($totalItems.get()).toBe(0);
    expect($cartItems.get()).toEqual([]);
  });

  it('adds an item with default quantity of 1', () => {
    addItem(sampleItem1);
    const cart = $cart.get();
    expect(cart['var-mirador-500']).toBeDefined();
    expect(cart['var-mirador-500']?.quantity).toBe(1);
    expect($totalItems.get()).toBe(1);
  });

  it('adds an item with custom quantity', () => {
    addItem({ ...sampleItem1, quantity: 3 });
    expect($cart.get()['var-mirador-500']?.quantity).toBe(3);
    expect($totalItems.get()).toBe(3);
  });

  it('increments quantity when adding the same variant again', () => {
    addItem(sampleItem1);
    addItem({ ...sampleItem1, quantity: 2 });
    expect($cart.get()['var-mirador-500']?.quantity).toBe(3);
    expect($totalItems.get()).toBe(3);
  });

  it('handles multiple distinct items', () => {
    addItem(sampleItem1);
    addItem(sampleItem2);
    expect($totalItems.get()).toBe(2);
    expect($cartItems.get()).toHaveLength(2);
  });

  it('increments item quantity', () => {
    addItem(sampleItem1);
    incrementItem('var-mirador-500');
    expect($cart.get()['var-mirador-500']?.quantity).toBe(2);
    expect($totalItems.get()).toBe(2);
  });

  it('ignores increment for non-existent item', () => {
    incrementItem('non-existent');
    expect($totalItems.get()).toBe(0);
  });

  it('decrements item quantity down to 1 by default', () => {
    addItem({ ...sampleItem1, quantity: 2 });
    decrementItem('var-mirador-500');
    expect($cart.get()['var-mirador-500']?.quantity).toBe(1);

    // Stays at 1 by default
    decrementItem('var-mirador-500');
    expect($cart.get()['var-mirador-500']?.quantity).toBe(1);
  });

  it('removes item on decrement if removeOnZero is true and quantity becomes 0', () => {
    addItem(sampleItem1);
    decrementItem('var-mirador-500', true);
    expect($cart.get()['var-mirador-500']).toBeUndefined();
    expect($totalItems.get()).toBe(0);
  });

  it('removes item via removeItem', () => {
    addItem(sampleItem1);
    addItem(sampleItem2);
    removeItem('var-mirador-500');
    expect($cart.get()['var-mirador-500']).toBeUndefined();
    expect($cart.get()['var-chocolate-80']).toBeDefined();
    expect($totalItems.get()).toBe(1);
  });

  it('sets quantity directly and removes if <= 0', () => {
    addItem(sampleItem1);
    setQuantity('var-mirador-500', 5);
    expect($cart.get()['var-mirador-500']?.quantity).toBe(5);

    setQuantity('var-mirador-500', 0);
    expect($cart.get()['var-mirador-500']).toBeUndefined();
  });

  it('clears the cart', () => {
    addItem(sampleItem1);
    addItem(sampleItem2);
    clearCart();
    expect($cart.get()).toEqual({});
    expect($totalItems.get()).toBe(0);
  });

  it('manages cart open/close/toggle state', () => {
    expect($isCartOpen.get()).toBe(false);
    openCart();
    expect($isCartOpen.get()).toBe(true);
    closeCart();
    expect($isCartOpen.get()).toBe(false);
    toggleCart();
    expect($isCartOpen.get()).toBe(true);
    toggleCart();
    expect($isCartOpen.get()).toBe(false);
  });

  it('synchronizes cart across tabs via window storage events', () => {
    const foreignCart: Record<string, CartItem> = {
      'var-tab-2': {
        variant_id: 'var-tab-2',
        quantity: 4,
        product_slug: 'finca-el-mirador',
        product_name: 'Finca El Mirador',
      },
    };

    window.dispatchEvent(
      new StorageEvent('storage', {
        key: 'monteluna:cart',
        newValue: JSON.stringify(foreignCart),
      })
    );

    expect($cart.get()['var-tab-2']?.quantity).toBe(4);
    expect($totalItems.get()).toBe(4);
  });
});
