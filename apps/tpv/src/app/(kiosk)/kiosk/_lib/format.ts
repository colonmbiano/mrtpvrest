import type { CartItem } from "./types";

export function formatPrice(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
}

export function cartTotal(cart: CartItem[]) {
  return cart.reduce(
    (sum, item) =>
      sum + (item.price + item.modifiers.reduce((s, m) => s + m.price, 0)) * item.quantity,
    0,
  );
}
