// Código de entrega de pedidos propios de la tienda (no marketplace). El cliente
// lo recibe del servidor y se lo dicta al repartidor; el servidor lo verifica
// al marcar la entrega (STORE_DELIVERY_PIN_MODE). Módulo puro y sin imports
// para probarlo con Node.

type OrderLike = { requiresDeliveryPin?: unknown; source?: unknown; taskId?: unknown } | null | undefined;

// Los pedidos del marketplace usan el PIN del despacho (tarea), no este.
export function needsStoreDeliveryPin(order: OrderLike): boolean {
  return Boolean(order) && order!.requiresDeliveryPin === true && order!.source !== 'MARKETPLACE' && !order!.taskId;
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
