'use strict';

// Pedidos a domicilio del marketplace que entrega un repartidor PROPIO de la tienda.
// La orden v1 nace con la tarea de despacho en política MANUAL (sin oferta a la red
// compartida); el repartidor se asigna como en cualquier pedido de la tienda
// (Order.deliveryDriverId: bolsa, "tomar" o asignación desde la caja) y entrega con
// el código que dicta el comprador: el deliveryPin de la orden, que se verifica
// contra su hash guardado en el pipeline (nunca se guarda ni viaja en claro).
// Los pedidos de la red compartida (tarea con otra política) siguen en el despacho.

const { verifyPin } = require('./marketplace-dispatch');

// Antes de que la tienda lo acepte (o de que se pague en línea) no sale a reparto.
const NOT_DISPATCHABLE = Object.freeze(['PENDING_PAYMENT', 'PENDING_MERCHANT']);
// Campos del pipeline que necesita esta regla. El hash del PIN NUNCA se manda al cliente.
const PIPELINE_SELECT = Object.freeze({ restaurantId: true, dispatch: true, deliveryPinHash: true });

function storeDeliveredMarketplace(order) {
  const pipeline = order?.marketplacePipeline;
  const task = pipeline?.dispatch?.task;
  return order?.source === 'MARKETPLACE' && order.orderType === 'DELIVERY'
    && pipeline?.restaurantId === order.restaurantId && task?.orderId === order.id
    && task.restaurantId === order.restaurantId && task.deliveryPolicy === 'MANUAL';
}

// Pedido del marketplace que NO entrega la tienda: es de la red y va por el despacho.
function networkMarketplace(order) {
  return order?.source === 'MARKETPLACE' && !storeDeliveredMarketplace(order);
}

function matchesMarketplacePin(order, pin) {
  return verifyPin(pin, order?.marketplacePipeline?.deliveryPinHash);
}

// Vista para el repartidor: sin el pipeline (lleva los hashes de los PIN) y con la
// marca que la app usa para tratarlo como pedido propio.
function courierView(order) {
  if (!order || typeof order !== 'object') return order;
  const { marketplacePipeline, ...rest } = order;
  return storeDeliveredMarketplace(order) ? { ...rest, deliveredByStore: true } : rest;
}

module.exports = {
  NOT_DISPATCHABLE, PIPELINE_SELECT, storeDeliveredMarketplace, networkMarketplace, matchesMarketplacePin, courierView,
};
