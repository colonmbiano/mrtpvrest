'use strict';

// ───────────────────────────────────────────────────────────────────────────
// Definición canónica de "mesa con cuenta abierta".
//
// Una cuenta de mesa NO se queda en 'OPEN': cocina la avanza a
// CONFIRMED/PREPARING/READY sin que esté pagada, y los pedidos que entran por
// el QR de mesa (tienda online / kiosko) nacen en PENDING hasta que el cajero
// los acepta. Filtrar por un subconjunto rompe de tres formas:
//   (a) duplica cuentas — la mesa "ocupada" no se detecta al re-entrar,
//   (b) hace inconsistente la fusión por tableId,
//   (c) el mapa de piso pinta como libre una mesa que ya pidió por QR.
//
// Este set + `paymentStatus != PAID` debe usarse en TODO lookup de
// cuenta-por-mesa (órdenes, mapa de piso, meseros, borrado de mesa).
// ───────────────────────────────────────────────────────────────────────────
const OPEN_TABLE_STATUSES = ['PENDING', 'OPEN', 'CONFIRMED', 'PREPARING', 'READY'];

// Where reutilizable para "la cuenta viva de esta mesa".
function openTabWhere(tableId) {
  return {
    tableId,
    status: { in: OPEN_TABLE_STATUSES },
    paymentStatus: { not: 'PAID' },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Pedidos de la tienda (QR de mesa) que se suman a la cuenta abierta de su mesa
// como una ronda más, en vez de abrir una segunda cuenta (store.routes POST
// /orders y la aceptación de un pedido por confirmar en orders.routes).
// ───────────────────────────────────────────────────────────────────────────

// La cuenta viva de la mesa que puede recibir la ronda: confirmada (un pedido
// QR por confirmar no es la cuenta de nadie) y de la misma sucursal. `excludeId`
// deja fuera al propio pedido que se está sumando.
function webRoundTabWhere(tableId, locationId, excludeId) {
  return {
    ...openTabWhere(tableId),
    locationId,
    awaitingTableConfirmation: false,
    ...(excludeId ? { id: { not: excludeId } } : {}),
  };
}

// ¿La cuenta puede recibir la ronda sin perder ni cobrar doble? La propina de
// un pedido web va dentro de su total y el recálculo de la ronda (igual que en
// el TPV) la dejaría fuera; una cuenta con checkout en línea abierto se marcaría
// PAGADA entera con el pago de antes. El descuento sí se conserva.
function canTakeWebRound(tab) {
  return !(Number(tab.tip) > 0) && !tab.paymentProviderRef && tab.paymentStatus !== 'PAID';
}

// ¿Este pedido puede volverse una ronda de otra cuenta? Cupón, puntos, propina o
// pago en línea viven en la orden, no en sus líneas: al mover las líneas se
// quedarían atrás. Esos siguen como orden aparte, igual que antes.
function canJoinTab(order) {
  return !(Number(order.tip) > 0)
    && !(Number(order.discount) > 0)
    && !(Number(order.pointsUsed) > 0)
    && !order.couponId
    && !order.paymentProviderRef
    && order.paymentStatus !== 'PAID';
}

// Id de la ronda que deja un pedido por confirmar al sumarse a la cuenta. Fijo
// por pedido: un reintento de la aceptación no duplica la ronda, y la tienda
// encuentra la cuenta del pedido que siguió el comensal (by-number).
function heldOrderRoundId(orderId) {
  return `qr-held-${orderId}`;
}

module.exports = {
  OPEN_TABLE_STATUSES, openTabWhere, webRoundTabWhere, canTakeWebRound, canJoinTab, heldOrderRoundId,
};
