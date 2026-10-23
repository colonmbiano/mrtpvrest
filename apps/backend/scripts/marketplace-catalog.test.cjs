'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawnSync } = require('node:child_process');
const { InvalidQuery, parseQuery, parseStoreSlugs, createCatalog, createPrismaCatalogAdapter } = require('../src/lib/marketplace-catalog');
const createRouter = require('../src/routes/marketplace.routes');

// A small relational fixture driver evaluates the adapter's actual where/select/order/skip/take.
// It is not Prisma or PostgreSQL: query shape is asserted separately below.
function matches(row, where) {
  return Object.entries(where || {}).every(([key, condition]) => {
    if (key === 'OR') return condition.some(branch => matches(row, branch));
    const value = row[key];
    if (condition === null || typeof condition !== 'object') return value === condition;
    if ('is' in condition) return value != null && matches(value, condition.is);
    if ('in' in condition && !condition.in.includes(value)) return false;
    if ('gte' in condition && !(value >= condition.gte)) return false;
    if ('lte' in condition && !(value <= condition.lte)) return false;
    if ('contains' in condition) {
      const text = condition.contains.replace(/\\([\\%_])/g, '$1');
      return typeof value === 'string' && value.toLowerCase().includes(text.toLowerCase());
    }
    return true;
  });
}

function project(row, select) {
  return Object.fromEntries(Object.entries(select).map(([key, value]) => [
    key, value === true ? row[key] : row[key] == null ? null : project(row[key], value.select),
  ]));
}

function fixtures() {
  const stores = [
    { id: 'a', slug: 'alpha', name: 'Tienda', businessType: 'RESTAURANT' },
    { id: 'b', slug: 'beta', name: 'Tienda', businessType: 'GROCERY' },
    { id: 'c', slug: 'private', name: 'Oculta', businessType: 'RETAIL' },
    { id: 'd', slug: 'inactive', name: 'Baja', businessType: 'RESTAURANT', isActive: false },
    { id: 'e', slug: 'no-web', name: 'Sin web', businessType: 'RESTAURANT', tenant: { hasWebStore: false, isDemo: false } },
    { id: 'f', slug: 'demo', name: 'Demo', businessType: 'RESTAURANT', tenant: { hasWebStore: true, isDemo: true } },
  ].map(row => ({ isActive: true, tenant: { hasWebStore: true, isDemo: false },
    tenantId: 'private-tenant', aiApiKey: 'private-key', ...row }));
  function item(id, restaurantId, name, extra = {}) {
    return { id, restaurantId, name, price: 10, isAvailable: true, availableOnline: true,
      category: { name: 'Comida', restaurantId, isActive: true, cost: 5 },
      barcode: 'private-barcode', recipe: 'private-recipe', ...extra };
  }
  const items = [
    item('a1', 'a', 'Taco'), item('a2', 'a', 'Taco'), item('b1', 'b', 'Taco'),
    item('hidden', 'a', 'Oculto', { availableOnline: false, availableOnKiosk: true }),
    item('unavailable', 'a', 'Agotado', { isAvailable: false }),
    item('bad-category', 'a', 'Categoria ajena', { category: { name: 'Ajena', restaurantId: 'b', isActive: true } }),
    item('inactive-category', 'a', 'Inactivo', { category: { name: 'Baja', restaurantId: 'a', isActive: false } }),
    item('private-product', 'c', 'Privado'), item('inactive-product', 'd', 'Baja'),
    item('no-web-product', 'e', 'Sin web'), item('demo-product', 'f', 'Demo'),
    item('negative', 'a', 'Negativo', { price: -1 }), item('infinite', 'a', 'Infinito', { price: Infinity }),
  ];
  for (const row of items) row.restaurant = stores.find(store => store.id === row.restaurantId);
  const configs = [{ restaurantId: 'a', currency: 'USD', stripeKey: 'private-payment' },
    { restaurantId: 'c', currency: 'EUR' }];
  const calls = [];
  function model(name, rows) {
    return {
      async count(args) { calls.push({ model: name, method: 'count', args }); return rows.filter(row => matches(row, args.where)).length; },
      async findMany(args) {
        calls.push({ model: name, method: 'findMany', args });
        let found = rows.filter(row => matches(row, args.where));
        if (args.orderBy) found.sort((a, b) => {
          for (const field of args.orderBy) {
            const key = Object.keys(field)[0];
            const order = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0;
            if (order) return order;
          }
          return 0;
        });
        found = found.slice(args.skip || 0, (args.skip || 0) + (args.take || rows.length));
        return found.map(row => project(row, args.select));
      },
    };
  }
  const prisma = { restaurant: model('restaurant', stores), menuItem: model('menuItem', items), restaurantConfig: model('restaurantConfig', configs) };
  return { prisma, calls, stores, items, configs };
}

