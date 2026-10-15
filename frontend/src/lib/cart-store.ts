import { persistentAtom } from '@nanostores/persistent';
import { atom, computed } from 'nanostores';

export interface CartItem {
  variant_id: string;
  quantity: number;
  product_slug: string;
  product_name: string;
  variant_label?: string;
  image_url?: string;
  origin_slug?: string;
  origin_name?: string;
  product_type?: string;
}

export type CartLines = Record<string, CartItem>;

export const $cart = persistentAtom<CartLines>(
  'monteluna:cart',
  {},
  {
    encode: JSON.stringify,
    decode: (encoded: string): CartLines => {
      try {
        const parsed = JSON.parse(encoded);
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as CartLines;
        }
        return {};
      } catch {
        return {};
      }
    },
  }
);

export const $totalItems = computed($cart, (cart) => {
  return Object.values(cart).reduce((sum, item) => sum + (item.quantity || 0), 0);
});

export const $cartItems = computed($cart, (cart) => {
  return Object.values(cart);
});

export const $isCartOpen = atom<boolean>(false);

export function openCart() {
  $isCartOpen.set(true);
}

export function closeCart() {
  $isCartOpen.set(false);
}

export function toggleCart() {
  $isCartOpen.set(!$isCartOpen.get());
}

export function addItem(item: Omit<CartItem, 'quantity'> & { quantity?: number }) {
  const current = { ...$cart.get() };
  const qty = item.quantity ?? 1;
  const existing = current[item.variant_id];

  if (existing) {
    current[item.variant_id] = {
      ...existing,
      ...item,
      quantity: existing.quantity + qty,
    };
  } else {
    current[item.variant_id] = {
      ...item,
      quantity: qty,
    };
  }
  $cart.set(current);
}

export function incrementItem(variantId: string) {
  const current = { ...$cart.get() };
  const existing = current[variantId];
  if (!existing) return;

  current[variantId] = {
    ...existing,
    quantity: existing.quantity + 1,
  };
  $cart.set(current);
}

export function decrementItem(variantId: string, removeOnZero = false) {
  const current = { ...$cart.get() };
  const existing = current[variantId];
  if (!existing) return;

  if (existing.quantity > 1) {
    current[variantId] = {
      ...existing,
      quantity: existing.quantity - 1,
    };
    $cart.set(current);
  } else if (removeOnZero) {
    delete current[variantId];
    $cart.set(current);
  }
}

export function removeItem(variantId: string) {
  const current = { ...$cart.get() };
  if (current[variantId]) {
    delete current[variantId];
    $cart.set(current);
  }
}

export function setQuantity(variantId: string, quantity: number) {
  const current = { ...$cart.get() };
  const existing = current[variantId];
  if (!existing) return;

  if (quantity <= 0) {
    delete current[variantId];
  } else {
    current[variantId] = {
      ...existing,
      quantity: Math.floor(quantity),
    };
  }
  $cart.set(current);
}

export function clearCart() {
  $cart.set({});
}
