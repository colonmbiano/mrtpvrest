/**
 * activeOrderStore.ts
 * Almacena la orden activa que el mesero/cajero quiere "extender" desde la
 * vista de mesa o desde Tickets Abiertos. Cuando hay un activeOrderId, el
 * flujo de catálogo agrega una RONDA a esa orden (POST /api/orders/:id/items)
 * en lugar de crear una orden nueva (POST /api/orders/tpv).
 *
 * Sin persist: el contexto se pierde si el usuario cierra la app a propósito,
 * lo cual es lo deseado — no queremos quedarnos pegados a una orden vieja.
 */
import { create } from "zustand";

interface ActiveOrderState {
  activeOrderId: string | null;
  activeTableId: string | null;
  activeOrderNumber: string | null;

  setActiveOrder: (
    orderId: string,
    tableId: string,
    orderNumber?: string | null
  ) => void;
  clear: () => void;
}

export const useActiveOrderStore = create<ActiveOrderState>((set) => ({
  activeOrderId: null,
  activeTableId: null,
  activeOrderNumber: null,

  setActiveOrder: (orderId, tableId, orderNumber = null) =>
    set({
      activeOrderId: orderId,
      activeTableId: tableId,
      activeOrderNumber: orderNumber,
    }),

  clear: () =>
    set({
      activeOrderId: null,
      activeTableId: null,
      activeOrderNumber: null,
    }),
}));
