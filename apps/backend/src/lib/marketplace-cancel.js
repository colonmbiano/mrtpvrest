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
function createMarketplaceCancellation({ prisma, settlements, deps = {} } = {}) {
  let finance = settlements || null;
  const ports = () => (finance ||= require('./marketplace-settlements-prisma').createMarketplaceSettlementsPrisma({ prisma }));
  const api = {
    // Dentro de la transacción de la cancelación. Lanza si no se puede reservar: entonces la
    // orden tampoco se cancela (la transacción se revierte).
    // actorId: para procesos del sistema (C2), que no tienen usuario.
    async reserveRefund(tx, { order, restaurantId, user, actorId, reason }) {
      try {
        return await ports().reserveCancellationRefund(tx, { orderId: order.id, restaurantId,
          actorId: actorId || cancellationActorId(user), reason });
      } catch (error) {
        // Otro camino canceló la misma orden al mismo tiempo y ganó la reserva (UNIQUE de keyHash).
        if (error?.code !== 'P2002') throw error;
        throw Object.assign(new Error('Este pedido ya se está cancelando desde otro lugar; actualiza la pantalla.'),
          { status: 409, code: 'CANCELLATION_IN_PROGRESS' });
      }
    },
    // Termina los reembolsos que quedaron PENDING (pasarela caída). Lo corre la tarea de C2.
    recoverRefunds(actor, options) {
      return ports().recoverRefunds(actor, options);
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

  // Cancelación completa de un pedido del Mercadito fuera de la caja: la tarea de pedidos sin
  // aceptar (C2) y, después, la cancelación del comprador (X7). La caja sigue usando
  // PUT /api/orders/:id/status, que además maneja mesas y el candado del corte.
  //   fromStatuses: estados desde los que se permite (p. ej. ['PENDING_MERCHANT']).
  //   actor: { id, name } de un proceso o del comprador; queda en la auditoría y en el reembolso.
  // Devuelve { outcome: 'CANCELLED', order, refund } o { outcome: 'SKIPPED', reason }.
  api.cancelOrder = async function cancelOrder({ orderId, restaurantId, fromStatuses, reason, actor, note, io,
    logger = console }) {
    const transaction = deps.transaction || require('./driver-cash-settlement').cashTransaction;
    const audit = deps.audit || require('./audit-logger');
    if (!Array.isArray(fromStatuses) || fromStatuses.length === 0) throw new Error('fromStatuses requerido');
    if (typeof reason !== 'string' || reason.trim().length < 5) throw Object.assign(new Error('Motivo requerido'), { status: 400, code: 'REASON_REQUIRED' });
    let reservation = null;
    let cancelled;
    try {
      cancelled = await transaction(prisma, async (tx) => {
        reservation = null;
        const fresh = await tx.order.findFirst({ where: { id: orderId, restaurantId, source: 'MARKETPLACE' } });
        if (!fresh || !fromStatuses.includes(fresh.status)) return null;
        if (isOnlinePaidMarketplaceOrder(fresh)) {
          reservation = await api.reserveRefund(tx, { order: fresh, restaurantId, actorId: actor.id, reason });
        }
        const notes = note ? [fresh.notes?.trim(), note].filter(Boolean).join(' — ') : fresh.notes;
        // Condicional: si la caja aceptó en el mismo instante, gana la caja y aquí no se cancela.
        const changed = await tx.order.updateMany({ where: { id: orderId, restaurantId, status: fresh.status },
          data: { status: 'CANCELLED', ...(note ? { notes } : {}) } });
        if (changed.count !== 1) throw Object.assign(new Error('El pedido cambió'), { code: 'ORDER_CHANGED' });
        const restaurant = await tx.restaurant.findFirst({ where: { id: restaurantId }, select: { tenantId: true } });
        await audit.record({ user: { isDevice: true, id: actor.id, name: actor.name, tenantId: restaurant?.tenantId },
          restaurantId, locationId: fresh.locationId }, audit.AUDIT_EVENTS.ORDER_CANCEL, {
          resource: `order:${orderId}`, reason: reason.trim(),
          before: { status: fresh.status }, after: { status: 'CANCELLED', total: fresh.total,
            ...(reservation ? { refundId: reservation.id, refundCents: reservation.amountCents } : {}) },
        }, tx);
        return { ...fresh, status: 'CANCELLED', notes };
      });
    } catch (error) {
      if (['ORDER_CHANGED', 'CANCELLATION_IN_PROGRESS'].includes(error?.code)) return { outcome: 'SKIPPED', reason: error.code };
      throw error;
    }
    if (!cancelled) return { outcome: 'SKIPPED', reason: 'NOT_CANCELLABLE' };
    const refund = await api.completeRefund(reservation, logger);
    // Lo mismo que la cancelación en caja, sin bloquear: inventario, pantallas y aviso al cliente.
    const restore = deps.restoreInventory || ((db, id, rid) => require('../routes/orders.routes').restoreInventoryForCancelledOrder(db, id, rid));
    await Promise.resolve().then(() => restore(prisma, orderId, restaurantId))
      .catch(error => logger.error?.('[marketplace-cancel] inventario', { orderId, message: error?.message }));
    if (io) {
      const payload = { id: cancelled.id, orderNumber: cancelled.orderNumber, status: 'CANCELLED', source: 'MARKETPLACE',
        orderType: cancelled.orderType, restaurantId, locationId: cancelled.locationId };
      if (cancelled.locationId) {
        io.to(`restaurant:${restaurantId}:location:${cancelled.locationId}:admins`).emit('order:updated', payload);
        io.to(`restaurant:${restaurantId}:location:${cancelled.locationId}:kitchen`).emit('order:updated', payload);
      }
      io.to(`restaurant:${restaurantId}:kitchen`).emit('order:updated', payload);
    }
    const notify = deps.notifyOrderStatus || require('../services/notifications.service').notifyOrderStatus;
    await Promise.resolve().then(() => notify(cancelled, 'CANCELLED'))
      .catch(error => logger.error?.('[marketplace-cancel] aviso al cliente', { orderId, message: error?.message }));
    return { outcome: 'CANCELLED', order: cancelled, refund };
  };
  return api;
}

module.exports = { MANAGER_ROLES, CANCEL_ROLES, isOnlinePaidMarketplaceOrder, marketplaceCancelBlock,
  cancellationActorId, createMarketplaceCancellation };
