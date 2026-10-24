import { create } from 'zustand';
import { bindCartToStore } from './cartScope';

export type CartLine = {
  id: string;               // clave única de la línea (compuesta si hay variante/modificadores)
  menuItemId: string;       // id real del producto para enviar al backend
  name: string;             // nombre a mostrar (incluye variante/modificadores)
  price: number;            // precio unitario YA con variante + modificadores
  quantity: number;
  variantId?: string | null;
  modifierIds?: string[];
  note?: string;            // nota libre del cliente para la cocina (por línea)
  comboSelections?: { componentId: string; optionId: string }[];
};

export type AddInput = {
  id: string;
  name: string;
  price: number;
  menuItemId?: string;
  variantId?: string | null;
  modifierIds?: string[];
  note?: string;
  comboSelections?: { componentId: string; optionId: string }[];
  quantity?: number;
};

type CartState = {
  // Tienda a la que pertenece el carrito. Lo fija la página de la tienda (bindStore).
  storeSlug: string | null;
  lines: CartLine[];
  // Vincula el carrito a una tienda. Si era de OTRA tienda, descarta sus líneas.
  bindStore: (slug: string) => void;
  add: (item: AddInput) => void;
  remove: (id: string) => void;
  setNote: (id: string, note: string) => void;
  clear: () => void;
  total: () => number;
  quantity: () => number;
};

export const useCart = create<CartState>((set, get) => ({
  storeSlug: null,
  lines: [],
  bindStore: slug =>
    set(state => {
      const decision = bindCartToStore(state.storeSlug, slug);
      if (state.storeSlug === decision.storeSlug) return state;
      return decision.clearLines ? { storeSlug: decision.storeSlug, lines: [] } : { storeSlug: decision.storeSlug };
    }),
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
        comboSelections: item.comboSelections,
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
  setNote: (id, note) =>
    set(state => ({
      lines: state.lines.map(l => (l.id === id ? { ...l, note: note || undefined } : l)),
    })),
  clear: () => set({ lines: [] }),
  total: () => get().lines.reduce((s, l) => s + l.price * l.quantity, 0),
  quantity: () => get().lines.reduce((s, l) => s + l.quantity, 0),
}));
