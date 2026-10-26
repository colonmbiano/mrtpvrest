// Código de entrega de pedidos que entrega el repartidor de la tienda. El cliente
// lo recibe del servidor y se lo dicta al repartidor; el servidor lo verifica
// al marcar la entrega (STORE_DELIVERY_PIN_MODE en pedidos propios; siempre en
// los del marketplace que entrega la tienda). Módulo puro y sin imports para
// probarlo con Node.

type OrderLike = {
  requiresDeliveryPin?: unknown; source?: unknown; taskId?: unknown; deliveredByStore?: unknown;
  paymentStatus?: unknown;
} | null | undefined;

// Pedido de la red del marketplace: se recoge y entrega con el PIN del despacho
// (tarea). Los del marketplace que entrega la tienda (deliveredByStore) siguen el
// flujo propio: cobrar y entregar con el código del cliente.
export function isNetworkOrder(order: OrderLike): boolean {
  return Boolean(order) && (Boolean(order!.taskId) || (order!.source === 'MARKETPLACE' && order!.deliveredByStore !== true));
}

export function needsStoreDeliveryPin(order: OrderLike): boolean {
  return Boolean(order) && order!.requiresDeliveryPin === true && !isNetworkOrder(order);
}

// Cómo se cierra el cobro de un pedido del marketplace que entrega la tienda: ya
// pagado en línea (no se cobra nada) o en efectivo (solo efectivo). null = pedido
// propio, con todas las opciones de cobro.
export function marketplaceCollection(order: OrderLike): 'PREPAID' | 'CASH_ONLY' | null {
  if (!order || order.source !== 'MARKETPLACE' || order.deliveredByStore !== true) return null;
  return order.paymentStatus === 'PAID' ? 'PREPAID' : 'CASH_ONLY';
}

// Errores del servidor que significan "el código no sirve": pedirlo otra vez
// en lugar de reintentar en segundo plano.
const PIN_REJECTIONS = new Set(['INVALID_DELIVERY_PIN', 'DELIVERY_PIN_REQUIRED', 'DELIVERY_PIN_LOCKED']);

export function isDeliveryPinRejection(code: unknown): boolean {
  return typeof code === 'string' && PIN_REJECTIONS.has(code);
}

// Cuerpo para PUT /api/delivery/:driverId/orders/:orderId/status: agrega el
// código solo al entregar un pedido que lo requiere.
export function withDeliveryPin<T extends Record<string, unknown>>(data: T, order: OrderLike, status: string, pin: string | undefined): T & { deliveryPin?: string } {
  if (status !== 'DELIVERED' || !needsStoreDeliveryPin(order) || !pin) return data;
  return { ...data, deliveryPin: pin };
}
