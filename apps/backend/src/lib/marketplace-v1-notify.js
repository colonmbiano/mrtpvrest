'use strict';

// Aviso inmediato a la caja (TPV) cuando un pedido del marketplace queda POR ACEPTAR: en
// efectivo al crearse; en línea cuando Mercado Pago confirma el pago. Es el mismo evento y la
// misma sala que un pedido web de la tienda (order:new a restaurant:<id>:location:<id>:admins),
// así el TPV suena, notifica y refresca sin esperar su consulta periódica.
// Se emite DESPUÉS del commit y es best-effort: sin socket, el TPV lo ve en su consulta de 30 s.
// La cocina no se avisa aquí: el pedido le llega cuando la tienda lo acepta.

const ORDER_VIEW = { id: true, restaurantId: true, locationId: true, orderNumber: true, source: true, orderType: true,
  status: true, total: true, customerName: true, paymentStatus: true, paymentMethod: true, createdAt: true };

function createMerchantOrderNotifier({ prisma, logger = console } = {}) {
  return async function notifyMerchant({ io, orderId, restaurantId } = {}) {
    if (!io || typeof io.to !== 'function' || typeof orderId !== 'string' || typeof restaurantId !== 'string') return false;
    try {
      // Se relee la orden: solo se avisa si de verdad quedó por aceptar en ese comercio.
      const order = await prisma.order.findFirst({ where: { id: orderId, restaurantId, source: 'MARKETPLACE',
        status: 'PENDING_MERCHANT' }, select: ORDER_VIEW });
      if (!order) return false;
      const room = order.locationId ? `restaurant:${restaurantId}:location:${order.locationId}:admins` : `restaurant:${restaurantId}`;
      io.to(room).emit('order:new', { ...order, total: Number(order.total) });
      return true;
    } catch (error) {
      logger.warn?.('[marketplace-v1] aviso al TPV no enviado', { orderId, code: error?.code || 'ERROR' });
      return false;
    }
  };
}

module.exports = { createMerchantOrderNotifier };
