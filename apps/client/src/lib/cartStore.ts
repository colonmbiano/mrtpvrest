import { create } from 'zustand';

export type CartLine = {
  id: string;               // clave única de la línea (compuesta si hay variante/modificadores)
  menuItemId: string;       // id real del producto para enviar al backend
  name: string;             // nombre a mostrar (incluye variante/modificadores)
  price: number;            // precio unitario YA con variante + modificadores
  quantity: number;
  variantId?: string | null;
  modifierIds?: string[];
  note?: string;            // nota libre del cliente para la cocina (por línea)
};

export type AddInput = {
  id: string;
  name: string;
  price: number;
  menuItemId?: string;
  variantId?: string | null;
  modifierIds?: string[];
  note?: string;
  quantity?: number;
};

type CartState = {
  lines: CartLine[];
  add: (item: AddInput) => void;
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
      const qty = Math.max(1, item.quantity || 1);
      if (existing) {
        return {
          lines: state.lines.map(l =>
            l.id === item.id ? { ...l, quantity: l.quantity + qty } : l
          ),
        };
      }
      const line: CartLine = {
        id: item.id,
        menuItemId: item.menuItemId ?? item.id,
        name: item.name,
        price: item.price,
        quantity: qty,
        variantId: item.variantId ?? null,
        modifierIds: item.modifierIds ?? [],
        note: item.note,
      };
      return { lines: [...state.lines, line] };
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
