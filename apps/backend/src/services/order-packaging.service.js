'use strict';
const { createHash } = require('node:crypto');
const { usesPackaging } = require('../lib/order-packaging');
const { resolveOrderLineItems } = require('./order-inventory.service');

const fail = (status, message) => Object.assign(new Error(message), { status });
const multiplier = item => Number(item.weightKg ?? item.quantity);
const round = n => Math.round(n * 1e8) / 1e8;

// The existing stock ledger is the source of truth. Absolute counts are
// reconciled with it; retries never replay a full recipe or food consumption.
async function readPackaging(tx, orderId, restaurantId, locationId) {
  const order = await tx.order.findFirst({
    where: { id: orderId, restaurantId, ...(locationId ? { locationId } : {}) },
    include: { items: true },
  });
  if (!order) throw fail(404, 'Pedido no encontrado');
  const ingredients = await tx.ingredient.findMany({ where: { restaurantId, isPackaging: true,
    OR: [{ locationId: null }, { locationId: order.locationId }],
  } });
  const movements = await tx.stockMovement.findMany({
    where: { refType: 'order', refId: orderId, ingredient: { restaurantId }, reason: { in: ['SALE', 'ADJUSTMENT'] } },
    orderBy: { id: 'asc' },
  });
  const packagingIds = new Set(ingredients.map(i => i.id));
  const actual = new Map();
  const perItem = new Map();
  const traced = new Set();
  const tracedCosts = new Map();
  let unassigned = false;
  for (const m of movements) {
    const match = /^(?:Venta|Empaque) orderItem (\S+)$/.exec(m.notes || '');
    if (match) {
      traced.add(match[1]);
      tracedCosts.set(match[1], (tracedCosts.get(match[1]) || 0) - Number(m.delta) * Number(m.unitCostAtMove || 0));
    }
    if (!packagingIds.has(m.ingredientId)) continue;
    if (!match || !order.items.some(i => i.id === match[1])) { unassigned = true; continue; }
    const quantity = -Number(m.delta);
    const cost = quantity * Number(m.unitCostAtMove || 0);
    const prior = actual.get(m.ingredientId) || { quantity: 0, cost: 0 };
    actual.set(m.ingredientId, { quantity: round(prior.quantity + quantity), cost: prior.cost + cost });
    const key = `${match[1]}:${m.ingredientId}`;
    const row = perItem.get(key) || { itemId: match[1], ingredientId: m.ingredientId, quantity: 0, cost: 0 };
    perItem.set(key, { ...row, quantity: round(row.quantity + quantity), cost: row.cost + cost });
  }
  const pending = order.items.some(i => i.costSnapshot == null);
  const transferred = unassigned || order.items.some(i => Number(i.costSnapshot) > 0 && !traced.has(i.id)) ||
    [...traced].some(id => !order.items.some(i => i.id === id)) ||
    order.items.some(i => i.costSnapshot != null && Math.abs(
      Number(i.costSnapshot) * multiplier(i) - (tracedCosts.get(i.id) || 0)
    ) > 0.0001 * Math.max(1, multiplier(i)));
  const revision = createHash('sha256').update(JSON.stringify([
    order.orderType, order.status, order.items.map(i => [i.id, i.quantity, String(i.weightKg), i.costSnapshot]),
    movements.map(m => [m.id, m.delta]), ingredients.map(i => [i.id, i.cost, i.baseUnit]),
  ])).digest('hex');
  const entries = ingredients.map(i => {
    const a = actual.get(i.id) || { quantity: 0, cost: 0 };
    return { ingredientId: i.id, name: i.name, unit: i.baseUnit, quantity: Math.max(0, a.quantity),
      unitCost: a.quantity > 0 ? a.cost / a.quantity : Number(i.cost || 0) };
  }).sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name));
  return { order, ingredients, actual, perItem, pending, transferred, revision, entries };
}

function publicState(state) {
  const dineIn = !usesPackaging(state.order.orderType);
  return {
    pending: state.pending, orderId: state.order.id, orderType: state.order.orderType, revision: state.revision,
    editable: !dineIn && !state.pending && !state.transferred && !['DELIVERED', 'CANCELLED'].includes(state.order.status),
    message: dineIn ? 'En mesa no se incluyen desechables.' : state.pending
      ? 'Registra el consumo del pedido para ajustar sus empaques.' : state.transferred
        ? 'Este pedido tiene movimientos de una cuenta dividida o transferida. Requiere revisar su inventario antes de ajustar empaques.' : null,
    entries: dineIn ? [] : state.entries,
    packagingCost: dineIn ? 0 : Number([...state.actual.values()].reduce((s, a) => s + a.cost, 0).toFixed(4)),
  };
}

function validateCounts(state, counts, orderType = state.order.orderType) {
  if (!Array.isArray(counts) || counts.length > 200) throw fail(400, 'Lista de empaques inválida');
  const seen = new Set();
  const byId = new Map(state.ingredients.map(i => [i.id, i]));
  for (const c of counts) {
    if (!c || typeof c !== 'object') throw fail(400, 'Empaque inválido');
    const ingredient = byId.get(c.ingredientId);
    if (!ingredient || seen.has(c.ingredientId)) throw fail(400, 'Empaque inválido o duplicado');
    seen.add(c.ingredientId);
    if (typeof c.quantity !== 'number' || !Number.isFinite(c.quantity) || c.quantity < 0 || c.quantity > 10000 ||
      (ingredient.baseUnit === 'PIECE' && !Number.isInteger(c.quantity))) throw fail(400, 'Cantidad de empaque inválida');
    if (!usesPackaging(orderType) && c.quantity !== 0) throw fail(400, 'Los pedidos de mesa no incluyen desechables');
  }
}

