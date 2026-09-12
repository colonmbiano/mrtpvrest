import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { TokkiPaymentMethod } from "../components/PaymentModal";

export type CatalogDensity = "comfortable" | "compact";

interface TokkiSettings {
  taxEnabled: boolean;
  taxRate: number;
  paymentMethods: TokkiPaymentMethod[];
  autoPrintReceipt: boolean;
  receiptCopies: 1 | 2;
  soundEnabled: boolean;
  density: CatalogDensity;
  setTaxEnabled: (value: boolean) => void;
  setTaxRate: (value: number) => void;
  togglePaymentMethod: (value: TokkiPaymentMethod) => void;
  setAutoPrintReceipt: (value: boolean) => void;
  setReceiptCopies: (value: 1 | 2) => void;
  setSoundEnabled: (value: boolean) => void;
  setDensity: (value: CatalogDensity) => void;
}

export const useSettingsStore = create<TokkiSettings>()(
  persist(
    (set) => ({
      taxEnabled: true,
      taxRate: 16,
      paymentMethods: ["CASH", "CARD_PRESENT", "TRANSFER"],
      autoPrintReceipt: true,
      receiptCopies: 1,
      soundEnabled: true,
      density: "comfortable",
      setTaxEnabled: (taxEnabled) => set({ taxEnabled }),
      setTaxRate: (taxRate) => set({ taxRate: Math.min(30, Math.max(0, taxRate)) }),
      togglePaymentMethod: (method) => set((state) => {
        const active = state.paymentMethods.includes(method);
        if (active && state.paymentMethods.length === 1) return state;
        return { paymentMethods: active ? state.paymentMethods.filter((item) => item !== method) : [...state.paymentMethods, method] };
      }),
      setAutoPrintReceipt: (autoPrintReceipt) => set({ autoPrintReceipt }),
      setReceiptCopies: (receiptCopies) => set({ receiptCopies }),
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      setDensity: (density) => set({ density }),
    }),
    { name: "tokki-settings" },
  ),
);
