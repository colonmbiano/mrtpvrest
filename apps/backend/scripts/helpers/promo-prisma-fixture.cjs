'use strict';
const assert = require('node:assert/strict');
const { createPrismaPromoAdapter } = require('../../src/lib/promo-adapter-prisma');
const NOW = new Date('2026-10-22T12:00:00Z');
const DAY = 86400000;

function matches(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some(clause => matches(row, clause));
    const value = row?.[key];
    if (expected === null || typeof expected !== 'object' || expected instanceof Date) return value === expected;
    if ('is' in expected) return value != null && matches(value, expected.is);
    return Object.entries(expected).every(([operator, bound]) => ({
      in: () => bound.includes(value), notIn: () => !bound.includes(value),
      gt: () => value > bound, gte: () => value >= bound, lt: () => value < bound, lte: () => value <= bound,
    })[operator]());
  });
}
const project = (row, select) => Object.fromEntries(Object.keys(select).map(key => [key, structuredClone(row[key])]));

function fixture() {
  let state = {
    restaurant: [{ id: 'r1', tenantId: 'tenant1' }, { id: 'r2', tenantId: 'tenant2' }],
    location: ['A', 'B', 'C', 'OFF'].map(id => ({ id, restaurantId: id === 'C' ? 'r2' : 'r1', isActive: id !== 'OFF',
      locationPromoEnabled: true, autoPromoEnabled: false, autoPromoThreshold: 10, autoPromoDiscount: 25,
      autoPromoMaxItems: 0, autoPromoActiveDays: ['FRIDAY'], autoPromoVersion: 0 })),
    menuItem: [
      { id: 'm1', restaurantId: 'r1', price: 100 }, { id: 'm2', restaurantId: 'r1', price: 200 },
      { id: 'manual', restaurantId: 'r1', price: 80, isPromo: true, promoPrice: 60 },
      { id: 'hidden', restaurantId: 'r1', price: 100, isAvailable: false },
      { id: 'inactive-category', restaurantId: 'r1', price: 100, categoryActive: false },
      { id: 'free', restaurantId: 'r1', price: 0 }, { id: 'foreign', restaurantId: 'r2', price: 999 },
    ].map(row => ({ isAvailable: true, isPromo: false, promoPrice: null, activeDays: [], categoryActive: true, ...row })),
    locationMenuItemPromo: [], order: [], orderItem: [],
  };
  function order(id, locationId, extra = {}, quantity = 10, menuItemId = 'm1') {
    state.order.push({ id, locationId, restaurantId: locationId === 'C' ? 'r2' : 'r1', status: 'DELIVERED',
      paymentStatus: 'PAID', refundedAmount: 0, createdAt: new Date(NOW - DAY), ...extra });
    state.orderItem.push({ id: `line-${id}`, orderId: id, menuItemId, quantity, price: 1 });
  }
  order('paid-A', 'A', {}, 2); order('paid-B', 'B', {}, 100);
  order('foreign', 'C', {}, 1000, 'foreign');
  order('cancelled', 'A', { status: 'CANCELLED' });
  order('pending', 'A', { paymentStatus: 'PENDING' });
  order('refund', 'A', { refundedAmount: 1 });
  order('old', 'A', { createdAt: new Date(NOW - 7 * DAY - 1) });
  order('begin', 'A', { createdAt: new Date(NOW - 7 * DAY) }, 1);
  order('end', 'A', { createdAt: new Date(NOW) });
  const calls = [];
  let queued = Promise.resolve();
  const hooks = {};
  function materialize(model, row) {
    if (model === 'menuItem') return { ...row, category: { restaurantId: row.restaurantId, isActive: row.categoryActive } };
    if (model === 'orderItem') return { ...row,
      menuItem: state.menuItem.find(item => item.id === row.menuItemId), order: state.order.find(order => order.id === row.orderId) };
    return row;
  }
  function client(isRoot) {
    const api = {};
    for (const name of ['restaurant', 'location', 'menuItem', 'locationMenuItemPromo']) {
      api[name] = {
        async findMany(args) {
          calls.push({ model: name, method: 'findMany', args });
          let rows = state[name].map(row => materialize(name, row)).filter(row => matches(row, args.where));
          if (args.orderBy) rows.sort((a, b) => a.id < b.id ? -1 : 1);
          if (args.take !== undefined) rows = rows.slice(0, args.take);
          return rows.map(row => project(row, args.select));
        },
        async findFirst(args) { const rows = await api[name].findMany(args); return rows[0] || null; },
        async updateMany(args) {
          calls.push({ model: name, method: 'updateMany', args });
          assert.notEqual(name, 'menuItem', 'Global MenuItem mutation is forbidden');
          if (hooks.beforeWrite) await hooks.beforeWrite(name, args, state);
          let count = 0;
          for (const row of state[name]) if (matches(row, args.where)) {
            for (const [key, value] of Object.entries(args.data)) row[key] = typeof value === 'object' && value && 'increment' in value
              ? row[key] + value.increment : structuredClone(value);
            count++;
          }
          return { count };
        },
        async createMany(args) {
          calls.push({ model: name, method: 'createMany', args });
          assert.equal(name, 'locationMenuItemPromo'); assert.equal(args.skipDuplicates, true);
          if (hooks.beforeCreate) await hooks.beforeCreate(args, state);
          let count = 0;
          for (const row of args.data) if (!state[name].some(old => old.locationId === row.locationId && old.menuItemId === row.menuItemId)) {
            state[name].push(structuredClone(row)); count++;
          }
          return { count };
        },
      };
    }
    api.orderItem = { async groupBy(args) {
      calls.push({ model: 'orderItem', method: 'groupBy', args });
      const sum = new Map();
      for (const row of state.orderItem.map(row => materialize('orderItem', row)).filter(row => matches(row, args.where))) {
        sum.set(row.menuItemId, (sum.get(row.menuItemId) || 0) + row.quantity);
      }
      return [...sum].map(([menuItemId, quantity]) => ({ menuItemId, _sum: { quantity } }));
    } };
    api.$queryRaw = async (strings, ...values) => {
      const sql = strings.join('?'); calls.push({ method: '$queryRaw', sql, values });
      assert.match(sql, /FOR SHARE/);
      if (hooks.onLock) await hooks.onLock(sql, values, state);
      const rows = sql.includes('"locations"') ? state.location : state.menuItem;
      return rows.filter(row => row.id === values[0] && row.restaurantId === values[1]
        && (!sql.includes('"isActive"') || row.isActive)).map(({ id }) => ({ id }));
    };
    if (isRoot) api.$transaction = async (work, options) => {
      const previous = queued; let release; queued = new Promise(resolve => { release = resolve; }); await previous;
      calls.push({ method: '$transaction', options });
      const before = structuredClone(state);
      try { return await work(client(false)); } catch (error) { state = before; throw error; } finally { release(); }
    };
    return api;
  }
  const prisma = client(true);
  return { prisma, calls, hooks, get state() { return state; },
    adapter: createPrismaPromoAdapter({ prismaClient: prisma, restaurantId: 'r1' }) };
}

module.exports = { fixture, NOW, DAY };
