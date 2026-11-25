'use strict';

const CANCELLABLE = ['PENDING_PAYMENT', 'PENDING_MERCHANT'];
class BuyerCancelError extends Error {
  constructor(code, message, statusCode) { super(message); this.code = code; this.statusCode = statusCode; }
}

function createBuyerCancellation({ prisma, cancellation } = {}) {
  return async ({ orderId, accountId, io }) => {
    if (typeof orderId !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(orderId)) {
      throw new BuyerCancelError('ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
    }
    const db = prisma || require('@mrtpvrest/database').prisma;
    // La relación cuenta-cotización-pedido es inmutable tras crear la orden.
    const quote = await db.marketplaceQuote.findFirst({
      where: { orderId, accountId }, select: { restaurantId: true },
    });
    if (!quote) throw new BuyerCancelError('ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
    const order = await db.order.findFirst({
      where: { id: orderId, restaurantId: quote.restaurantId, source: 'MARKETPLACE' },
      select: { status: true },
    });
    if (!order) throw new BuyerCancelError('ORDER_NOT_FOUND', 'Pedido no encontrado', 404);
    if (!CANCELLABLE.includes(order.status)) {
      throw new BuyerCancelError('ORDER_NOT_CANCELLABLE', 'La tienda ya aceptó o cerró este pedido', 409);
    }
    const canceller = cancellation || require('./marketplace-cancel').createMarketplaceCancellation(db);
    const result = await canceller.cancelOrder({
      orderId, restaurantId: quote.restaurantId, fromStatuses: CANCELLABLE,
      actor: { id: 'buyer-' + accountId, name: 'Comprador' },
      reason: 'Cancelación solicitada por el comprador', io,
    });
    if (result.outcome !== 'CANCELLED') {
      throw new BuyerCancelError('ORDER_NOT_CANCELLABLE', 'El pedido cambió y ya no se puede cancelar', 409);
    }
    return { id: orderId, status: 'CANCELLED', refund: result.refund ? { status: result.refund.status } : null };
  };
}

module.exports = { createBuyerCancellation, BuyerCancelError };
