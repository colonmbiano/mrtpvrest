'use strict';
const { createHash } = require('node:crypto');
const { usesPackaging } = require('../lib/order-packaging');
const { describePlan } = require('../lib/order-packaging-plan');
const { resolveInventoryLines } = require('./order-inventory.service');
const fail = (status, message) => Object.assign(new Error(message), { status });

async function readPackaging(tx, orderId, restaurantId, locationId) {
  const order = await tx.order.findFirst({ where: { id: orderId, restaurantId,
    ...(locationId ? { locationId } : {}) }, include: { items: true } });
  if (!order) throw fail(404, 'Pedido no encontrado');
  const ingredients = await tx.ingredient.findMany({ where: { restaurantId, isPackaging: true,
    OR: [{ locationId: null }, { locationId: order.locationId }] } });
  const movements = await tx.stockMovement.findMany({ where: { refType: 'order', refId: orderId,
    ingredient: { restaurantId }, reason: { in: ['SALE', 'ADJUSTMENT'] } }, orderBy: { id: 'asc' } });
  const processed = order.items.some(i => i.costSnapshot != null) || movements.length > 0;
  const paid = order.paymentStatus === 'PAID';
  const lines = await resolveInventoryLines(tx, order.items, restaurantId);
  const description = describePlan(order, lines);
  const stale = !!order.packagingPlan && order.packagingPlan.signature !== description.signature;
  const counts = !processed && order.packagingPlan && !stale
    ? new Map(order.packagingPlan.counts.map(c => [c.ingredientId, c.quantity])) : description.counts;
  const actual = new Map();
  for (const m of movements) {
    const a = actual.get(m.ingredientId) || { quantity: 0, cost: 0 };
    a.quantity -= Number(m.delta); a.cost -= Number(m.delta) * Number(m.unitCostAtMove || 0);
    actual.set(m.ingredientId, a);
  }
  const revision = createHash('sha256').update(JSON.stringify([description.signature, order.paymentStatus,
    order.status, order.packagingPlan, movements.map(m => [m.id, m.delta]), ingredients.map(i => [i.id, i.cost, i.baseUnit])])).digest('hex');
  const entries = ingredients.map(i => ({ ingredientId: i.id, name: i.name, unit: i.baseUnit,
    quantity: processed ? Math.max(0, actual.get(i.id)?.quantity || 0) : (counts.get(i.id) || 0),
    extraQuantity: processed ? 0 : (description.extras.get(i.id) || 0),
    unitCost: processed && actual.get(i.id)?.quantity > 0 ? actual.get(i.id).cost / actual.get(i.id).quantity : Number(i.cost || 0),
  })).sort((a, b) => (b.quantity + b.extraQuantity) - (a.quantity + a.extraQuantity) || a.name.localeCompare(b.name));
  return { order, ingredients, processed, paid, stale, revision, entries, description, hasNormalItems: lines.some(l => !l.isPackagingProduct) };
}
function publicState(state) {
  const dineIn = !usesPackaging(state.order.orderType);
  const closed = state.paid || state.order.status === 'CANCELLED';
  const hasNormalItems = state.hasNormalItems;
  return {
    pending: !state.processed, orderId: state.order.id, orderType: state.order.orderType, revision: state.revision,
    editable: !dineIn && !closed && !state.processed && hasNormalItems,
    message: closed ? 'Pedido cobrado o cancelado. Los desechables adicionales se venden en un ticket nuevo.'
      : state.processed ? 'Pedido anterior con consumo registrado. Sus empaques requieren revisión; no se volverá a descontar lo registrado.'
      : dineIn ? 'En mesa no se incluyen desechables. Agrega el producto extra si el cliente pide uno.'
      : state.stale ? 'El pedido o sus recetas cambiaron. Se recalcularon los empaques; revisa las cantidades.'
      : 'Guarda las cantidades antes de cobrar. El inventario se descontará al finalizar el pago.',
    entries: dineIn && !state.processed ? state.entries.filter(e => e.extraQuantity > 0) : state.entries,
    packagingCost: Number(state.entries.reduce((s, e) => s + (e.quantity + e.extraQuantity) * e.unitCost, 0).toFixed(4)),
  };
}
function validateCounts(state, counts) {
  if (!Array.isArray(counts) || counts.length > 200) throw fail(400, 'Lista de empaques inválida');
  const seen = new Set();
  for (const c of counts) {
    const ingredient = state.ingredients.find(i => i.id === c?.ingredientId);
    if (!ingredient || seen.has(c.ingredientId)) throw fail(400, 'Empaque inválido o duplicado');
    seen.add(c.ingredientId);
    if (typeof c.quantity !== 'number' || !Number.isFinite(c.quantity) || c.quantity < 0 || c.quantity > 10000 ||
      (ingredient.baseUnit === 'PIECE' && !Number.isInteger(c.quantity))) throw fail(400, 'Cantidad de empaque inválida');
    if (!usesPackaging(state.order.orderType) && c.quantity !== 0) throw fail(400, 'Los pedidos de mesa no incluyen desechables');
  }
}
async function setPackaging(prisma, orderId, restaurantId, locationId, revision, counts) {
  return prisma.$transaction(async tx => {
    const locked = await tx.order.updateMany({ where: { id: orderId, restaurantId,
      ...(locationId ? { locationId } : {}) }, data: { updatedAt: new Date() } });
    if (!locked.count) throw fail(404, 'Pedido no encontrado');
    const state = await readPackaging(tx, orderId, restaurantId, locationId);
    validateCounts(state, counts);
    if (!publicState(state).editable) throw fail(409, publicState(state).message);
    const same = counts.every(c => c.quantity === state.entries.find(e => e.ingredientId === c.ingredientId)?.quantity);
    if (revision !== state.revision && !same) throw fail(409, 'El pedido cambió. Actualiza los empaques antes de guardar.');
    const merged = new Map(state.entries.map(e => [e.ingredientId, e.quantity]));
    for (const c of counts) merged.set(c.ingredientId, c.quantity);
    await tx.order.updateMany({ where: { id: orderId, restaurantId }, data: { packagingPlan: {
      signature: state.description.signature, counts: [...merged].map(([ingredientId, quantity]) => ({ ingredientId, quantity })),
    } } });
    return publicState(await readPackaging(tx, orderId, restaurantId, locationId));
  }, { timeout: 30000 });
}
async function lockOrder(tx, orderId, restaurantId, locationId) {
  const locked = await tx.order.updateMany({ where: { id: orderId, restaurantId, ...(locationId ? { locationId } : {}) }, data: { updatedAt: new Date() } });
  if (!locked.count) throw fail(404, 'Pedido no encontrado');
}
async function changePackagingType(tx, order, type) {
  if (order.orderType === type) return;
  const state = await readPackaging(tx, order.id, order.restaurantId, order.locationId);
  if (state.processed) throw fail(409, 'Este pedido ya tiene consumo registrado; revisa su inventario antes de cambiar el servicio.');
  await tx.order.updateMany({ where: { id: order.id, restaurantId: order.restaurantId }, data: { packagingPlan: require('@prisma/client').Prisma.DbNull } });
}
module.exports = { readPackaging, publicState, setPackaging, changePackagingType, lockOrder };
