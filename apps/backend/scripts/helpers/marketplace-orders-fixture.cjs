'use strict';

const assert = require('node:assert/strict');
const { createMarketplaceOrdersService } = require('../../src/lib/marketplace-orders');
const NOW = new Date('2026-10-22T12:00:00.000Z');
const PIN_SECRET = 'offline-fixture-pin-key-with-at-least-32-bytes';

function match(row, where = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (key === 'OR') return expected.some(clause => match(row, clause));
    if (key === 'AND') return expected.every(clause => match(row, clause));
    const value = row?.[key];
    if (expected === null) return value == null;
    if (expected === undefined) return true;
    if (typeof expected !== 'object' || expected instanceof Date) return value === expected;
    if ('is' in expected) return value != null && match(value, expected.is);
    if ('path' in expected) return expected.path.reduce((item, part) => item?.[part], value) === expected.equals;
    return Object.entries(expected).every(([op, bound]) => ({ in: () => bound.includes(value), notIn: () => !bound.includes(value),
      not: () => value !== bound,
      gt: () => value > bound, gte: () => value >= bound, lt: () => value < bound, lte: () => value <= bound })[op]());
  });
}
function project(row, select) {
  if (!select) return structuredClone(row);
  return Object.fromEntries(Object.entries(select).map(([key, selection]) => [key,
    selection === true ? structuredClone(row[key]) : row[key] == null ? null
      : Array.isArray(row[key]) ? row[key].map(item => project(item, selection.select)) : project(row[key], selection.select)]));
}
function fixture(serviceOptions = {}) {
  let date = new Date(NOW);
  const config = { currency: 'MXN', isOpen: true, scheduleEnabled: false, businessHours: null, timezone: 'America/Mexico_City',
    closedMessage: null, minOrderAmount: 0, deliveryMode: 'FLAT', deliveryFee: 2, freeDeliveryFrom: null,
    originLat: null, originLng: null, deliveryBaseFee: 0, deliveryPerKm: 0, deliveryFreeRadiusKm: null, deliveryMaxKm: null,
    promoStartTime: null, promoEndTime: null };
  let state = {
    restaurant: [ { id: 'r1', slug: 'alpha', isActive: true, config, tenant: { hasWebStore: true, isDemo: false } },
      { id: 'r2', slug: 'beta', isActive: true, config: { ...config }, tenant: { hasWebStore: true, isDemo: false } } ],
    location: [{ id: 'l1', restaurantId: 'r1', isActive: true, hasDelivery: true }, { id: 'l2', restaurantId: 'r2', isActive: true, hasDelivery: true }],
    menuItem: [{ id: 'p1', restaurantId: 'r1', name: 'Producto 1', price: 10.10 },
      { id: 'p2', restaurantId: 'r1', name: 'Producto 2', price: 5.50 }, { id: 'foreign', restaurantId: 'r2', name: 'Otro', price: 1 },
      { id: 'hidden', restaurantId: 'r1', name: 'Privado', price: 2, availableOnline: false }]
      .map(item => ({ isAvailable: true, availableOnline: true, isPromo: false, promoPrice: null, activeDays: [],
        promoStartTime: null, promoEndTime: null, hasVariants: false, soldByWeight: false, modifierGroups: [],
        category: { restaurantId: item.restaurantId, isActive: true }, ...item })),
    integrationConfig: ['r1', 'r2'].map(restaurantId => ({ restaurantId, enabled: true, type: 'MERCADOPAGO', mode: 'sandbox',
      config: JSON.stringify({ accessToken: 'offline-fixture-credential', collectorId: restaurantId === 'r1' ? '123' : '456', marketplaceCommissionRate: 0.05 }) })),
    order: [], orderItem: [], marketplaceOrderPipeline: [], marketplacePayment: [], marketplaceLedgerEntry: [], counter: [], deliveryZone: [],
  };
  let sequence = 0; let queued = Promise.resolve(); let inTransaction = false;
  const calls = []; const hooks = {}; const providerCalls = []; const payments = new Map(); const preferences = new Map();
  function materialize(model, row) {
    if (model === 'order') return { ...row, restaurant: state.restaurant.find(item => item.id === row.restaurantId),
      marketplacePipeline: state.marketplaceOrderPipeline.find(item => item.orderId === row.id) || null };
    if (model === 'marketplaceOrderPipeline') return { ...row, order: materialize('order', state.order.find(item => item.id === row.orderId)) };
    return row;
  }
  function unique(model, rows) {
    if (model === 'marketplacePayment' && rows.some((row, index) => rows.some((other, i) => i !== index
      && (row.idempotencyKey === other.idempotencyKey || row.providerPaymentId != null && row.provider === other.provider && row.providerPaymentId === other.providerPaymentId)))) {
      throw Object.assign(new Error('Unique provider payment'), { code: 'P2002' });
    }
    if (model === 'marketplaceLedgerEntry' && rows.some((row, index) => rows.some((other, i) => i !== index
      && row.paymentId === other.paymentId && row.idempotencyKey === other.idempotencyKey && row.lineNumber === other.lineNumber))) {
      throw Object.assign(new Error('Unique ledger event line'), { code: 'P2002' });
    }
  }
  function makeClient(root) {
    const api = {};
    for (const model of Object.keys(state)) {
      api[model] = {
        async findMany(args = {}) {
          calls.push({ model, method: 'findMany', args });
          let rows = state[model].map(row => materialize(model, row)).filter(row => match(row, args.where));
          const orders = args.orderBy ? Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy] : [];
          if (orders.length) rows.sort((a, b) => { for (const order of orders) {
            const [key, direction] = Object.entries(order)[0];
            const left = a[key] instanceof Date ? a[key].getTime() : a[key];
            const right = b[key] instanceof Date ? b[key].getTime() : b[key];
            if (left !== right) return (left < right ? -1 : 1) * (direction === 'asc' ? 1 : -1);
          } return 0; });
          if (args.take !== undefined) rows = rows.slice(0, args.take);
          return rows.map(row => project(row, args.select));
        },
        async findFirst(args) { return (await api[model].findMany(args))[0] || null; },
        async count(args) { return (await api[model].findMany(args)).length; },
        async groupBy(args) {
          calls.push({ model, method: 'groupBy', args });
          const groups = new Map();
          for (const row of state[model].filter(row => match(materialize(model, row), args.where))) {
            const key = JSON.stringify(args.by.map(field => row[field]));
            const group = groups.get(key) || { ...Object.fromEntries(args.by.map(field => [field, row[field]])), sum: 0n };
            const parts = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(row.amount));
            if (!parts) throw new Error('Invalid mock decimal');
            group.sum += (parts[1] ? -1n : 1n) * (BigInt(parts[2]) * 100n + BigInt((parts[3] || '').padEnd(2, '0')));
            groups.set(key, group);
          }
          return [...groups.values()].map(({ sum, ...keys }) => ({ ...keys,
            _sum: { amount: `${sum < 0n ? '-' : ''}${(sum < 0n ? -sum : sum) / 100n}.${String((sum < 0n ? -sum : sum) % 100n).padStart(2, '0')}` } }));
        },
        async create(args) {
          calls.push({ model, method: 'create', args });
          if (hooks.beforeWrite) await hooks.beforeWrite(model, 'create', args);
          const row = { id: `db-${++sequence}`, createdAt: new Date(date), providerPaymentId: null, checkoutUrl: null, dispatch: null,
            ...(model === 'order' ? { cashCollected: false, deliveryDriverId: null, updatedAt: new Date(date) } : {}),
            paymentProviderId: null, paymentProviderRef: null, ...structuredClone(args.data) };
          if (model === 'order') { state.orderItem.push(...row.items.create.map(item => ({ ...item, orderId: row.id }))); delete row.items; }
          unique(model, [...state[model], row]); state[model].push(row);
          return project(materialize(model, row), args.select);
        },
        async createMany(args) {
          calls.push({ model, method: 'createMany', args });
          assert.notEqual(args.skipDuplicates, true, 'Ledger must not suppress partial duplicates');
          if (hooks.beforeWrite) await hooks.beforeWrite(model, 'createMany', args);
          const rows = structuredClone(args.data); unique(model, [...state[model], ...rows]);
          state[model].push(...rows); return { count: rows.length };
        },
        async updateMany(args) {
          calls.push({ model, method: 'updateMany', args });
          if (hooks.beforeWrite) await hooks.beforeWrite(model, 'updateMany', args);
          let count = 0;
          for (const row of state[model]) if (match(materialize(model, row), args.where)) {
            for (const [key, value] of Object.entries(args.data)) row[key] = value && typeof value === 'object' && 'increment' in value
              ? row[key] + value.increment : structuredClone(value);
            count++;
          }
          unique(model, state[model]); return { count };
        },
      };
    }
    api.$queryRaw = async (strings, ...values) => {
      const sql = strings.join('?'); calls.push({ method: '$queryRaw', sql, values }); assert.match(sql, /FOR UPDATE/);
      const model = sql.includes('"restaurants"') ? 'restaurant' : 'order';
      return state[model].filter(row => row.id === values[0] && (model === 'restaurant' ? row.isActive : row.restaurantId === values[1] && row.source === 'MARKETPLACE')).map(row => ({ id: row.id }));
    };
    if (root) api.$transaction = async (work, options) => {
      const previous = queued; let release; queued = new Promise(resolve => { release = resolve; }); await previous;
      calls.push({ method: '$transaction', options }); const before = structuredClone(state); inTransaction = true;
      try { return await work(makeClient(false)); } catch (error) { state = before; throw error; }
      finally { inTransaction = false; release(); }
    };
    return api;
  }
  const prisma = makeClient(true);
  const gatewayFactory = async ({ restaurantId }) => ({ collectorId: restaurantId === 'r1' ? '123' : '456',
    async createPreference(input) {
      assert.equal(inTransaction, false, 'No network during database transaction');
      providerCalls.push({ method: 'createPreference', input });
      if (hooks.preference) await hooks.preference(input);
      if (!preferences.has(input.idempotencyKey)) preferences.set(input.idempotencyKey, { id: `pref-${input.orderId}`,
        initPoint: `https://www.mercadopago.com.mx/checkout/${input.orderId}` });
      return preferences.get(input.idempotencyKey);
    },
    async getPayment(id) {
      assert.equal(inTransaction, false, 'No network during database transaction'); providerCalls.push({ method: 'getPayment', id });
      if (hooks.verification) await hooks.verification(id);
      return structuredClone(payments.get(id));
    },
  });
  const service = createMarketplaceOrdersService({ storeSlugs: 'alpha,beta', pinSecrets: { test: PIN_SECRET }, activePinKeyId: 'test',
    getPaymentGateway: gatewayFactory, now: () => date, ...serviceOptions });
  return { prisma, service, calls, hooks, providerCalls, payments, get state() { return state; },
    setDate(value) { date = value; },
    approved(orderId, id = 'pay-1', extra = {}) {
      const row = state.marketplaceOrderPipeline.find(item => item.orderId === orderId);
      payments.set(id, { id, status: 'approved', orderId, collectorId: row.collectorId,
        currency: row.currency, amountCents: row.settlement.totalCents, marketplaceFeeCents: row.settlement.platformFeeCents, ...extra });
      return id;
    } };
}
function input(extra = {}) {
  return { storeSlug: 'alpha', restaurantId: 'r1', items: [{ menuItemId: 'p1', quantity: 2 }, { menuItemId: 'p2', quantity: 1 }],
    deliveryAddress: 'Direccion sintetica 123', customer: { name: 'Persona sintetica', phone: '5555555555', email: 'buyer@example.invalid' },
    paymentMethod: 'ONLINE', deliveryFee: 2, tip: 1, idempotencyKey: 'offline-idempotency-key-00000000001', ...extra };
}
module.exports = { fixture, input, NOW, PIN_SECRET };
