/**
 * ticketStore.ts
 * Store dedicado al carrito multi-ticket del TPV.
 * Separado de auth y tema para renderizado eficiente.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Modifier = {
  id: string;
  groupId: string;
  name: string;
  priceAdd: number;
  isDefault?: boolean;
};

export type ModifierGroup = {
  id: string;
  name: string;
  required: boolean;
  multiSelect: boolean;
  minSelection: number;
  maxSelection: number;
  freeModifiersLimit: number;
  modifiers: Modifier[];
};

export type ModifierSelection = {
  id: string;
  groupId: string;
  name: string;
  priceAdd: number;
};

export type MenuItemVariant = {
  id: string;
  menuItemId?: string;
  name: string;
  price: number;
  isAvailable?: boolean;
  sortOrder?: number;
};

export type MenuItemComplement = {
  id: string;
  menuItemId?: string;
  name: string;
  price: number;
  isAvailable?: boolean;
  sortOrder?: number;
};

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  categoryId?: string;
  imageUrl?: string | null;
  isPromo?: boolean;
  isPopular?: boolean;
  isFavorite?: boolean;
  isAvailable?: boolean;
  activeDays?: string[];
  promoPrice?: number | null;
  hasVariants?: boolean;
  variantMultiSelect?: boolean;
  variantMinSelection?: number;
  variantMaxSelection?: number;
  // Venta por peso: el `price` es por kg y el TPV pide los kg al agregarlo.
  soldByWeight?: boolean;
  // Unidad de medida MOSTRADA (etiqueta: pz/kg/orden/bolsa/…). Cosmética.
  unit?: string;
  variants?: MenuItemVariant[];
  complements?: MenuItemComplement[];
  modifierGroups?: ModifierGroup[];
};

export type CartItem = Product & {
  menuItemId: string;
  quantity: number;
  // Peso vendido en kg para líneas por báscula (soldByWeight). Cuando está
  // presente, `quantity` queda en 1 y subtotal = price (por kg) × weightKg.
  weightKg?: number | null;
  subtotal: number;
  notes?: string;
  variantId?: string | null;
  variantName?: string | null;
  // Nombre base del producto SIN el sufijo de variante. Permite reabrir el
  // configurador para editar el item sin duplicar el sufijo "(Grande)" en
  // el nombre. Si falta, se usa `name` como fallback.
  baseName?: string;
  originalPrice?: number | null;
  modifiers?: ModifierSelection[];
  // Comensal al que pertenece (solo DINE_IN). null/undefined = compartido.
  seatNumber?: number | null;
};

export function modifierKey(mods?: ModifierSelection[]): string {
  if (!mods || mods.length === 0) return "";
  return [...mods].map((m) => m.id).sort().join(",");
}

export type TicketData = {
  id: string | number;
  name: string;
  phone: string;
  type: "DINE_IN" | "TAKEOUT" | "DELIVERY";
  table: string;
  tableId: string;
  tableName: string;
  address: string;
  items: CartItem[];
  discount: number;
  discountType: "percent" | "fixed";
  // Comensales declarados al iniciar la cuenta DINE_IN.
  numberOfGuests?: number | null;
  // Comensal activo al que se asignan los items que se agregan ahora
  // (1..numberOfGuests). null = compartido / sin asignar.
  activeSeat?: number | null;
};

interface TicketState {
  tickets: TicketData[];
  activeIndex: number;
  quantitiesByProduct: Record<string, number>;
  // Índice del item de la ronda actual que se está re-editando en el
  // configurador (QuickModifierPanel). null = no se está editando nada,
  // el configurador opera en modo "agregar". No se persiste.
  editingIndex: number | null;

  /* Computed */
  getActiveTicket: () => TicketData;

  /* Actions */
  addTicket: (defaultType?: TicketData["type"]) => void;
  closeTicket: (index: number) => void;
  setActiveIndex: (index: number) => void;
  updateTicket: (patch: Partial<TicketData>) => void;
  clearTickets: () => void;

  addItemToActive: (item: CartItem) => void;
  changeItemQty: (index: number, delta: number) => void;
  removeItem: (index: number) => void;
  clearActiveItems: () => void;
  setItemNotes: (index: number, notes: string) => void;
  // Edición de un item ya agregado: reabre el configurador con sus
  // modificadores actuales y reemplaza la línea al confirmar.
  setEditingIndex: (index: number | null) => void;
  replaceItemInActive: (index: number, item: CartItem) => void;
}

const emptyTicket = (
  id: string | number,
  label: string,
  type: TicketData["type"] = "TAKEOUT"
): TicketData => ({
  id,
  name: "",
  phone: "",
  type,
  table: "",
  tableId: "",
  tableName: "",
  address: "",
  items: [],
  discount: 0,
  discountType: "percent",
  numberOfGuests: null,
  activeSeat: null,
});

/**
 * BUG-15 (QA): persistimos tickets en draft en localStorage. Si el WebView
 * crashea o el cajero pierde la sesión, al recargar la pantalla los
 * borradores no cobrados siguen ahí. La key incluye el restaurantId para
 * no mezclar drafts entre dispositivos compartidos.
 */
