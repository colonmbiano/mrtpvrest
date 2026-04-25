import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Product = {
  id: string;
  name: string;
  price: number;
  category: string;
  isPromo?: boolean;
};

export type CartItem = Product & {
  quantity: number;
  notes?: string;
};

export type Ticket = {
  id: string;
  name: string;
  items: CartItem[];
};

interface POSState {
  // Theme
  theme: string;
  setTheme: (theme: string) => void;

  // Auth / Turno
  isAuthenticated: boolean;
  shiftOpen: boolean;
  login: (pin: string) => boolean;
  logout: () => void;
  openShift: () => void;
  closeShift: () => void;

  // Multi-Ticket
  tickets: Ticket[];
  activeTicketId: string;
  addTicket: () => void;
  removeTicket: (id: string) => void;
  setActiveTicket: (id: string) => void;

  // Cart
  addItemToActiveTicket: (product: Product) => void;
  updateItemQuantity: (productId: string, delta: number) => void;
  removeItem: (productId: string) => void;
  clearActiveTicket: () => void;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      theme: 'concepto-2',
      setTheme: (theme) => {
        set({ theme });
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', theme);
        }
      },

      isAuthenticated: false,
      shiftOpen: false,
      login: (pin) => {
        if (pin === '1234') {
          set({ isAuthenticated: true });
          return true;
        }
        return false;
      },
      logout: () => set({ isAuthenticated: false, shiftOpen: false }),
      openShift: () => set({ shiftOpen: true }),
      closeShift: () => set({ shiftOpen: false }),

      tickets: [{ id: '1', name: 'Ticket 1', items: [] }],
      activeTicketId: '1',

      addTicket: () => {
        const newId = generateId();
        const tickets = get().tickets;
        const newName = `Ticket ${tickets.length + 1}`;
        set({
          tickets: [...tickets, { id: newId, name: newName, items: [] }],
          activeTicketId: newId,
        });
      },
      removeTicket: (id) => {
        const { tickets, activeTicketId } = get();
        if (tickets.length === 1) {
          set({ tickets: [{ id: '1', name: 'Ticket 1', items: [] }], activeTicketId: '1' });
          return;
        }
        const newTickets = tickets.filter(t => t.id !== id);
        set({
          tickets: newTickets,
          activeTicketId: activeTicketId === id ? newTickets[newTickets.length - 1].id : activeTicketId
        });
      },
      setActiveTicket: (id) => set({ activeTicketId: id }),

      addItemToActiveTicket: (product) => {
        set((state) => {
          const tickets = state.tickets.map(t => {
            if (t.id !== state.activeTicketId) return t;
            const existingItem = t.items.find(i => i.id === product.id);
            if (existingItem) {
              return {
                ...t,
                items: t.items.map(i => i.id === product.id ? { ...i, quantity: i.quantity + 1 } : i)
              };
            }
            return { ...t, items: [...t.items, { ...product, quantity: 1 }] };
          });
          return { tickets };
        });
      },

      updateItemQuantity: (productId, delta) => {
        set((state) => {
          const tickets = state.tickets.map(t => {
            if (t.id !== state.activeTicketId) return t;
            return {
              ...t,
              items: t.items.map(i => {
                if (i.id === productId) {
                  const newQ = Math.max(0, i.quantity + delta);
                  return { ...i, quantity: newQ };
                }
                return i;
              }).filter(i => i.quantity > 0)
            };
          });
          return { tickets };
        });
      },

      removeItem: (productId) => {
        set((state) => {
          const tickets = state.tickets.map(t => {
            if (t.id !== state.activeTicketId) return t;
            return { ...t, items: t.items.filter(i => i.id !== productId) };
          });
          return { tickets };
        });
      },

      clearActiveTicket: () => {
        set((state) => {
          const tickets = state.tickets.map(t => {
            if (t.id !== state.activeTicketId) return t;
            return { ...t, items: [] };
          });
          return { tickets };
        });
      }
    }),
    {
      name: 'pos-store',
    }
  )
);
