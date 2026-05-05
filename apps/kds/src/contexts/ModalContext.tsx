"use client";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import type { ConfirmConfig } from "@/components/modals/ConfirmModal";
import type { ChangeOrderTypePayload } from "@/components/modals/ChangeOrderTypeModal";

/* ── Domain payloads ─────────────────────────────────────────── */

export type PaymentOrder = {
  id: string;
  total: number;
  items: Array<{ id: string; name: string; quantity: number; price: number }>;
  customerName?: string;
  table?: string | null;
};

export type ProductDraft = {
  id?: string;
  name: string;
  price: number;
  category?: string;
  imageUrl?: string | null;
  description?: string;
};

export type CategoryDraft = {
  id?: string;
  name: string;
  color?: string;
  icon?: string;
};

export type EmployeeDraft = {
  id?: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "WAITER" | "CASHIER" | "DRIVER";
  pin?: string;
  active?: boolean;
};

export type ShiftEmployee = {
  id: string;
  name: string;
  role: string;
};

export type ShortageProduct = {
  id: string;
  name: string;
  missingIngredients: Array<{ id: string; name: string; required: number; available: number; unit?: string }>;
};

export type DeliveryOrder = {
  id: string;
  customerName: string;
  address: string;
  total: number;
  phone?: string;
};

/* ── Internal state ──────────────────────────────────────────── */

type ModalState = {
  payment:          PaymentOrder | null;
  orderDetail:      string | null;
  product:          ProductDraft | null | "new";
  category:         CategoryDraft | null | "new";
  employee:         EmployeeDraft | null | "new";
  report:           boolean;
  discount:         { orderId: string; total: number } | null;
  shift:            ShiftEmployee | null;
  tpvConfig:        boolean;
  shortage:         ShortageProduct | null;
  deliveryAssign:   DeliveryOrder | null;
  changeOrderType:  ChangeOrderTypePayload | null;
  confirm:          ConfirmConfig | null;
};

const INITIAL: ModalState = {
  payment: null,
  orderDetail: null,
  product: null,
  category: null,
  employee: null,
  report: false,
  discount: null,
  shift: null,
  tpvConfig: false,
  shortage: null,
  deliveryAssign: null,
  changeOrderType: null,
  confirm: null,
};

type ModalContextValue = ModalState & {
  // Openers
  openPayment:        (order: PaymentOrder) => void;
  openOrderDetail:    (orderId: string) => void;
  openProduct:        (product?: ProductDraft | null) => void;
  openCategory:       (category?: CategoryDraft | null) => void;
  openEmployee:       (employee?: EmployeeDraft | null) => void;
  openReport:         () => void;
  openDiscount:       (orderId: string, total: number) => void;
  openShift:          (employee: ShiftEmployee) => void;
  openTpvConfig:      () => void;
  openShortage:       (product: ShortageProduct) => void;
  openDeliveryAssign: (order: DeliveryOrder) => void;
  openChangeOrderType: (payload: ChangeOrderTypePayload) => void;
  openConfirm:        (config: ConfirmConfig) => void;

  // Closers
  closePayment:        () => void;
  closeOrderDetail:    () => void;
  closeProduct:        () => void;
  closeCategory:       () => void;
  closeEmployee:       () => void;
  closeReport:         () => void;
  closeDiscount:       () => void;
  closeShift:          () => void;
  closeTpvConfig:      () => void;
  closeShortage:       () => void;
  closeDeliveryAssign:  () => void;
  closeChangeOrderType: () => void;
  closeConfirm:         () => void;
  closeAll:             () => void;
};

const ModalContext = createContext<ModalContextValue | null>(null);

export function ModalProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ModalState>(INITIAL);

  const patch = useCallback(<K extends keyof ModalState>(key: K, value: ModalState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
  }, []);

  const value = useMemo<ModalContextValue>(() => ({
    ...state,

    openPayment:        (order) => patch("payment", order),
    openOrderDetail:    (orderId) => patch("orderDetail", orderId),
    openProduct:        (product) => patch("product", product ?? "new"),
    openCategory:       (category) => patch("category", category ?? "new"),
    openEmployee:       (employee) => patch("employee", employee ?? "new"),
    openReport:         () => patch("report", true),
    openDiscount:       (orderId, total) => patch("discount", { orderId, total }),
    openShift:          (employee) => patch("shift", employee),
    openTpvConfig:      () => patch("tpvConfig", true),
    openShortage:       (product) => patch("shortage", product),
    openDeliveryAssign:  (order) => patch("deliveryAssign", order),
    openChangeOrderType: (payload) => patch("changeOrderType", payload),
    openConfirm:         (config) => patch("confirm", config),

    closePayment:        () => patch("payment", null),
    closeOrderDetail:    () => patch("orderDetail", null),
    closeProduct:        () => patch("product", null),
    closeCategory:       () => patch("category", null),
    closeEmployee:       () => patch("employee", null),
    closeReport:         () => patch("report", false),
    closeDiscount:       () => patch("discount", null),
    closeShift:          () => patch("shift", null),
    closeTpvConfig:      () => patch("tpvConfig", false),
    closeShortage:       () => patch("shortage", null),
    closeDeliveryAssign:  () => patch("deliveryAssign", null),
    closeChangeOrderType: () => patch("changeOrderType", null),
    closeConfirm:         () => patch("confirm", null),
    closeAll:             () => setState(INITIAL),
  }), [state, patch]);

  return <ModalContext.Provider value={value}>{children}</ModalContext.Provider>;
}

export function useModals() {
  const ctx = useContext(ModalContext);
  if (!ctx) throw new Error("useModals must be used inside <ModalProvider>");
  return ctx;
}
