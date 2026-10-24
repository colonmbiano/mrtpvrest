// Pedidos web: tienda en línea, WhatsApp y marketplace. Fuente única para la
// pantalla principal (/pos/order-type) y el layout del menú. KIOSK queda fuera
// porque tiene su propio flujo de notificación.

type OrderLike = { source?: string | null; status?: string | null } | null | undefined;

export const ONLINE_SOURCES = new Set(["ONLINE", "STORE", "WHATSAPP", "MARKETPLACE"]);

const sourceOf = (order: OrderLike) => String(order?.source || "").toUpperCase();

export const isMarketplaceOrder = (order: OrderLike) => sourceOf(order) === "MARKETPLACE";

// Requieren que el cajero los acepte antes de cocina: PENDING (tienda en línea y
// WhatsApp) y PENDING_MERCHANT (marketplace, ya pagado o contra entrega).
export const needsAcceptance = (order: OrderLike) =>
  order?.status === "PENDING" || order?.status === "PENDING_MERCHANT";

// Comanda automática: un pedido del marketplace se imprime en cocina solo cuando
// el comercio ya lo aceptó; nunca mientras espera el pago o la respuesta.
export function kitchenPrintReady(order: OrderLike): boolean {
  if (!isMarketplaceOrder(order)) return true;
  return !["PENDING_PAYMENT", "PENDING_MERCHANT", "CANCELLED"].includes(String(order?.status || ""));
}
