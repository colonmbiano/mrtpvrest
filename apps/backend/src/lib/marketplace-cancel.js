'use strict';

// Cancelación de pedidos del Mercadito (C1 de la auditoría del 9/nov/2026).
//
// Reglas (decididas por el dueño del producto):
//   - Mesero, cocina y cualquier rol fuera de caja/gerencia NO cancelan un pedido del Mercadito.
//   - Rechazar un pedido por aceptar (PENDING_MERCHANT) lo puede hacer la caja: nada se preparó.
//   - Un pedido ya aceptado y pagado en línea solo lo cancelan gerente, administrador, dueño o
//     SUPER_ADMIN: hay dinero del cliente de por medio.
//   - Todo pedido pagado en línea que se cancela se reembolsa COMPLETO, envío incluido. La reserva
//     del reembolso se escribe en la MISMA transacción que pasa la orden a CANCELLED; la llamada a
//     Mercado Pago va después del commit. Si la pasarela falla, la reserva queda PENDING y la
//     recupera `recoverRefunds` (POST /api/marketplace/v1/ops/finance/recover o la tarea de C2).
//
// El motivo ya es obligatorio para toda cancelación (routes/orders.routes.js, requiredReason).

const MANAGER_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'OWNER', 'MANAGER']);
const CANCEL_ROLES = new Set([...MANAGER_ROLES, 'CASHIER']);

// Pagado en línea con Mercado Pago (no en caja ni en efectivo al repartidor).
function isOnlinePaidMarketplaceOrder(order) {
  return order?.source === 'MARKETPLACE' && order.paymentStatus === 'PAID'
    && order.paymentProvider === 'MERCADOPAGO' && typeof order.paymentProviderId === 'string' && order.paymentProviderId.length > 0;
}

// { status, body } para responder, o null si el rol puede cancelar este pedido.
// Solo aplica a la transición real hacia CANCELLED de un pedido del Mercadito.
function marketplaceCancelBlock(order, role) {
  if (order?.source !== 'MARKETPLACE') return null;
  if (!CANCEL_ROLES.has(role)) {
    return { status: 403, body: { code: 'MARKETPLACE_CANCEL_FORBIDDEN',
      error: 'Solo la caja o la gerencia pueden cancelar pedidos del Mercadito.' } };
  }
  if (order.status !== 'PENDING_MERCHANT' && isOnlinePaidMarketplaceOrder(order) && !MANAGER_ROLES.has(role)) {
    return { status: 403, body: { code: 'MARKETPLACE_CANCEL_REQUIRES_MANAGER',
      error: 'Este pedido ya se aceptó y se pagó en línea: solo un gerente, administrador o dueño puede cancelarlo.' } };
  }
  return null;
}

// Identificador del actor para la reserva del reembolso (letras, dígitos, _ y -).
function cancellationActorId(user) {
  const raw = String(user?.id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
  return raw ? `staff-${raw}`.slice(0, 128) : 'staff-unknown';
}

// Puertos sobre el adaptador financiero. Se crea al usarse: sin pedidos pagados en línea,
// cancelar no carga nada de finanzas.
function createMarketplaceCancellation({ prisma, settlements } = {}) {
  let finance = settlements || null;
  const ports = () => (finance ||= require('./marketplace-settlements-prisma').createMarketplaceSettlementsPrisma({ prisma }));
  return {
    // Dentro de la transacción de la cancelación. Lanza si no se puede reservar: entonces la
    // orden tampoco se cancela (la transacción se revierte).
    async reserveRefund(tx, { order, restaurantId, user, reason }) {
      try {
        return await ports().reserveCancellationRefund(tx, { orderId: order.id, restaurantId,
          actorId: cancellationActorId(user), reason });
      } catch (error) {
        // Otro camino canceló la misma orden al mismo tiempo y ganó la reserva (UNIQUE de keyHash).
        if (error?.code !== 'P2002') throw error;
        throw Object.assign(new Error('Este pedido ya se está cancelando desde otro lugar; actualiza la pantalla.'),
          { status: 409, code: 'CANCELLATION_IN_PROGRESS' });
      }
    },
    // Después del commit. Nunca lanza: devuelve el estado para la respuesta del TPV.
    async completeRefund(reservation, logger = console) {
      if (!reservation) return null;
      try {
        const done = await ports().completeRefund(reservation);
        return { status: done.status, amountCents: done.amountCents, refundId: done.refundId };
      } catch (error) {
        logger.error?.('[marketplace-cancel] reembolso pendiente', { orderId: reservation.orderId,
          refundId: reservation.id, code: error?.code || 'PROVIDER_UNAVAILABLE' });
        return { status: 'PENDING', amountCents: reservation.amountCents, refundId: reservation.id,
          errorCode: error?.code || 'PROVIDER_UNAVAILABLE' };
      }
    },
  };
}

module.exports = { MANAGER_ROLES, CANCEL_ROLES, isOnlinePaidMarketplaceOrder, marketplaceCancelBlock,
  cancellationActorId, createMarketplaceCancellation };