function catalogFixture(slugs = 'alpha,beta,inactive,no-web,demo') {
  const data = fixtures();
  return { ...data, catalog: createCatalog({ storeSlugs: slugs, getAdapter: () => createPrismaCatalogAdapter(data.prisma) }) };
}

function httpFixture(options = {}) {
  const routes = {};
  createRouter({ Router: () => ({ get(path, handler) { routes[path] = handler; } }), ...options });
  return async (path, query = {}, extra = {}) => {
    const res = { statusCode: 200, headers: {},
      set(key, value) { this.headers[key] = value; return this; },
      status(code) { this.statusCode = code; return this; },
      json(body) { this.body = body; return this; } };
    await routes[path]({ query, ...extra }, res);
    return res;
  };
}

test('empty publication policy returns empty pages without loading an adapter', async () => {
  const catalog = createCatalog({ getAdapter: () => assert.fail('Database must not load') });
  assert.deepEqual(await catalog.listStores({}), { items: [], total: 0, page: 1, pageSize: 12 });
  assert.deepEqual(await catalog.listProducts({ page: '2', pageSize: '24' }), { items: [], total: 0, page: 2, pageSize: 24 });
});

test('allowlist is exact, bounded, validated and never expanded by a store parameter', async () => {
  assert.deepEqual(parseStoreSlugs(' alpha, beta,alpha '), ['alpha', 'beta']);
  assert.equal(parseStoreSlugs(Array.from({ length: 100 }, (_, i) => `s-${i}`).join(',')).length, 100);
  for (const value of ['*', 'Alpha', '../a', 'a/b', 'a,', 'a'.repeat(101), Array(101).fill('a').join(','), ['alpha']]) {
    assert.throws(() => parseStoreSlugs(value));
  }
  const { catalog, calls } = catalogFixture('alpha');
  assert.deepEqual((await catalog.listProducts({ store: 'private' })).items, []);
  assert.equal(calls.length, 0);
});

test('query rules reject structured, duplicate, out-of-range and malformed values', () => {
  for (const kind of ['stores', 'products']) {
    for (const query of [
      { q: ['x', 'y'] }, { q: {} }, { q: 'a'.repeat(81) }, { page: '' }, { page: '0' },
      { page: '-1' }, { page: '1.5' }, { page: '1e2' }, { page: ' 1' }, { page: '10001' },
      { page: ['1', '2'] }, { pageSize: '0' }, { pageSize: '25' }, { pageSize: {} },
      { page: 1 }, { extra: {} }, { extra: ['a', 'b'] },
    ]) assert.throws(() => parseQuery(query, kind), InvalidQuery, JSON.stringify(query));
  }
  for (const value of ['RETAIL ', 'retail', 'BAR']) assert.throws(() => parseQuery({ businessType: value }, 'stores'), InvalidQuery);
  for (const value of ['A', 'a/b', '../a', 'a?x', 'a'.repeat(101)]) assert.throws(() => parseQuery({ store: value }, 'products'), InvalidQuery);
  assert.equal(parseQuery({ q: '  taco  ', page: '10000', pageSize: '24', harmless: 'ignored' }, 'products').q, 'taco');
  assert.equal(parseQuery({ q: ' '.repeat(90), store: '' }, 'products').q, '');
});

test('stores exclude private, inactive, non-web and demo tenants with explicit public projection', async () => {
  const { catalog } = catalogFixture();
  assert.deepEqual(await catalog.listStores({}), { page: 1, pageSize: 12, total: 2, items: [
    { slug: 'alpha', name: 'Tienda', businessType: 'RESTAURANT', isOpen: false, closedMessage: null, deliveryFee: null, estimatedDelivery: null, freeDeliveryFrom: null, minOrderAmount: null },
    { slug: 'beta', name: 'Tienda', businessType: 'GROCERY', isOpen: false, closedMessage: null, deliveryFee: null, estimatedDelivery: null, freeDeliveryFrom: null, minOrderAmount: null },
  ] });
  assert.deepEqual((await catalog.listStores({ businessType: 'GROCERY', q: '  TIEN  ' })).items.map(row => row.slug), ['beta']);
  assert.equal((await catalog.listStores({ q: 'none' })).total, 0);
});

test('store pagination counts after filters and uses id to break tied names', async () => {
  const { catalog } = catalogFixture();
  assert.equal((await catalog.listStores({ pageSize: '1' })).items[0].slug, 'alpha');
  const second = await catalog.listStores({ pageSize: '1', page: '2' });
  assert.equal(second.items[0].slug, 'beta');
  assert.equal(second.total, 2);
  assert.deepEqual(await catalog.listStores({ page: '10000' }), { items: [], total: 2, page: 10000, pageSize: 12 });
});

