"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface LiteModifierSelection {
  id: string;
  name: string;
  priceAdd: number;
  kind?: "modifier" | "complement";
}

export interface LiteTicketItem {
  lineId: string;
  menuItemId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  total: number;
  variantId?: string | null;
  variantIds?: string[];
  variantName?: string | null;
  notes?: string;
  modifiers: LiteModifierSelection[];
}

export interface AssignedTable {
  id: string;
  name: string;
  zone?: string;
  guests?: number;
  status: "free" | "open" | "ready" | "blocked";
  activeOrderId?: string | null;
}

interface WaiterOrderState {
  activeTableId: string | null;
  activeTableName: string | null;
  assignedTables: AssignedTable[];
  ticketItems: LiteTicketItem[];
  lastLocalChangeAt: string | null;
  setActiveTable: (tableId: string | null, tableName?: string | null) => void;
  setAssignedTables: (tables: AssignedTable[]) => void;
  addItem: (item: Omit<LiteTicketItem, "lineId" | "total">) => void;
  incrementItem: (lineId: string) => void;
  decrementItem: (lineId: string) => void;
  clearTicket: () => void;
}

const touchLocalChange = () => new Date().toISOString();
const makeLineId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const useWaiterOrderStore = create<WaiterOrderState>()(
  persist(
    (set) => ({
      activeTableId: null,
      activeTableName: null,
      assignedTables: [],
      ticketItems: [],
      lastLocalChangeAt: null,
      setActiveTable: (activeTableId, activeTableName = null) =>
        set({ activeTableId, activeTableName, lastLocalChangeAt: touchLocalChange() }),
      setAssignedTables: (assignedTables) =>
        set({ assignedTables, lastLocalChangeAt: touchLocalChange() }),
      addItem: (item) =>
        set((state) => ({
          ticketItems: [
            ...state.ticketItems,
            {
              ...item,
              lineId: makeLineId(),
              total: item.unitPrice * item.quantity,
            },
          ],
          lastLocalChangeAt: touchLocalChange(),
        })),
      incrementItem: (lineId) =>
        set((state) => ({
          ticketItems: state.ticketItems.map((item) =>
            item.lineId === lineId
              ? {
                  ...item,
                  quantity: item.quantity + 1,
                  total: item.unitPrice * (item.quantity + 1),
                }
              : item,
          ),
          lastLocalChangeAt: touchLocalChange(),
        })),
      decrementItem: (lineId) =>
        set((state) => ({
          ticketItems: state.ticketItems
            .map((item) =>
              item.lineId === lineId
                ? {
                    ...item,
                    quantity: item.quantity - 1,
                    total: item.unitPrice * (item.quantity - 1),
                  }
                : item,
            )
            .filter((item) => item.quantity > 0),
          lastLocalChangeAt: touchLocalChange(),
        })),
      clearTicket: () =>
        set({
          ticketItems: [],
          activeTableId: null,
          activeTableName: null,
          lastLocalChangeAt: touchLocalChange(),
        }),
    }),
    {
      name: "meseros-lite-offline-ticket",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTableId: state.activeTableId,
        activeTableName: state.activeTableName,
        assignedTables: state.assignedTables,
        ticketItems: state.ticketItems,
        lastLocalChangeAt: state.lastLocalChangeAt,
      }),
    },
  ),
);
