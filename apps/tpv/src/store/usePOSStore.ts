/**
 * usePOSStore.ts
 * ⚠️  ESTE ARCHIVO ES AHORA UN BARREL DE COMPATIBILIDAD.
 * El estado monolítico fue dividido en:
 *   - src/store/themeStore.ts  → tema visual
 *   - src/store/authStore.ts   → autenticación de empleados
 *   - src/store/ticketStore.ts → carrito multi-ticket
 *
 * Los imports existentes desde "@/store/usePOSStore" siguen funcionando
 * gracias a los re-exports de abajo.
 */

import { useThemeStore } from "@/store/themeStore";
import { useAuthStore } from "@/store/authStore";
import { useTicketStore } from "@/store/ticketStore";

// ── Re-exports de los stores especializados ──────────────────────────
export { useThemeStore } from "@/store/themeStore";
export type { Palette, Mode } from "@/store/themeStore";

export { useAuthStore } from "@/store/authStore";
export type { AuthEmployee, EmployeeRole } from "@/store/authStore";

export { useTicketStore } from "@/store/ticketStore";
export type { Product, CartItem, TicketData } from "@/store/ticketStore";

// ── Tipos de compatibilidad ───────────────────────────────────────────
type LegacyTicket = {
  id: string | number;
  name: string;
  items: import("@/store/ticketStore").CartItem[];
};

type CombinedLegacyState = {
  _hasHydrated: boolean;
  palette: import("@/store/themeStore").Palette;
  mode: import("@/store/themeStore").Mode;
  themeChosen: boolean;
  theme: string;
  setPalette: (p: import("@/store/themeStore").Palette) => void;
  setMode: (m: import("@/store/themeStore").Mode) => void;
  toggleMode: () => void;
  setThemeChosen: (c: boolean) => void;
  setTheme: (t: string) => void;
  isAuthenticated: boolean;
  shiftOpen: boolean;
  login: (pin: string) => Promise<boolean>;
  logout: () => void;
  openShift: () => void;
  closeShift: () => void;
  tickets: LegacyTicket[];
  activeTicketId: string;
  addTicket: () => void;
  removeTicket: (id: string | number) => void;
  setActiveTicket: (id: string | number) => void;
  addItemToActiveTicket: (p: unknown) => void;
  updateItemQuantity: (id: string, delta: number) => void;
  removeItem: (idx: number) => void;
  clearActiveTicket: () => void;
};

/**
 * @deprecated Usa useThemeStore, useAuthStore o useTicketStore directamente.
 * Este shim mantiene compatibilidad con código legacy que importa usePOSStore.
 */
export function usePOSStore<T = CombinedLegacyState>(
  selector?: (state: CombinedLegacyState) => T
): T {
  const theme  = useThemeStore();
  const auth   = useAuthStore();
  const ticket = useTicketStore();

  const combined: CombinedLegacyState = {
    // ── Theme ────────────────────────────────────────────────────────
    _hasHydrated:    true,
    palette:         theme.palette,
    mode:            theme.mode,
    themeChosen:     theme.themeChosen,
    theme:           theme.theme,
    setPalette:      theme.setPalette,
    setMode:         theme.setMode,
    toggleMode:      theme.toggleMode,
    setThemeChosen:  theme.setThemeChosen,
    setTheme:        theme.setTheme,

    // ── Auth shim ────────────────────────────────────────────────────
    isAuthenticated: auth.isAuthenticated,
    shiftOpen:       !!auth.activeShift,
    login:           async (pin: string) => {
      const res = await auth.loginWithPin(pin);
      return res.success;
    },
    logout:          auth.logout,
    openShift:       () => {},
    closeShift:      () => auth.setActiveShift(null),

    // ── Tickets shim ─────────────────────────────────────────────────
    tickets:              ticket.tickets as LegacyTicket[],
    activeTicketId:       String(ticket.tickets[ticket.activeIndex]?.id ?? "1"),
    addTicket:            ticket.addTicket,
    removeTicket:         () => ticket.closeTicket(ticket.activeIndex),
    setActiveTicket:      () => {},
    addItemToActiveTicket:() => {},
    updateItemQuantity:   (id: string, delta: number) => {
      const t = ticket.getActiveTicket();
      const idx = t.items.findIndex(i => i.id === id);
      if (idx !== -1) ticket.changeItemQty(idx, delta);
    },
    removeItem:           ticket.removeItem,
    clearActiveTicket:    ticket.clearActiveItems,
  };

  return selector ? selector(combined) : (combined as unknown as T);
}
