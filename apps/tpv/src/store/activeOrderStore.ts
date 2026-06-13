/**
 * activeOrderStore.ts
 * Almacena la orden activa que el mesero/cajero quiere "extender" desde la
 * vista de mesa o desde Tickets Abiertos. Cuando hay un activeOrderId, el
 * flujo de catálogo agrega una RONDA a esa orden (POST /api/orders/:id/items)
 * en lugar de crear una orden nueva (POST /api/orders/tpv).
 *
 * Persist en localStorage: el contexto sobrevive navegación entre pantallas
 * (ej. /pos/menu → /pos/order-type → /pos/menu). Se limpia explícitamente
 * al cobrar (clear()) o al cerrar sesión (logout borra localStorage).
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

// Acción diferida que la pantalla de inicio (OrderTypeSelector) deja agendada
// al entrar a una cuenta para que el layout del menú la ejecute al montar:
// "pay" → abre el cobro, "print" → reimprime la cuenta. Es efímera (vive solo
// en memoria, sobrevive la navegación cliente entre rutas pero no recargas).
export type PendingAction = "pay" | "print" | null;

interface ActiveOrderState {
  activeOrderId: string | null;
  activeTableId: string | null;
  activeOrderNumber: string | null;
  // Contador que se incrementa cada vez que una ronda se guarda en el backend
  // desde fuera del SidebarTicket (ej. al imprimir cuenta). El SidebarTicket lo
  // observa para recargar `previousItems` y reflejar los productos recién
  // guardados sin desincronizarse. NO se persiste (es señal efímera de sesión).
  roundsRevision: number;
  // Intención pendiente al abrir una cuenta desde la pantalla de inicio
  // (Imprimir / Cobrar). NO se persiste: se consume una sola vez en el menú.
  pendingAction: PendingAction;

  setActiveOrder: (
    orderId: string,
    tableId: string,
    orderNumber?: string | null
  ) => void;
  bumpRoundsRevision: () => void;
  setPendingAction: (action: PendingAction) => void;
  /** Lee y limpia la intención pendiente (consumo atómico, dispara una vez). */
  consumePendingAction: () => PendingAction;
  clear: () => void;
}

export const useActiveOrderStore = create<ActiveOrderState>()(
  persist(
    (set, get) => ({
      activeOrderId: null,
      activeTableId: null,
      activeOrderNumber: null,
      roundsRevision: 0,
      pendingAction: null,

      setActiveOrder: (orderId, tableId, orderNumber = null) =>
        set({
          activeOrderId: orderId,
          activeTableId: tableId,
          activeOrderNumber: orderNumber,
        }),

      bumpRoundsRevision: () =>
        set((state) => ({ roundsRevision: state.roundsRevision + 1 })),

      setPendingAction: (action) => set({ pendingAction: action }),

      consumePendingAction: () => {
        const action = get().pendingAction;
        if (action) set({ pendingAction: null });
        return action;
      },

      clear: () =>
        set({
          activeOrderId: null,
          activeTableId: null,
          activeOrderNumber: null,
          pendingAction: null,
        }),
    }),
    {
      name: "tpv-active-order",
      // roundsRevision queda fuera de la persistencia: es una señal de refresco
      // en memoria, no contexto que deba sobrevivir recargas.
      partialize: (state) => ({
        activeOrderId: state.activeOrderId,
        activeTableId: state.activeTableId,
        activeOrderNumber: state.activeOrderNumber,
      }),
      storage: createJSONStorage(() =>
        typeof window === "undefined"
          ? (undefined as any)
          : window.localStorage,
      ),
    },
  ),
);
