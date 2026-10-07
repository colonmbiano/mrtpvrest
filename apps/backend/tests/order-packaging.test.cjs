'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { discountInventory, assertStockAvailable, restoreInventoryForCancelledOrder } = require('../src/services/order-inventory.service');
const { readPackaging, publicState, setPackaging, changePackagingType } = require('../src/services/order-packaging.service');
const { createRecipeCosting } = require('../src/services/recipe-costing.service');

function fixture(orderType = 'TAKEOUT') {
  const state = {
    order: { id: 'o1', restaurantId: 'r1', locationId: 'l1', orderType, status: 'PREPARING' },
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
    recipe: { findMany: async () => [{ id: 'recipe', variantId: null }] },
    recipeItem: { findMany: async () => state.ingredients.slice(0, 3).map(i => ({ ingredientId: i.id, ingredient: i, quantity: i.id === 'food' ? 100 : 1, recipeId: 'recipe' })) },
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
    apply: () => discountInventory(db, state.items, 'o1', 'r1', 'l1'),
    read: async () => publicState(await readPackaging(db, 'o1', 'r1', 'l1')),
    save: (revision, packaging) => setPackaging(db, 'o1', 'r1', 'l1', revision, packaging) };
}

test('mesa descuenta alimentos, excluye desechables y no bloquea por su stock', async () => {
  const f = fixture('DINE_IN');
  f.state.ingredients.find(i => i.id === 'box').stock = 0;
  await assertStockAvailable(f.db, f.state.items, 'r1', 'DINE_IN');
  await f.apply();
  assert.equal(f.stock('food'), 4800);
  assert.equal(f.stock('box'), 0);
  assert.equal(f.stock('paper'), 100);
  assert.equal(f.state.items[0].costSnapshot, 10);
  assert.equal((await f.read()).packagingCost, 0);
  await assert.rejects(f.save((await f.read()).revision, [{ ingredientId: 'bag', quantity: 1 }]), /mesa/);
});
test('llevar y domicilio conservan el empaque de receta', async () => {
  for (const type of ['TAKEOUT', 'DELIVERY']) {
    const f = fixture(type); await f.apply();
    assert.equal(f.stock('box'), 98); assert.equal(f.state.items[0].costSnapshot, 11.04);
    assert.equal((await f.read()).packagingCost, 2.08);
  }
});
test('dos volcanes comparten charola y bolsa; reintentar no duplica stock ni costo', async () => {
  const f = fixture(); await Promise.all([f.apply(), f.apply()]);
  assert.equal(f.stock('food'), 4800);
  const before = await f.read();
  const counts = [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }, { ingredientId: 'bag', quantity: 1 }];
  await Promise.all([f.save(before.revision, counts), f.save(before.revision, counts)]);
  assert.equal(f.stock('box'), 100); assert.equal(f.stock('tray'), 99); assert.equal(f.stock('bag'), 99); assert.equal(f.stock('paper'), 98);
  assert.equal((await f.read()).packagingCost, 2.2338);
  assert.ok(Math.abs(f.state.items[0].costSnapshot * 2 - 22.2338) < 0.00011);
  await assert.rejects(f.save(before.revision, [{ ingredientId: 'tray', quantity: 2 }]), /cambió/);
});
test('descuento y ajuste revierten juntos si no alcanza stock', async () => {
  const f = fixture(); await f.apply(); f.state.block = true;
  f.state.ingredients.find(i => i.id === 'tray').stock = 0;
  const before = await f.read();
  await assert.rejects(f.save(before.revision, [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }]), /stock/);
  assert.equal(f.stock('box'), 98); assert.equal(f.state.items[0].costSnapshot, 11.04);
});
test('cancelación repone solo consumo neto, incluidos ajustes de empaque', async () => {
  const f = fixture(); await f.apply();
  await f.save((await f.read()).revision, [{ ingredientId: 'box', quantity: 0 }, { ingredientId: 'tray', quantity: 1 }]);
  f.state.order.status = 'CANCELLED';
  await Promise.all([restoreInventoryForCancelledOrder(f.db, 'o1', 'r1'), restoreInventoryForCancelledOrder(f.db, 'o1', 'r1')]);
  assert.equal(f.stock('food'), 5000); assert.equal(f.stock('box'), 100); assert.equal(f.stock('tray'), 100); assert.equal(f.stock('paper'), 100);
  await f.apply(); assert.equal(f.stock('food'), 5000);
});
test('cambiar entre mesa y llevar reconcilia solo empaques', async () => {
  const f = fixture(); await f.apply();
  await f.db.$transaction(async tx => { await changePackagingType(tx, f.state.order, 'DINE_IN'); f.state.order.orderType = 'DINE_IN'; });
  assert.equal(f.stock('box'), 100); assert.equal(f.state.items[0].costSnapshot, 10);
  await f.db.$transaction(async tx => { await changePackagingType(tx, f.state.order, 'TAKEOUT'); f.state.order.orderType = 'TAKEOUT'; });
  assert.equal(f.stock('box'), 98); assert.equal(f.stock('food'), 4800); assert.equal(f.state.items[0].costSnapshot, 11.04);
});
test('rechaza otro tenant, otra sucursal, insumos de comida, fracciones de pieza y pedidos cerrados', async () => {
  const f = fixture(); await f.apply(); const r = (await f.read()).revision;
  for (const counts of [[{ ingredientId: 'foreign', quantity: 1 }], [{ ingredientId: 'food', quantity: 1 }], [{ ingredientId: 'box', quantity: 0.5 }], [{ ingredientId: 'bag', quantity: 1 }, { ingredientId: 'bag', quantity: 2 }]]) {
    await assert.rejects(f.save(r, counts));
  }
  await assert.rejects(readPackaging(f.db, 'o1', 'other', 'l1'), /no encontrado/);
  await assert.rejects(setPackaging(f.db, 'o1', 'r1', 'other', r, []), /no encontrado/);
  f.state.order.status = 'DELIVERED'; await assert.rejects(f.save(r, []), /cerrado/);
});
test('subreceta con empaque no entra al costo de mesa; la salsa sí', () => {
  const f = fixture();
  const c = createRecipeCosting(f.state.ingredients, [{ id: 'dip', yieldQty: 1, yieldUnit: 'PIECE', items: [
    { ingredientId: 'food', qty: 100, unit: 'GRAM' }, { ingredientId: 'box', qty: 1, unit: 'PIECE' },
  ] }]);
  const recipe = { items: [{ subRecipeId: 'dip', quantity: 1, unit: 'PIECE' }] };
  assert.equal(c.packagingPreview([{ recipe, quantity: 2 }], [], 'DINE_IN').totalCost, 20);
  assert.throws(() => c.packagingPreview([{ recipe, quantity: 2 }], [{ ingredientId: 'box', quantity: 1 }], 'DINE_IN'), /mesa/);
});

