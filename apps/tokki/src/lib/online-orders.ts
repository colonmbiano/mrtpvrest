import type { TicketItem } from "./printer-tcp";

export const ONLINE_ORDER_SOURCES = new Set(["ONLINE", "STORE", "WHATSAPP", "KIOSK"]);

export type OnlineOrder = {
  id: string;
  orderNumber?: string;
  customerName?: string;
  total?: number;
  status?: string;
  paymentStatus?: string;
  paymentMethod?: string;
  orderType?: string;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
  table?: { name?: string } | null;
  tableNumber?: number | string | null;
  user?: { name?: string } | null;
  items?: Array<Record<string, unknown>>;
};

const CLOSED_STATUSES = new Set(["CANCELLED", "COMPLETED"]);
const CARD_METHODS = new Set(["CARD", "CARD_PRESENT", "ONLINE"]);

export function isOnlineOrder(order: Pick<OnlineOrder, "source">): boolean {
  return ONLINE_ORDER_SOURCES.has(String(order.source || "").toUpperCase());
}

export function shouldAutoPrintOrder(order: OnlineOrder): boolean {
  if (!isOnlineOrder(order)) return false;
  if (CLOSED_STATUSES.has(String(order.status || "").toUpperCase())) return false;
  if (String(order.paymentStatus || "").toUpperCase() === "REFUNDED") return false;
  const waitsForCardConfirmation =
    CARD_METHODS.has(String(order.paymentMethod || "").toUpperCase()) &&
    String(order.paymentStatus || "").toUpperCase() !== "PAID";
  return !waitsForCardConfirmation;
}

export function orderItemsToTicketItems(items: Array<Record<string, unknown>> = []): TicketItem[] {
  return items.map((raw) => {
    const item = raw as {
      name?: string;
      quantity?: number;
      unitPrice?: number;
      price?: number;
      notes?: string;
      modifiers?: Array<{ name?: string; modifier?: { name?: string }; priceAdd?: number; price?: number }>;
      menuItem?: {
        name?: string;
        printerGroups?: Array<{ printerGroup?: { id?: string } }>;
        category?: { printerGroups?: Array<{ printerGroup?: { id?: string } }> };
      };
    };
    const itemGroups = (item.menuItem?.printerGroups || []).map((entry) => entry.printerGroup?.id).filter((id): id is string => Boolean(id));
    const categoryGroups = (item.menuItem?.category?.printerGroups || []).map((entry) => entry.printerGroup?.id).filter((id): id is string => Boolean(id));
    return {
      name: item.name || item.menuItem?.name || "Producto",
      quantity: Number(item.quantity ?? 1),
      price: Number(item.unitPrice ?? item.price ?? 0),
      notes: item.notes || null,
      modifiers: (item.modifiers || []).map((modifier) => ({
        name: modifier.name || modifier.modifier?.name || "",
        priceAdd: Number(modifier.priceAdd ?? modifier.price ?? 0),
      })),
      printerGroupIds: itemGroups.length ? itemGroups : categoryGroups,
    };
  });
}

export function orderTypeName(orderType?: string): string {
  return ({ TAKEOUT: "Para llevar", DELIVERY: "A domicilio", DINE_IN: "En local" } as Record<string, string>)[String(orderType || "").toUpperCase()] || "Pedido";
}
