"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import type { KitchenTicketConfig, PrinterRecord } from "@/lib/printer";

interface PrinterState {
  // Cache local de la configuracion central del TPV. Se refresca con la
  // sesion del mesero y se conserva para operar durante cortes de red.
  printers: PrinterRecord[];
  kitchenConfig: KitchenTicketConfig | null;
  // Auto-imprimir la comanda a cocina al guardar el ticket. Por dispositivo.
  autoPrint: boolean;
  lastSync: number | null;
  setPrinters: (printers: PrinterRecord[]) => void;
  setKitchenConfig: (config: KitchenTicketConfig | null) => void;
  setAutoPrint: (autoPrint: boolean) => void;
}

export const usePrinterStore = create<PrinterState>()(
  persist(
    (set) => ({
      printers: [],
      kitchenConfig: null,
      autoPrint: false,
      lastSync: null,
      setPrinters: (printers) => set({ printers, lastSync: Date.now() }),
      setKitchenConfig: (kitchenConfig) => set({ kitchenConfig }),
      setAutoPrint: (autoPrint) => set({ autoPrint }),
    }),
    {
      name: "meseros-lite-printers",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