test('products enforce ownership, online visibility, availability and same-store active category', async () => {
  const { catalog } = catalogFixture();
  const page = await catalog.listProducts({});
  assert.deepEqual(page.items.map(row => row.id), ['a1', 'a2', 'b1']);
  assert.equal(page.total, 3);
  assert.deepEqual(page.items[0], { id: 'a1', name: 'Taco', price: 10, promoPrice: null, likes: 0, categoryName: 'Comida', currency: 'USD', store: { slug: 'alpha', name: 'Tienda' } });
  assert.equal(page.items[2].currency, 'MXN');
  assert.deepEqual((await catalog.listProducts({ store: 'beta', q: 'tACO' })).items.map(row => row.id), ['b1']);
  for (const store of ['inactive', 'no-web', 'demo']) assert.equal((await catalog.listProducts({ store })).total, 0);
});

test('product pagination is stable and preserves filtered totals beyond the last page', async () => {
  const { catalog } = catalogFixture();
  assert.equal((await catalog.listProducts({ q: 'taco', page: '2', pageSize: '1' })).items[0].id, 'a2');
  assert.deepEqual(await catalog.listProducts({ q: 'taco', page: '4', pageSize: '1' }), { page: 4, pageSize: 1, total: 3, items: [] });
});

test('Prisma adapter sends explicit eligibility, scopes, narrow selects and DB pagination', async () => {
  const { catalog, calls } = catalogFixture('alpha,beta');
  await catalog.listStores({ page: '2', pageSize: '1', businessType: 'GROCERY' });
  const store = calls.find(call => call.model === 'restaurant' && call.method === 'findMany').args;
  assert.deepEqual(store.where, { slug: { in: ['alpha', 'beta'] }, isActive: true,
    tenant: { is: { hasWebStore: true, isDemo: false } }, businessType: 'GROCERY' });
  assert.deepEqual(store.select, {
    slug: true,
    name: true,
    businessType: true,
    config: {
      select: {
        isOpen: true,
        closedMessage: true,
        deliveryMode: true,
        deliveryFee: true,
        freeDeliveryFrom: true,
        minOrderAmount: true,
        estimatedDelivery: true,
        scheduleEnabled: true,
        businessHours: true,
        timezone: true,
      },
    },
  });
  assert.deepEqual(store.orderBy, [{ name: 'asc' }, { id: 'asc' }]);
  assert.equal(store.skip, 1); assert.equal(store.take, 1);
  calls.length = 0;
  await catalog.listProducts({ q: 'Taco', page: '2', pageSize: '1' });
  const product = calls.find(call => call.model === 'menuItem' && call.method === 'findMany').args;
  assert.deepEqual(product.where.restaurantId, { in: ['a', 'b'] });
  assert.equal(product.where.isAvailable, true); assert.equal(product.where.availableOnline, true);
  assert.deepEqual(product.where.OR, [
    { restaurantId: 'a', category: { is: { restaurantId: 'a', isActive: true } } },
    { restaurantId: 'b', category: { is: { restaurantId: 'b', isActive: true } } },
  ]);
  assert.deepEqual(product.where.restaurant.is, {
    slug: { in: ['alpha', 'beta'] },
    isActive: true,
    tenant: { is: { hasWebStore: true, isDemo: false } },
  });
  assert.deepEqual(product.select, {
    id: true,
    name: true,
    price: true,
    isPromo: true,
    promoPrice: true,
    promoStartTime: true,
    promoEndTime: true,
    restaurantId: true,
    category: { select: { name: true } },
    _count: { select: { reactions: true } },
  });
  assert.deepEqual(product.orderBy, [{ name: 'asc' }, { id: 'asc' }]);
  assert.equal(product.skip, 1); assert.equal(product.take, 1);
  const config = calls.find(call => call.model === 'restaurantConfig').args;
  assert.deepEqual(config, {
    where: { restaurantId: { in: ['a', 'b'] } },
    select: { restaurantId: true, currency: true, promoStartTime: true, promoEndTime: true, timezone: true },
    take: 100,
  });
  assert.deepEqual(calls.find(call => call.model === 'menuItem' && call.method === 'count').args.where, product.where);
  assert.equal(calls.length, 4);
});

test('LIKE wildcards and backslashes are escaped, never interpreted as search operators', async () => {
  const { catalog, calls } = catalogFixture('alpha');
  await catalog.listStores({ q: '50%_\\' });
  const where = calls.find(call => call.method === 'count').args.where;
  assert.deepEqual(where.name, { contains: '50\\%\\_\\\\', mode: 'insensitive' });
  assert.equal((await catalog.listProducts({ q: "' OR 1=1 --" })).total, 0);
});

