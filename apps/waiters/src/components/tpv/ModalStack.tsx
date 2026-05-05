"use client";
import { useModals, type ProductDraft, type CategoryDraft, type EmployeeDraft } from "@/contexts/ModalContext";

import BaseModal from "@/components/ui/BaseModal";
import ConfirmModal from "@/components/modals/ConfirmModal";
import PaymentModal from "@/components/modals/PaymentModal";
import OrderDetailModal, { type OrderDetail } from "@/components/modals/OrderDetailModal";
import ProductModal from "@/components/modals/ProductModal";
import CategoryModal from "@/components/modals/CategoryModal";
import EmployeeModal from "@/components/modals/EmployeeModal";
import ReportModal, { type SalesReport } from "@/components/modals/ReportModal";
import DiscountModal from "@/components/modals/DiscountModal";
import ChangeOrderTypeModal from "@/components/modals/ChangeOrderTypeModal";
import type { OrderType } from "@/components/tpv/TicketPanel";

import ShiftModal from "@/components/admin/ShiftModal";
import TPVConfigModal from "@/components/admin/TPVConfigModal";
import IngredientShortageModal from "@/components/admin/IngredientShortageModal";
import DeliveryAssignModal from "@/components/admin/DeliveryAssignModal";

export type ModalStackHandlers = {
  currency?: string;

  // Payment
  onPaymentPaid?: (payload: { method: "cash" | "card" | "mixed"; cash: number; card: number; change: number; orderId: string }) => Promise<void> | void;

  // Order detail
  fetchOrder?: (id: string) => Promise<OrderDetail>;
  onCancelOrder?: (id: string) => Promise<void> | void;
  onRemoveItem?: (orderId: string, itemId: string) => Promise<void> | void;
  onUpdateItem?: (orderId: string, itemId: string, patch: { quantity?: number; notes?: string }) => Promise<void> | void;

  // Product / Category / Employee
  onProductSave?: (draft: ProductDraft) => Promise<void> | void;
  onCategorySave?: (draft: CategoryDraft) => Promise<void> | void;
  onEmployeeSave?: (draft: EmployeeDraft) => Promise<void> | void;
  productCategories?: { id: string; name: string }[];

  // Report
  fetchReport?: (from: string, to: string) => Promise<SalesReport>;

  // Discount
  verifyPin?: (pin: string) => Promise<boolean>;
  onDiscountApply?: (orderId: string, discount: { type: "percent" | "amount"; value: number; reason?: string }) => Promise<void> | void;

  // Shift
  onShiftChange?: () => void;

  // TPVConfig (adapter to existing component)
  tpvConfigSettings?: any;
  onTpvConfigUpdate?: (next: any) => void;

  // Delivery
  onDeliveryAssigned?: () => void;

  // Change order type
  onChangeOrderType?: (orderId: string, patch: { type: OrderType; address?: string; tableName?: string }) => Promise<void> | void;
};

export default function ModalStack(props: ModalStackHandlers = {}) {
  const m = useModals();
  const currency = props.currency ?? "$";

  return (
    <>
      <PaymentModal
        open={!!m.payment}
        order={m.payment}
        onClose={m.closePayment}
        currency={currency}
        onPaid={async (p) => {
          if (m.payment) {
            await props.onPaymentPaid?.({ ...p, orderId: m.payment.id });
          }
        }}
      />

      <OrderDetailModal
        open={!!m.orderDetail}
        orderId={m.orderDetail}
        onClose={m.closeOrderDetail}
        currency={currency}
        fetchOrder={props.fetchOrder}
        onCancelOrder={props.onCancelOrder}
        onRemoveItem={props.onRemoveItem}
        onUpdateItem={props.onUpdateItem}
      />

      <ProductModal
        open={!!m.product}
        product={m.product}
        onClose={m.closeProduct}
        onSave={props.onProductSave}
        categories={props.productCategories}
      />

      <CategoryModal
        open={!!m.category}
        category={m.category}
        onClose={m.closeCategory}
        onSave={props.onCategorySave}
      />

      <EmployeeModal
        open={!!m.employee}
        employee={m.employee}
        onClose={m.closeEmployee}
        onSave={props.onEmployeeSave}
      />

      <ReportModal
        open={m.report}
        onClose={m.closeReport}
        currency={currency}
        fetchReport={props.fetchReport}
      />

      <DiscountModal
        open={!!m.discount}
        orderId={m.discount?.orderId ?? null}
        total={m.discount?.total ?? 0}
        onClose={m.closeDiscount}
        currency={currency}
        verifyPin={props.verifyPin}
        onApply={props.onDiscountApply}
      />

      <ChangeOrderTypeModal
        open={!!m.changeOrderType}
        payload={m.changeOrderType}
        onClose={m.closeChangeOrderType}
        currency={currency}
        onChange={props.onChangeOrderType}
        onAssignDriverAfter={(orderId) => {
          const ord = m.changeOrderType;
          if (!ord) return;
          m.openDeliveryAssign({
            id: orderId,
            customerName: ord.customerName ?? "Cliente",
            address: ord.address ?? "",
            total: ord.total ?? 0,
          });
        }}
      />

      <ConfirmModal open={!!m.confirm} config={m.confirm} onClose={m.closeConfirm} />

      {/* Existing admin modales — adapted via context state */}
      {m.shift && (
        <ShiftModal
          employee={m.shift as any}
          onClose={() => {
            m.closeShift();
            props.onShiftChange?.();
          }}
        />
      )}
      {m.tpvConfig && (
        <TPVConfigModal
          onClose={m.closeTpvConfig}
          settings={props.tpvConfigSettings}
          onUpdate={props.onTpvConfigUpdate ?? (() => {})}
        />
      )}
      {m.shortage && (
        <IngredientShortageModal order={m.shortage as any} onClose={m.closeShortage} />
      )}
      {m.deliveryAssign && (
        <DeliveryAssignModal
          order={m.deliveryAssign as any}
          onClose={m.closeDeliveryAssign}
          onAssigned={() => {
            props.onDeliveryAssigned?.();
            m.closeDeliveryAssign();
          }}
        />
      )}
    </>
  );
}

// Export BaseModal here so it can be used by callers without importing from ui/
export { BaseModal };
