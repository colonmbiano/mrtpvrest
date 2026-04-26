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

export type Palette = 'green' | 'purple' | 'orange';
export type Mode = 'dark' | 'light';

interface POSState {
  // Hydration flag (persist rehydrate completion)
  _hasHydrated: boolean;

  // Theming (new API)
  palette: Palette;
  mode: Mode;
  themeChosen: boolean;
  setPalette: (p: Palette) => void;
  setMode: (m: Mode) => void;
  toggleMode: () => void;
  setThemeChosen: (chosen: boolean) => void;

  // Theming (legacy API — kept as shim for old pickers)
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

const applyDocAttrs = (palette: Palette, mode: Mode) => {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-theme', palette);
  document.documentElement.setAttribute('data-mode', mode);
};

// Legacy theme-id → { palette, mode } for the old picker
const LEGACY_THEME_MAP: Record<string, { palette: Palette; mode: Mode }> = {
  'dark':       { palette: 'green',  mode: 'dark'  },
  'light':      { palette: 'green',  mode: 'light' },
  'green':      { palette: 'green',  mode: 'dark'  },
  'purple':     { palette: 'purple', mode: 'dark'  },
  'orange':     { palette: 'orange', mode: 'dark'  },
  'concepto-1': { palette: 'green',  mode: 'dark'  },
  'concepto-2': { palette: 'purple', mode: 'dark'  },
  'concepto-3': { palette: 'green',  mode: 'light' },
  'naranja':    { palette: 'orange', mode: 'light' },
  'amarillo':   { palette: 'orange', mode: 'light' },
};

export const usePOSStore = create<POSState>()(
  persist(
    (set, get) => ({
      _hasHydrated: false,

      // Theming
      palette: 'green',
      mode: 'dark',
      themeChosen: false,
      theme: 'green',

      setPalette: (palette) => {
        set({ palette, theme: palette });
        applyDocAttrs(palette, get().mode);
      },
      setMode: (mode) => {
        set({ mode });
        applyDocAttrs(get().palette, mode);
      },
      toggleMode: () => {
        const next: Mode = get().mode === 'dark' ? 'light' : 'dark';
        set({ mode: next });
        applyDocAttrs(get().palette, next);
      },
      setThemeChosen: (chosen) => set({ themeChosen: chosen }),
      setTheme: (theme) => {
        const target = LEGACY_THEME_MAP[theme] ?? { palette: 'green' as Palette, mode: 'dark' as Mode };
        set({ palette: target.palette, mode: target.mode, theme });
        applyDocAttrs(target.palette, target.mode);
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
      onRehydrateStorage: () => (state) => {
        if (state) {
          applyDocAttrs(state.palette, state.mode);
          state._hasHydrated = true;
        }
      },
    }
  )
);