test('public boundary drops private adapter fields including nested store secrets', async () => {
  const catalog = createCatalog({ storeSlugs: 'alpha', getAdapter: () => ({
    listStores: async () => ({ total: 1, rows: [{ slug: 'alpha', name: 'A', businessType: 'RETAIL', tenantId: 'secret', aiApiKey: 'secret' }] }),
    listProducts: async () => ({ total: 1, rows: [{ id: '1', name: 'P', price: 1, categoryName: 'C', currency: 'MXN',
      barcode: 'secret', recipe: 'secret', store: { slug: 'alpha', name: 'A', tenantId: 'secret' } }] }),
  }) });
  assert.deepEqual((await catalog.listStores({})).items, [{ slug: 'alpha', name: 'A', businessType: 'RETAIL', isOpen: false, closedMessage: null, deliveryFee: null, estimatedDelivery: null, freeDeliveryFrom: null, minOrderAmount: null }]);
  assert.deepEqual((await catalog.listProducts({})).items, [{ id: '1', name: 'P', price: 1, categoryName: 'C', currency: 'MXN', promoPrice: null, likes: 0, store: { slug: 'alpha', name: 'A' } }]);
});

test('HTTP handlers return 400 before adapter load and always prohibit caching', async () => {
  const request = httpFixture({ storeSlugs: 'alpha', getAdapter: () => assert.fail('Invalid query accessed database') });
  for (const path of ['/stores', '/products']) {
    const response = await request(path, { page: ['1', '2'] });
    assert.equal(response.statusCode, 400);
    assert.equal(response.body.errorCode, 'INVALID_QUERY');
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('HTTP handlers do not use tenant headers or browser allowlists to enlarge publication', async () => {
  const request = httpFixture({ storeSlugs: '', getAdapter: () => assert.fail('Browser expanded publication') });
  const response = await request('/products', { store: 'private', tenantId: 'c', MARKETPLACE_STORE_SLUGS: 'private' }, { headers: { 'x-restaurant-id': 'c' } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.items, []);
  assert.equal(response.headers['Cache-Control'], 'no-store');
});

test('adapter failure or timeout returns generic 503 without retry, internal details or empty success', async () => {
  for (const path of ['/stores', '/products']) {
    let attempts = 0;
    const fail = async () => { attempts++; throw new Error('ETIMEDOUT postgres://private:password@host'); };
    const request = httpFixture({ storeSlugs: 'alpha', getAdapter: () => ({ listStores: fail, listProducts: fail }) });
    const response = await request(path);
    assert.equal(attempts, 1);
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.body, { error: 'Catalogo temporalmente no disponible', errorCode: 'CATALOG_UNAVAILABLE' });
    assert.equal(response.headers['Cache-Control'], 'no-store');
  }
});

test('malformed server allowlist fails closed with 503 without adapter access', async () => {
  const request = httpFixture({ storeSlugs: '*', getAdapter: () => assert.fail('Malformed configuration accessed DB') });
  assert.equal((await request('/stores')).statusCode, 503);
});

test('malformed configured currency yields unavailable rather than an invalid price summary', async () => {
  const { prisma, configs } = fixtures();
  configs[0].currency = 'NOT-ISO';
  const request = httpFixture({ storeSlugs: 'alpha', getAdapter: () => createPrismaCatalogAdapter(prisma) });
  assert.equal((await request('/products')).statusCode, 503);
});

test('router import and empty-policy handlers never require Express or database packages', () => {
  const script = `
    const Module = require('node:module');
    const original = Module._load;
    Module._load = function(id, ...args) {
      if (id === 'express' || id.includes('database') || id.includes('prisma')) throw new Error('Forbidden import: ' + id);
      return original.call(this, id, ...args);
    };
    const createRouter = require(${JSON.stringify(require.resolve('../src/routes/marketplace.routes'))});
    const routes = {};
    createRouter({ storeSlugs: '', Router: () => ({ get(path, fn) { routes[path] = fn; } }) });
    const res = { set() {}, json(body) { if (body.total !== 0) throw new Error('Unexpected data'); }, status() { throw new Error('Unexpected error'); } };
    Promise.all(Object.values(routes).map(fn => fn({ query: {} }, res))).catch(() => { process.exitCode = 1; });
  `;
  const result = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
});

test('new router is mounted publicly before tenant middleware without importing the app', () => {
  const source = readFileSync(require.resolve('../src/index.js'), 'utf8');
  assert.ok(source.indexOf("app.use('/api/marketplace', require('./routes/marketplace.routes')())") < source.indexOf('app.use(tenantMiddleware)'));
});
