/**
 * ticketStore.ts
 * Store dedicado al carrito multi-ticket del TPV.
 * Separado de auth y tema para renderizado eficiente.
 */
import { create } from "zustand";

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  isPromo?: boolean;
  promoPrice?: number | null;
};

export type CartItem = Product & {
  menuItemId: string;
  quantity: number;
  subtotal: number;
  notes?: string;
  variantId?: string | null;
  variantName?: string | null;
  originalPrice?: number | null;
  mods?: unknown[];
};

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
};

interface TicketState {
  tickets: TicketData[];
  activeIndex: number;

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
});

export const useTicketStore = create<TicketState>()((set, get) => ({
  tickets: [emptyTicket(1, "T1")],
  activeIndex: 0,

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
      set({ tickets: [emptyTicket(Date.now(), "T1")], activeIndex: 0 });
      return;
    }
    const next = tickets.filter((_, i) => i !== index);
    set({
      tickets: next,
      activeIndex: Math.min(activeIndex, next.length - 1),
    });
  },

  setActiveIndex: (index) => set({ activeIndex: index }),

  updateTicket: (patch) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) =>
        i === state.activeIndex ? { ...t, ...patch } : t
      ),
    }));
  },

  clearTickets: () => {
    set({ tickets: [emptyTicket(Date.now(), "T1")], activeIndex: 0 });
  },

  addItemToActive: (item) => {
    set((state) => ({
      tickets: state.tickets.map((t, i) => {
        if (i !== state.activeIndex) return t;
        const existing = t.items.find(
          (ci) =>
            ci.menuItemId === item.menuItemId &&
            ci.variantId === item.variantId &&
            ci.notes === item.notes
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
        return { ...t, items: [...t.items, item] };
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
    }));
  },

  clearActiveItems: () => {
    set((state) => ({
      tickets: state.tickets.map((t, i) =>
        i === state.activeIndex ? { ...t, items: [] } : t
      ),
    }));
  },
}));
