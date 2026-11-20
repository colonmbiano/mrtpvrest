'use strict';

// El TPV permite capturar el envío como producto. Ese cargo ya pertenece al
// subtotal: se reconoce desde las líneas persistidas, sin volver a sumarlo.
const SHIPPING_PENDING_RE = /ENV[IÍ]O POR ASIGNAR/i;
const SHIPPING_ITEM_RE = /^env[ií]os?(?:\s|$)/iu;
const SHIPPING_ITEMS_SELECT = { select: { name: true, price: true, quantity: true } };

function hasManualShippingItem(order) {
  if (order?.source === 'MARKETPLACE' || !Array.isArray(order?.items)) return false;
  return order.items.some(item => {
    const amount = Number(item.price) * Number(item.quantity);
    return SHIPPING_ITEM_RE.test(String(item.name || '').trim())
      && Number(item.price) > 0 && Number(item.quantity) > 0
      && Number.isFinite(amount) && Math.round(amount * 100) > 0;
  });
}

function shippingFeePending(order) {
  return order?.orderType === 'DELIVERY' && !(Number(order.deliveryFee) > 0)
    && SHIPPING_PENDING_RE.test(order.notes || '') && !hasManualShippingItem(order);
}

function manualShippingNotes(order) {
  return hasManualShippingItem(order) && SHIPPING_PENDING_RE.test(order.notes || '')
    ? String(order.notes || '').replace(/ENV[IÍ]O POR ASIGNAR/gi, 'ENVÍO INCLUIDO COMO PRODUCTO')
    : order?.notes;
}

module.exports = { SHIPPING_ITEMS_SELECT, hasManualShippingItem, shippingFeePending, manualShippingNotes };