test('mesa excluye empaques en combos, subrecetas y extras; rondas solo descuentan lo nuevo', async () => {
  const f = fixture('DINE_IN');
  f.db.comboSelection.findMany = async () => [{ optionMenuItemId: 'component' }];
  f.db.recipeItem.findMany = async () => [{ subRecipeId: 'dip', quantity: 1, recipeId: 'recipe' }];
  f.db.subRecipe = { findFirst: async ({ where }) => {
    assert.equal(where.restaurantId, 'r1');
    return { yieldQty: 1, items: [
      { ingredientId: 'food', ingredient: f.state.ingredients[0], qty: 100 },
      { ingredientId: 'box', ingredient: f.state.ingredients[1], qty: 1 },
    ] };
  } };
  f.db.orderItemModifier.findMany = async () => [{ name: 'Extra' }];
  f.db.modifierIngredient = { findMany: async () => [
    { ingredientId: 'paper', ingredient: f.state.ingredients[2], quantity: 1 },
  ] };
  await f.apply();
  f.state.items.push({ id: 'oi2', orderId: 'o1', menuItemId: 'm1', quantity: 1, costSnapshot: null });
  await f.apply();
  assert.equal(f.stock('food'), 4700); assert.equal(f.stock('box'), 100); assert.equal(f.stock('paper'), 100);
});

test('se detiene el ajuste si se movieron productos a otra cuenta', async () => {
  const f = fixture(); await f.apply();
  f.state.items[0].id = 'split-item';
  const view = await f.read(); assert.equal(view.editable, false);
  await assert.rejects(f.save(view.revision, [{ ingredientId: 'box', quantity: 0 }]), /dividida/);
});
