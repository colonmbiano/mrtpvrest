'use strict';

// Pedidos del marketplace en el TPV: sus productos y montos los fijó la cotización que el
// comprador aceptó (y, si pagó en línea, lo que cobró Mercado Pago), así que la caja no los
// edita: ni productos, ni cantidades, ni descuentos, ni dividir/juntar/cambiar tipo. El cobro
// en caja solo aplica a un pedido ya aceptado y que no se pagó en línea (p. ej. recoger en
// tienda pagando en efectivo). El TPV oculta esas acciones; estas reglas las hacen valer en el
// servidor para cualquier camino.

const NOT_ACCEPTED = new Set(['PENDING_PAYMENT', 'PENDING_MERCHANT']);

// { status, body } para responder, o null si el pedido se puede editar.
function marketplaceEditBlock(order) {
  if (order?.source !== 'MARKETPLACE') return null;
  return { status: 409, body: { code: 'MARKETPLACE_ORDER_LOCKED',
    error: 'Los productos de un pedido del marketplace no se editan en el TPV: los fijó la compra del cliente.' } };
}

// { status, body } para responder, o null si la caja puede cobrarlo.
function marketplaceChargeBlock(order) {
  if (order?.source !== 'MARKETPLACE') return null;
  if (NOT_ACCEPTED.has(order.status)) {
    return { status: 409, body: { code: 'MARKETPLACE_NOT_ACCEPTED', error: 'Acepta el pedido del marketplace antes de cobrarlo.' } };
  }
  if (order.paymentStatus === 'PAID') {
    return { status: 409, body: { code: 'MARKETPLACE_ALREADY_PAID', error: 'Este pedido del marketplace ya se pagó en línea; no se cobra en caja.' } };
  }
  return null;
}

module.exports = { marketplaceEditBlock, marketplaceChargeBlock };
