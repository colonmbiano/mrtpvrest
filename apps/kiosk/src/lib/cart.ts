"use client";
import { useEffect, useReducer } from "react";

export type CartItem = {
  key: string;
  menuItemId: string;
  variantId: string | null;
  name: string;
  price: number;
  quantity: number;
};

type Action =
  | { type: "add"; item: Omit<CartItem, "quantity">; quantity?: number }
  | { type: "set-qty"; key: string; qty: number }
  | { type: "remove"; key: string }
  | { type: "clear" }
  | { type: "hydrate"; items: CartItem[] };

function reducer(state: CartItem[], action: Action): CartItem[] {
  switch (action.type) {
    case "hydrate":
      return action.items;
    case "add": {
      const existing = state.find((i) => i.key === action.item.key);
      const q = action.quantity ?? 1;
      if (existing) return state.map((i) => i.key === action.item.key ? { ...i, quantity: i.quantity + q } : i);
      return [...state, { ...action.item, quantity: q }];
    }
    case "set-qty":
      return state
        .map((i) => i.key === action.key ? { ...i, quantity: Math.max(0, action.qty) } : i)
        .filter((i) => i.quantity > 0);
    case "remove":
      return state.filter((i) => i.key !== action.key);
    case "clear":
      return [];
  }
}

const KEY = "kiosk-cart";

export function useCart() {
  const [items, dispatch] = useReducer(reducer, []);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (raw) dispatch({ type: "hydrate", items: JSON.parse(raw) });
    } catch {}
  }, []);

  useEffect(() => {
    try { sessionStorage.setItem(KEY, JSON.stringify(items)); } catch {}
  }, [items]);

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const qty   = items.reduce((s, i) => s + i.quantity, 0);

  return { items, total, qty, dispatch };
}
