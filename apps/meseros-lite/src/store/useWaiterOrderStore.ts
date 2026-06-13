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

export interface PreviousTicketItem {
  id: string;
  name: string;
  quantity: number;
  total: number;
}

export interface AssignedTable {
  id: string;
  name: string;
  zone?: string;
  guests?: number;
  status: "free" | "open" | "ready" | "blocked";
  activeOrderId?: string | null;
  activeOrderItemCount?: number;
  activeOrderTotal?: number;
}

interface WaiterOrderState {
  activeTableId: string | null;
  activeTableName: string | null;
  activeOrderId: string | null;
  previousItemCount: number;
  previousTotal: number;
  previousItems: PreviousTicketItem[];
  assignedTables: AssignedTable[];
  ticketItems: LiteTicketItem[];
  lastLocalChangeAt: string | null;
  setActiveTable: (
    tableId: string | null,
    tableName?: string | null,
    order?: {
      id: string;
      itemCount?: number;
      total?: number;
      items?: PreviousTicketItem[];
    } | null,
  ) => void;
  setActiveOrder: (
    order: {
      id: string;
      itemCount?: number;
      total?: number;
      items?: PreviousTicketItem[];
    } | null,
  ) => void;
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
      activeOrderId: null,
      previousItemCount: 0,
      previousTotal: 0,
      previousItems: [],
      assignedTables: [],
      ticketItems: [],
      lastLocalChangeAt: null,
      setActiveTable: (activeTableId, activeTableName = null, order = null) =>
        set({
          activeTableId,
          activeTableName,
          activeOrderId: order?.id ?? null,
          previousItemCount: order?.itemCount ?? 0,
          previousTotal: order?.total ?? 0,
          previousItems: order?.items ?? [],
          ticketItems: [],
          lastLocalChangeAt: touchLocalChange(),
        }),
      setActiveOrder: (order) =>
        set({
          activeOrderId: order?.id ?? null,
          previousItemCount: order?.itemCount ?? 0,
          previousTotal: order?.total ?? 0,
          previousItems: order?.items ?? [],
          lastLocalChangeAt: touchLocalChange(),
        }),
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
          activeOrderId: null,
          previousItemCount: 0,
          previousTotal: 0,
          previousItems: [],
          lastLocalChangeAt: touchLocalChange(),
        }),
    }),
    {
      name: "meseros-lite-offline-ticket",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        activeTableId: state.activeTableId,
        activeTableName: state.activeTableName,
        activeOrderId: state.activeOrderId,
        previousItemCount: state.previousItemCount,
        previousTotal: state.previousTotal,
        previousItems: state.previousItems,
        assignedTables: state.assignedTables,
        ticketItems: state.ticketItems,
        lastLocalChangeAt: state.lastLocalChangeAt,
      }),
    },
  ),
);
