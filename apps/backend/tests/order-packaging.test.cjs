'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { consumePaidOrder, discountInventory, assertStockAvailable, restoreInventoryForCancelledOrder } = require('../src/services/order-inventory.service');
const { readPackaging, publicState, setPackaging, changePackagingType } = require('../src/services/order-packaging.service');
const { createRecipeCosting } = require('../src/services/recipe-costing.service');

function fixture(orderType = 'TAKEOUT') {
  const state = {
    order: { id: 'o1', restaurantId: 'r1', locationId: 'l1', orderType, status: 'PREPARING', paymentStatus: 'PENDING' },
    extras: [],
    items: [{ id: 'oi1', orderId: 'o1', menuItemId: 'm1', name: 'Volcán', quantity: 2, costSnapshot: null }],
    ingredients: [
      { id: 'food', restaurantId: 'r1', locationId: 'l1', name: 'Carne', stock: 5000, cost: 0.1, baseUnit: 'GRAM' },
      { id: 'box', restaurantId: 'r1', locationId: 'l1', name: 'Hamburguesero', stock: 100, cost: 1, baseUnit: 'PIECE', isPackaging: true },
      { id: 'paper', restaurantId: 'r1', locationId: 'l1', name: 'Papel', stock: 100, cost: 0.04, baseUnit: 'PIECE', isPackaging: true },
      { id: 'tray', restaurantId: 'r1', locationId: 'l1', name: '7x7', stock: 100, cost: 1.6538, baseUnit: 'PIECE', isPackaging: true },
      { id: 'bag', restaurantId: 'r1', locationId: 'l1', name: 'Bolsa', stock: 100, cost: 0.5, baseUnit: 'PIECE', isPackaging: true },
    ], movements: [], block: false,
  };
  const matches = (row, where = {}) => Object.entries(where).every(([k, v]) => {
    if (k === 'ingredient') return matches(state.ingredients.find(i => i.id === row.ingredientId), v);
    if (v && typeof v === 'object') return v.in ? v.in.includes(row[k]) : v.gte != null ? row[k] >= v.gte : true;
    return row[k] === v;
  });
  function mutate(row, data) {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'decrement' in value) row[key] -= value.decrement;
      else if (value && typeof value === 'object' && 'increment' in value) row[key] += value.increment;
      else row[key] = value;
    }
    return { ...row };
  }
  const db = {
    menuItem: { findMany: async ({ where }) => state.extras.filter(id => where.id.in.includes(id)).map(id => ({ id })) },
    order: {
      updateMany: async ({ where, data }) => matches(state.order, where) ? (mutate(state.order, data), { count: 1 }) : { count: 0 },
      findFirst: async ({ where, include }) => matches(state.order, where) ? { ...state.order, ...(include?.items ? { items: state.items.map(i => ({ ...i })) } : {}) } : null,
    },
    orderItem: {
      findMany: async ({ where }) => state.items.filter(i => matches(i, where)).map(i => ({ ...i })),
      update: async ({ where, data }) => mutate(state.items.find(i => matches(i, where)), data),
    },
    ingredient: {
      findMany: async ({ where }) => state.ingredients.filter(i => matches(i, where)).map(i => ({ ...i })),
      findFirst: async ({ where }) => ({ ...state.ingredients.find(i => matches(i, where)) }),
      update: async ({ where, data }) => mutate(state.ingredients.find(i => matches(i, where)), data),
      updateMany: async ({ where, data }) => { const row = state.ingredients.find(i => matches(i, where)); return row ? (mutate(row, data), { count: 1 }) : { count: 0 }; },
    },
    stockMovement: {
      findMany: async ({ where }) => state.movements.filter(i => matches(i, where)).map(i => ({ ...i })),
      create: async ({ data }) => { const row = { id: `move-${state.movements.length}`, ...data }; state.movements.push(row); return row; },
    },
    recipe: { findMany: async ({ where }) => [{ id: where.menuItemId === 'extra' ? 'extraRecipe' : 'recipe', variantId: null }] },
    recipeItem: { findMany: async ({ where }) => (where.recipeId === 'extraRecipe' ? state.ingredients.filter(i => i.id === 'tray') : state.ingredients.slice(0, 3)).map(i => ({ ingredientId: i.id, ingredient: i, quantity: i.id === 'food' ? 100 : 1, recipeId: 'recipe' })) },
    comboSelection: { findMany: async () => [] },
    orderItemModifier: { findMany: async () => [] },
    restaurantConfig: { findUnique: async () => ({ blockOnInsufficientStock: state.block }) },
  };
  let queue = Promise.resolve();
  db.$transaction = work => {
    const run = queue.then(async () => {
      const backup = structuredClone(state);
      try { return await work(db); } catch (error) { Object.assign(state, backup); throw error; }
    });
    queue = run.catch(() => {});
    return run;
  };
  return { state, db, stock: id => state.ingredients.find(i => i.id === id).stock,
    pay: () => db.$transaction(async tx => { state.order.paymentStatus = 'PAID'; await consumePaidOrder(tx, 'o1', 'r1'); }),
    apply: () => discountInventory(db, state.items, 'o1', 'r1', 'l1'),
    read: async () => publicState(await readPackaging(db, 'o1', 'r1', 'l1')),
    save: (revision, packaging) => setPackaging(db, 'o1', 'r1', 'l1', revision, packaging) };
}