// Caller owns the transaction and has locked the order. Each ledger entry is
// attributed to an item so its historical cost changes by the same amount.
async function reconcilePackaging(tx, state, counts) {
  validateCounts(state, counts);
  if (state.pending || state.transferred) throw fail(409, publicState(state).message);
  if (!state.order.locationId) throw fail(409, 'El pedido no tiene sucursal');
  const cfg = await tx.restaurantConfig.findUnique({ where: { restaurantId: state.order.restaurantId }, select: { blockOnInsufficientStock: true } });
  const costChanges = new Map();
  for (const c of [...counts].sort((a, b) => a.ingredientId.localeCompare(b.ingredientId))) {
    const ingredient = state.ingredients.find(i => i.id === c.ingredientId);
    const previous = state.actual.get(c.ingredientId) || { quantity: 0, cost: 0 };
    const delta = round(c.quantity - previous.quantity);
    if (Math.abs(delta) < 1e-8) continue;
    const oldRows = [...state.perItem.values()].filter(r => r.ingredientId === ingredient.id && r.quantity > 1e-8);
    // A newly added shared container is attributed to the first item; once
    // allocated, further corrections preserve its item attribution.
    const allocations = delta > 0
      ? [{ itemId: oldRows[0]?.itemId || state.order.items[0]?.id, quantity: delta, unitCost: Number(ingredient.cost || 0) }]
      : oldRows.map(r => ({ itemId: r.itemId, quantity: delta * r.quantity / previous.quantity, unitCost: r.cost / r.quantity }));
    if (!allocations.length || !allocations[0].itemId) throw fail(409, 'El pedido no tiene productos');
    for (const allocation of allocations) {
      const needed = allocation.quantity;
      const changed = await tx.ingredient.updateMany({
        where: { id: ingredient.id, restaurantId: state.order.restaurantId,
          ...(cfg?.blockOnInsufficientStock && needed > 0 ? { stock: { gte: needed } } : {}) },
        data: { stock: { decrement: needed } },
      });
      if (!changed.count) throw fail(409, `Sin stock suficiente de ${ingredient.name}`);
      const updated = await tx.ingredient.findFirst({ where: { id: ingredient.id, restaurantId: state.order.restaurantId } });
      await tx.stockMovement.create({ data: {
        ingredientId: ingredient.id, locationId: updated.locationId || state.order.locationId,
        delta: -needed, unit: ingredient.baseUnit, reason: 'ADJUSTMENT', refType: 'order', refId: state.order.id,
        balanceAfter: Number(updated.stock), unitCostAtMove: allocation.unitCost,
        notes: `Empaque orderItem ${allocation.itemId}`,
      } });
      costChanges.set(allocation.itemId, (costChanges.get(allocation.itemId) || 0) + needed * allocation.unitCost);
    }
  }
  for (const [id, costChange] of costChanges) {
    const item = state.order.items.find(i => i.id === id);
    const next = Number(item.costSnapshot) + costChange / multiplier(item);
    if (!Number.isFinite(next) || next < -0.0001) throw fail(409, 'El costo del pedido requiere revisión');
    await tx.orderItem.update({ where: { id, orderId: state.order.id }, data: { costSnapshot: Math.max(0, Number(next.toFixed(4))) } });
  }
}

async function lockOrder(tx, orderId, restaurantId, locationId) {
  const locked = await tx.order.updateMany({ where: { id: orderId, restaurantId, ...(locationId ? { locationId } : {}) }, data: { updatedAt: new Date() } });
  if (!locked.count) throw fail(404, 'Pedido no encontrado');
}

async function setPackaging(prisma, orderId, restaurantId, locationId, revision, counts) {
  return prisma.$transaction(async tx => {
    await lockOrder(tx, orderId, restaurantId, locationId);
    const state = await readPackaging(tx, orderId, restaurantId, locationId);
    if (['CANCELLED', 'DELIVERED'].includes(state.order.status)) throw fail(409, 'El pedido está cerrado');
    validateCounts(state, counts);
    const same = counts.every(c => Math.abs(c.quantity - (state.actual.get(c.ingredientId)?.quantity || 0)) < 1e-8);
    if (revision !== state.revision && !same) throw fail(409, 'El pedido cambió. Actualiza los empaques antes de guardar.');
    await reconcilePackaging(tx, state, counts);
    return publicState(await readPackaging(tx, orderId, restaurantId, locationId));
  }, { timeout: 30000 });
}

async function changePackagingType(tx, order, type) {
  if (usesPackaging(order.orderType) === usesPackaging(type)) return;
  const state = await readPackaging(tx, order.id, order.restaurantId, order.locationId);
  // Pending inventory will use the persisted new type when its transaction
  // obtains the order lock. Reconcile only already-applied items here.
  if (state.pending && state.order.items.every(i => i.costSnapshot == null)) return;
  let counts;
  if (!usesPackaging(type)) counts = state.entries.map(e => ({ ingredientId: e.ingredientId, quantity: 0 }));
  else {
    const quantities = new Map();
    for (const item of order.items || state.order.items) {
      const { flatItems } = await resolveOrderLineItems(tx, item, order.restaurantId);
      for (const row of flatItems.filter(r => r.ingredient.isPackaging)) {
        quantities.set(row.ingredient.id, (quantities.get(row.ingredient.id) || 0) + row.qtyToConsumePerUnit * multiplier(item));
      }
    }
    counts = [...quantities].map(([ingredientId, quantity]) => ({ ingredientId, quantity }));
  }
  state.order.orderType = type;
  await reconcilePackaging(tx, state, counts);
}

module.exports = { readPackaging, publicState, setPackaging, reconcilePackaging, changePackagingType, lockOrder, validateCounts };
