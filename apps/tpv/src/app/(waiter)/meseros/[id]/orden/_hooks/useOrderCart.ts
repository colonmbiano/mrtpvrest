"use client";
import { useState } from "react";
import type { CartLine, Product } from "../_lib/types";

export function useOrderCart() {
  const [cart, setCart] = useState<CartLine[]>([]);

  function addToCart(p: Product) {
    const price = p.promoPrice ?? p.price;
    setCart((prev) => {
      const idx = prev.findIndex((l) => l.menuItemId === p.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { menuItemId: p.id, name: p.name, price, quantity: 1 }];
    });
  }

  function changeQty(menuItemId: string, delta: number) {
    setCart((prev) =>
      prev
        .map((l) => (l.menuItemId === menuItemId ? { ...l, quantity: l.quantity + delta } : l))
        .filter((l) => l.quantity > 0),
    );
  }

  function removeLine(menuItemId: string) {
    setCart((prev) => prev.filter((l) => l.menuItemId !== menuItemId));
  }

  function clear() {
    setCart([]);
  }

  const count = cart.reduce((acc, l) => acc + l.quantity, 0);
  const total = cart.reduce((acc, l) => acc + l.price * l.quantity, 0);

  return { cart, count, total, addToCart, changeQty, removeLine, clear };
}