test('abrir mesa, agregar rondas y guardar empaques no consumen stock', async () => {
  const f = fixture(); await f.apply();
  await f.save((await f.read()).revision, [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }]);
  assert.equal(f.state.movements.length, 0); assert.equal(f.stock('food'), 5000);
  assert.equal(f.state.items[0].costSnapshot, null); assert.equal((await f.read()).editable, true);
});
test('al cobrar mesa se consume comida sin desechables', async () => {
  const f = fixture('DINE_IN'); f.state.ingredients[1].stock = 0;
  await assertStockAvailable(f.db, f.state.items, 'r1', 'DINE_IN');
  await f.pay(); assert.equal(f.stock('food'), 4800); assert.equal(f.stock('box'), 0);
  assert.equal(f.state.items[0].costSnapshot, 10); assert.equal((await f.read()).packagingCost, 0);
});
test('llevar y domicilio conservan empaques de receta sin plan manual', async () => {
  for (const type of ['TAKEOUT', 'DELIVERY']) {
    const f = fixture(type); await f.pay();
    assert.equal(f.stock('box'), 98); assert.equal(f.stock('paper'), 98);
    assert.equal(f.state.items[0].costSnapshot, 11.04);
  }
});
test('plan agrupa dos volcanes en charola; cobros concurrentes no duplican consumo', async () => {
  const f = fixture(); const before = await f.read();
  const counts = [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }, { ingredientId: 'bag', quantity: 1 }];
  await Promise.all([f.save(before.revision, counts), f.save(before.revision, counts)]);
  await Promise.all([f.pay(), f.pay()]); await f.apply();
  assert.equal(f.stock('box'), 100); assert.equal(f.stock('tray'), 99); assert.equal(f.stock('bag'), 99);
  assert.equal(f.stock('food'), 4800); assert.equal(f.stock('paper'), 98);
  assert.ok(Math.abs(f.state.items[0].costSnapshot * 2 - 22.2338) < 0.00011);
  await assert.rejects(f.save((await f.read()).revision, counts), /cobrado/);
});
test('extra vendido en mesa consume solo su contenedor, además de comida una sola vez', async () => {
  const f = fixture('DINE_IN'); f.state.extras.push('extra');
  f.state.items.push({ id: 'oi2', orderId: 'o1', menuItemId: 'extra', quantity: 1, costSnapshot: null });
  const preview = await f.read(); assert.equal(preview.entries[0].extraQuantity, 1);
  assert.equal(preview.packagingCost, 1.6538);
  await f.pay(); await f.pay();
  assert.equal(f.stock('food'), 4800); assert.equal(f.stock('box'), 100); assert.equal(f.stock('tray'), 99);
  assert.equal(f.state.items[1].costSnapshot, 1.6538);
});
test('ajustar empaque incluido a cero no elimina el extra vendido', async () => {
  const f = fixture(); f.state.extras.push('extra');
  f.state.items.push({ id: 'oi2', orderId: 'o1', menuItemId: 'extra', quantity: 1, costSnapshot: null });
  await f.save((await f.read()).revision, [{ ingredientId: 'tray', quantity: 0 }, { ingredientId: 'box', quantity: 0 }]);
  await f.pay(); assert.equal(f.stock('tray'), 99); assert.equal(f.stock('box'), 100);
});
test('falta de stock revierte pago, consumo y costos juntos', async () => {
  const f = fixture(); f.state.block = true; f.state.ingredients[1].stock = 0;
  await assert.rejects(f.pay(), /stock/);
  assert.equal(f.state.order.paymentStatus, 'PENDING'); assert.equal(f.stock('food'), 5000);
  assert.equal(f.state.movements.length, 0); assert.equal(f.state.items[0].costSnapshot, null);
});
test('pago externo confirmado registra consumo aunque la existencia sea insuficiente', async () => {
  const f = fixture(); f.state.block = true; f.state.ingredients[1].stock = 0;
  await f.db.$transaction(async tx => { f.state.order.paymentStatus = 'PAID'; await consumePaidOrder(tx, 'o1', 'r1', { confirmedExternalPayment: true }); });
  assert.equal(f.stock('box'), -2); assert.equal(f.stock('food'), 4800);
});
test('cancelación devuelve el consumo real del plan y extras sin duplicar reposición', async () => {
  const f = fixture(); await f.save((await f.read()).revision, [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }]);
  await f.pay(); f.state.order.status = 'CANCELLED';
  await Promise.all([restoreInventoryForCancelledOrder(f.db, 'o1', 'r1'), restoreInventoryForCancelledOrder(f.db, 'o1', 'r1')]);
  await f.apply(); assert.equal(f.stock('food'), 5000); assert.equal(f.stock('tray'), 100); assert.equal(f.stock('paper'), 100);
});
test('cambios en rondas invalidan el plan anterior y recalculan receta al cobrar', async () => {
  const f = fixture(); await f.save((await f.read()).revision, [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }]);
  f.state.items[0].quantity = 3;
  assert.match((await f.read()).message, /recalcularon/);
  await f.pay(); assert.equal(f.stock('box'), 97); assert.equal(f.stock('tray'), 100);
});
test('consumo legado ya registrado no se duplica al pagar', async () => {
  const f = fixture(); f.state.items[0].costSnapshot = 11.04;
  await f.pay(); assert.equal(f.stock('food'), 5000); assert.equal(f.state.movements.length, 0);
});
test('rechaza otro tenant, sucursal, comida, piezas fraccionadas y revisión obsoleta', async () => {
  const f = fixture(); const r = (await f.read()).revision;
  for (const counts of [[{ ingredientId: 'foreign', quantity: 1 }], [{ ingredientId: 'food', quantity: 1 }], [{ ingredientId: 'box', quantity: 0.5 }], [{ ingredientId: 'bag', quantity: 1 }, { ingredientId: 'bag', quantity: 2 }]]) await assert.rejects(f.save(r, counts));
  await assert.rejects(readPackaging(f.db, 'o1', 'other', 'l1'), /no encontrado/);
  await assert.rejects(setPackaging(f.db, 'o1', 'r1', 'other', r, []), /no encontrado/);
  await f.save(r, [{ ingredientId: 'box', quantity: 1 }]);
  await assert.rejects(f.save(r, [{ ingredientId: 'box', quantity: 0 }]), /cambió/);
});
