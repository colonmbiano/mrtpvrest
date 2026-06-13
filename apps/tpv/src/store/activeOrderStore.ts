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

interface ActiveOrderState {
  activeOrderId: string | null;
  activeTableId: string | null;
  activeOrderNumber: string | null;
  // Contador que se incrementa cada vez que una ronda se guarda en el backend
  // desde fuera del SidebarTicket (ej. al imprimir cuenta). El SidebarTicket lo
  // observa para recargar `previousItems` y reflejar los productos recién
  // guardados sin desincronizarse. NO se persiste (es señal efímera de sesión).
  roundsRevision: number;

  setActiveOrder: (
    orderId: string,
    tableId: string,
    orderNumber?: string | null
  ) => void;
  bumpRoundsRevision: () => void;
  clear: () => void;
}

export const useActiveOrderStore = create<ActiveOrderState>()(
  persist(
    (set) => ({
      activeOrderId: null,
      activeTableId: null,
      activeOrderNumber: null,
      roundsRevision: 0,

      setActiveOrder: (orderId, tableId, orderNumber = null) =>
        set({
          activeOrderId: orderId,
          activeTableId: tableId,
          activeOrderNumber: orderNumber,
        }),

      bumpRoundsRevision: () =>
        set((state) => ({ roundsRevision: state.roundsRevision + 1 })),

      clear: () =>
        set({
          activeOrderId: null,
          activeTableId: null,
          activeOrderNumber: null,
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