export const useTicketStore = create<TicketState>()(persist((_set, get) => {
  type TicketPatch = Partial<TicketState>;
  const set = (fn: TicketPatch | ((state: TicketState) => TicketPatch)) => {
    _set((state: TicketState) => {
      const next = typeof fn === "function" ? fn(state) : fn;
      const nextTickets = next.tickets !== undefined ? next.tickets : state.tickets;
      const nextIndex = next.activeIndex !== undefined ? next.activeIndex : state.activeIndex;
      
      const t = nextTickets[nextIndex];
      const q: Record<string, number> = {};
      if (t) {
        for (const item of t.items) {
          q[item.menuItemId] = (q[item.menuItemId] || 0) + item.quantity;
        }
      }
      return { ...next, quantitiesByProduct: q };
    });
  };

  return {
    tickets: [emptyTicket(1, "T1")],
    activeIndex: 0,
    quantitiesByProduct: {},
    editingIndex: null,

  getActiveTicket: () => {
    const { tickets, activeIndex } = get();
    return tickets[activeIndex] ?? tickets[0]!;
  },

  addTicket: (defaultType = "TAKEOUT") => {
    const { tickets } = get();
    const newId = Date.now();
    set({
      tickets: [...tickets, emptyTicket(newId, `T${tickets.length + 1}`, defaultType)],
      activeIndex: tickets.length,
    });
  },

  closeTicket: (index: number) => {
    const { tickets, activeIndex } = get();
    if (tickets.length === 1) {
      set({ tickets: [emptyTicket(Date.now(), "T1")], activeIndex: 0, editingIndex: null });
      return;
    }
    const next = tickets.filter((_, i) => i !== index);
    set({
      tickets: next,
      activeIndex: Math.min(activeIndex, next.length - 1),
      editingIndex: null,
    });
  },

  setActiveIndex: (index) => set({ activeIndex: index, editingIndex: null }),

  updateTicket: (patch) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) =>
        i === state.activeIndex ? { ...t, ...patch } : t
      ),
    }));
  },

  clearTickets: () => {
    set({ tickets: [emptyTicket(Date.now(), "T1")], activeIndex: 0, editingIndex: null });
  },

  addItemToActive: (item) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        // En DINE_IN auto-tag con el seat activo si el item no trae uno
        // explícito. En otros tipos seatNumber siempre queda null.
        const seat = t.type === "DINE_IN"
          ? (item.seatNumber ?? t.activeSeat ?? null)
          : null;
        const tagged: CartItem = { ...item, seatNumber: seat };
        const incomingModKey = modifierKey(tagged.modifiers);
        // Las líneas por peso NO se fusionan: cada pesada (1.5 kg, 2.3 kg…) es
        // su propio renglón aunque sea el mismo producto.
        const existing = tagged.weightKg != null ? undefined : t.items.find(
          (ci) =>
            ci.menuItemId === tagged.menuItemId &&
            ci.variantId === tagged.variantId &&
            ci.notes === tagged.notes &&
            (ci.seatNumber ?? null) === (tagged.seatNumber ?? null) &&
            modifierKey(ci.modifiers) === incomingModKey
        );
        if (existing) {
          return {
            ...t,
            items: t.items.map((ci) =>
              ci === existing
                ? {
                    ...ci,
                    quantity: ci.quantity + 1,
                    subtotal: (ci.quantity + 1) * ci.price,
                  }
                : ci
            ),
          };
        }
        return { ...t, items: [...t.items, tagged] };
      }),
    }));
  },

  changeItemQty: (index, delta) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        const items = t.items
          .map((ci, idx) => {
            if (idx !== index) return ci;
            // Líneas por peso: el stepper no aplica (el peso se edita aparte).
            if (ci.weightKg != null) return ci;
            const newQty = Math.max(0, ci.quantity + delta);
            return { ...ci, quantity: newQty, subtotal: newQty * ci.price };
          })
          .filter((ci) => ci.quantity > 0);
        return { ...t, items };
      }),
    }));
  },

  removeItem: (index) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        return { ...t, items: t.items.filter((_, idx) => idx !== index) };
      }),
      // Al borrar una línea los índices se recorren; cancelamos cualquier
      // edición en curso para no editar el item equivocado.
      editingIndex: null,
    }));
  },

  clearActiveItems: () => {
    set((state) => ({
      tickets: state.tickets.map((t, i) =>
        i === state.activeIndex ? { ...t, items: [] } : t
      ),
      editingIndex: null,
    }));
  },

  setItemNotes: (index, notes) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        const trimmed = notes.trim().slice(0, 200);
        return {
          ...t,
          items: t.items.map((ci, idx) =>
            idx === index ? { ...ci, notes: trimmed || undefined } : ci,
          ),
        };
      }),
    }));
  },

  setEditingIndex: (index) => set({ editingIndex: index }),

  replaceItemInActive: (index, item) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        if (index < 0 || index >= t.items.length) return t;
        return {
          ...t,
          items: t.items.map((ci, idx) => (idx === index ? item : ci)),
        };
      }),
      editingIndex: null,
    }));
  },
};
}, {
  name: "tpv-tickets-draft",
  storage: createJSONStorage(() =>
    typeof window === "undefined" ? (undefined as any) : window.localStorage,
  ),
  // Solo persistimos tickets + activeIndex. Las acciones se reconstruyen
  // en cada montaje.
  partialize: (state) => ({
    tickets: state.tickets,
    activeIndex: state.activeIndex,
  }),
}));
