// Pedidos web: tienda en línea, WhatsApp y marketplace. Fuente única para la
// pantalla principal (/pos/order-type) y el layout del menú. KIOSK queda fuera
// porque tiene su propio flujo de notificación.

type OrderLike = { source?: string | null; status?: string | null; paymentStatus?: string | null; createdAt?: string | null } | null | undefined;

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

// Un pedido del marketplace no se edita en el TPV: sus productos y montos los fijó la compra
// del cliente (el backend también lo rechaza). Se puede ver, imprimir y, si toca, cobrar.
export const itemsLocked = (order: OrderLike) => isMarketplaceOrder(order);

// Por qué la caja NO cobra un pedido del marketplace (etiqueta corta para la fila), o null si
// sí se cobra: p. ej. recoger en tienda pagando en efectivo, ya aceptado.
export function chargeBlockedLabel(order: OrderLike): string | null {
  if (!isMarketplaceOrder(order)) return null;
  const status = String(order?.status || "");
  if (status === "PENDING_PAYMENT") return "Esperando pago";
  if (status === "PENDING_MERCHANT") return "Por aceptar";
  if (order?.paymentStatus === "PAID") return "Pagado en línea";
  return null;
}


// Minutos completos de espera. Un reloj desajustado o una fecha inválida
// nunca produce un contador negativo ni una alarma falsa.
export function waitingMinutes(order: OrderLike, now = Date.now()): number {
  const created = Date.parse(order?.createdAt || "");
  return Number.isFinite(created) ? Math.max(0, Math.floor((now - created) / 60_000)) : 0;
}

export function marketplacePendingSummary(orders: OrderLike[], now = Date.now()) {
  const pending = orders.filter(order => isMarketplaceOrder(order) && order?.status === "PENDING_MERCHANT");
  return {
    count: pending.length,
    overdue: pending.some(order => Number.isFinite(Date.parse(order?.createdAt || ""))
      && now - Date.parse(order?.createdAt || "") > 5 * 60_000),
  };
}
