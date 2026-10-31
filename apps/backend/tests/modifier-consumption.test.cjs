'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveModifierIngredients } = require('../src/lib/modifier-consumption');
const { resolveOrderLineItems, assertStockAvailable, consumePaidOrder } = require('../src/services/order-inventory.service');

// Synthetic catalog: no production IDs, prices or sales.
function fixture() {
  const meat = { id: 'meat', restaurantId: 'r', name: 'Protein', stock: 10000, cost: 0.1, baseUnit: 'GRAM' };
  const second = { ...meat, id: 'second', name: 'Second protein' };
  const rows = [
    { name: 'Protein', menuItemId: null, ingredientId: meat.id, ingredient: meat, quantity: 50 },
    { name: 'Protein', menuItemId: 'small', ingredientId: meat.id, ingredient: meat, quantity: 80 },
    { name: 'Protein', menuItemId: 'large', ingredientId: meat.id, ingredient: meat, quantity: 120 },
    { name: 'Protein', menuItemId: 'bundle', ingredientId: meat.id, ingredient: meat, quantity: 80 },
    { name: 'Mix', menuItemId: 'bundle', ingredientId: meat.id, ingredient: meat, quantity: 40 },
    { name: 'Mix', menuItemId: 'bundle', ingredientId: second.id, ingredient: second, quantity: 40 },
  ];
  const definitions = [
    { id: 'q1', menuItemId: 'bundle', group: { groupType: 'QUANTITY', maxSelection: 10 } },
    { id: 'q2', menuItemId: 'bundle', group: { groupType: 'QUANTITY', maxSelection: 10 } },
    { id: 'add', menuItemId: 'small', group: { groupType: 'ADD', maxSelection: 1 } },
  ];
  const state = { rows, meat, second, selections: [], movements: [], queries: [], item: {
    id: 'oi', menuItemId: 'bundle', name: 'Bundle', quantity: 2, costSnapshot: null,
  } };
  const db = {
    modifier: { findMany: async ({ where }) => {
      assert.equal(where.group.menuItem.restaurantId, 'r');
      return definitions.filter(d => where.id.in.includes(d.id) && d.menuItemId === where.group.menuItemId);
    } },
    modifierIngredient: { findMany: async ({ where }) => {
      state.queries.push(where);
      assert.equal(where.restaurantId, 'r');
      return rows.filter(r => where.name.in.includes(r.name) && where.OR.some(s => s.menuItemId === r.menuItemId));
    } },
    comboSelection: { findMany: async () => [] },
    recipe: { findMany: async () => [] },
    recipeItem: { findMany: async () => [] },
    orderItemModifier: { findMany: async () => state.selections },
    menuItem: { findMany: async () => [] },
    restaurantConfig: { findUnique: async () => ({ blockOnInsufficientStock: true }) },
    ingredient: {
      findMany: async () => [meat, second],
      findFirst: async ({ where }) => [meat, second].find(i => i.id === where.id),
      updateMany: async ({ where, data }) => {
        const ing = [meat, second].find(i => i.id === where.id);
        if (where.stock && ing.stock < where.stock.gte) return { count: 0 };
        ing.stock -= data.stock.decrement; return { count: 1 };
      },
    },
    stockMovement: { create: async ({ data }) => state.movements.push(data) },
    orderItem: { update: async ({ data }) => Object.assign(state.item, data) },
    order: {
      updateMany: async () => ({ count: 1 }),
      findFirst: async () => ({ id: 'o', restaurantId: 'r', locationId: 'l', orderType: 'DINE_IN',
        paymentStatus: 'PAID', status: 'CONFIRMED', items: [state.item] }),
    },
  };
  return { state, db, resolve: (menu, mods, expand = async () => []) => resolveModifierIngredients(db, 'r', menu, mods, expand) };
}

test('same name uses product portions, with global fallback but no addition', async () => {
  const f = fixture();
  for (const [menu, expected] of [['small', 80], ['large', 120], ['other', 50]]) {
    const items = await f.resolve(menu, [{ name: 'Protein' }]);
    assert.equal(items.length, 1); assert.equal(items[0].qtyToConsumePerUnit, expected);
  }
});
test('quantity bundles multiply each selected recipe and each sold bundle exactly once', async () => {
  const f = fixture();
  f.state.selections = [{ modifierId: 'q1', name: '4 Protein' }, { modifierId: 'q2', name: '6 Mix' }];
  const flat = (await resolveOrderLineItems(f.db, f.state.item, 'r')).flatItems;
  assert.equal(flat.filter(i => i.ingredient.id === 'meat').reduce((n, i) => n + i.qtyToConsumePerUnit, 0), 560);
  assert.equal(flat.find(i => i.ingredient.id === 'second').qtyToConsumePerUnit, 240);
  const line = { ...f.state.item, _modifiers: f.state.selections };
  f.state.meat.stock = 1119;
  await assert.rejects(assertStockAvailable(f.db, [line], 'r'), { code: 'INSUFFICIENT_STOCK' });
  f.state.meat.stock = 1120; f.state.second.stock = 480;
  await assertStockAvailable(f.db, [line], 'r');
  await consumePaidOrder(f.db, 'o', 'r');
  assert.equal(f.state.meat.stock, 0); assert.equal(f.state.second.stock, 0);
  assert.equal(f.state.item.costSnapshot, 80);
  assert.deepEqual(f.state.movements.map(m => m.delta).sort((a,b) => a-b), [-1120, -480]);
  await consumePaidOrder(f.db, 'o', 'r');
  assert.equal(f.state.movements.length, 2);
});
test('numeric ADD labels and missing or foreign modifier IDs are never parsed as quantities', async () => {
  const f = fixture();
  f.state.rows.push({ ...f.state.rows[0], name: '2 Protein', quantity: 17 });
  for (const modifierId of ['add', null, 'q1']) {
    const result = await f.resolve('small', [{ modifierId, name: '2 Protein' }]);
    assert.equal(result[0].qtyToConsumePerUnit, 17);
  }
});
test('old uncompressed selections still count separately and removed ingredients consume nothing', async () => {
  const f = fixture();
  const mods = Array.from({ length: 4 }, () => ({ modifierId: 'q1', name: 'Protein' }));
  const result = await f.resolve('bundle', mods);
  assert.equal(result.reduce((n,i) => n+i.qtyToConsumePerUnit,0), 320);
  assert.deepEqual(await f.resolve('small', [{ name: 'Sin Protein' }]), []);
});
test('subrecipes receive quantity and wastage once, in the restaurant scope', async () => {
  const f = fixture(); let called;
  f.state.rows.push({ name: 'Sauce', menuItemId: 'bundle', subRecipeId: 'sub', quantity: 15, wastagePercent: 10 });
  const result = await f.resolve('bundle', [{ modifierId: 'q1', name: '4 Sauce' }], async (...args) => {
    called = args; return [{ ingredient: f.state.meat, qtyToConsume: args[2] / 2 }];
  });
  assert.equal(called[1], 'sub'); assert.equal(called[2], 66); assert.equal(called[3], 'r');
  assert.equal(result[0].qtyToConsumePerUnit, 33);
});
test('invalid quantities and foreign ingredients fail before consumption', async () => {
  const f = fixture();
  for (const name of ['0 Protein', '11 Protein', '999999999999999999 Protein']) {
    await assert.rejects(f.resolve('bundle', [{ modifierId: 'q1', name }]), /Cantidad/);
  }
  f.state.meat.restaurantId = 'other';
  await assert.rejects(f.resolve('small', [{ name: 'Protein' }]), /restaurante/);
});
