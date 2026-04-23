import { create } from 'zustand';

export type CartLine = {
  id: string;
  name: string;
  price: number;
  quantity: number;
};

type CartState = {
  lines: CartLine[];
  add: (item: { id: string; name: string; price: number }) => void;
  remove: (id: string) => void;
  clear: () => void;
  total: () => number;
  quantity: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  add: item =>
    set(state => {
      const existing = state.lines.find(l => l.id === item.id);
      if (existing) {
        return {
          lines: state.lines.map(l =>
            l.id === item.id ? { ...l, quantity: l.quantity + 1 } : l
          ),
        };
      }
      return { lines: [...state.lines, { ...item, quantity: 1 }] };
    }),
  remove: id =>
    set(state => {
      const existing = state.lines.find(l => l.id === id);
      if (!existing) return state;
      if (existing.quantity > 1) {
        return {
          lines: state.lines.map(l =>
            l.id === id ? { ...l, quantity: l.quantity - 1 } : l
          ),
        };
      }
      return { lines: state.lines.filter(l => l.id !== id) };
    }),
  clear: () => set({ lines: [] }),
  total: () => get().lines.reduce((s, l) => s + l.price * l.quantity, 0),
  quantity: () => get().lines.reduce((s, l) => s + l.quantity, 0),
}));
