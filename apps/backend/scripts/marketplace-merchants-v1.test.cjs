'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMerchantsV1Service, MerchantsV1Error, parseQuery, DEFAULT_LIMIT, MAX_LIMIT } = require('../src/lib/marketplace-merchants-v1');
const createRouter = require('../src/routes/marketplace-merchants-v1.routes');

// Offline by construction: any network call from this suite is a failure.
globalThis.fetch = async () => { throw new Error('Network forbidden by offline suite'); };

const HERE = { lat: 19.4326, lng: -99.1332 };
const square = (minLat, minLng, maxLat, maxLng) => [
  { lat: minLat, lng: minLng }, { lat: minLat, lng: maxLng }, { lat: maxLat, lng: maxLng }, { lat: maxLat, lng: minLng }];
const HOURS = [{ day: 1, open: '09:00', close: '22:00' }];

const MERCHANTS = [
  { id: 'm1', slug: 'taqueria-centro', name: 'Taqueria Centro', published: true, status: 'ACTIVE', open: true,
    categories: ['RESTAURANT', 'TACOS'], logo: 'https://cdn.example/logo.png', banner: null,
    estimatedReadyMinutes: 20, minOrderCents: 5000,
    pickup: { address: 'Av. Juarez 10', lat: HERE.lat, lng: HERE.lng },
    deliveryZones: [
      { id: 'z1', name: 'Centro', feeCents: 3000, active: true, polygon: square(19.40, -99.17, 19.44, -99.13) },
      { id: 'z-old', name: 'Vieja', feeCents: 100, active: false, polygon: [] },
    ],
    businessHours: HOURS, paymentMethods: ['CASH', 'ONLINE', 'bad-lower'],
    // Internal data that must never reach a public response.
    contact: { phone: '+525512345678', email: 'owner@example.com' }, ownerId: 'user-1', taxId: 'XAXX010101000' },
  { id: 'm2', slug: 'ferreteria-norte', name: 'Ferreteria Norte', published: true, status: 'ACTIVE', open: false,
    categories: ['HARDWARE'], logo: null, banner: null, estimatedReadyMinutes: null, minOrderCents: 0,
    pickup: { address: 'Norte 5', lat: 19.6, lng: -99.1 }, deliveryZones: [], businessHours: null, paymentMethods: ['CASH'] },
  { id: 'm3', slug: 'oculto', name: 'Oculto', published: false, status: 'ACTIVE', open: true,
    categories: ['RESTAURANT'], pickup: { address: 'Secreto', lat: HERE.lat, lng: HERE.lng }, deliveryZones: [] },
  { id: 'm4', slug: 'suspendido', name: 'Suspendido', published: true, status: 'SUSPENDED', open: true,
    categories: ['RESTAURANT'], pickup: { address: 'X', lat: HERE.lat, lng: HERE.lng }, deliveryZones: [] },
  { id: 'm5', slug: 'sin-ubicacion', name: 'Sin Ubicacion', published: true, status: 'ACTIVE', open: true,
    categories: ['RESTAURANT'], pickup: null, deliveryZones: [] },
];

const CATALOGS = {
  m1: {
    categories: [
      { id: 'c-tacos', name: 'Tacos', isActive: true, position: 2 },
      { id: 'c-bebidas', name: 'Bebidas', isActive: true, position: 1 },
      { id: 'c-inactiva', name: 'Vieja', isActive: false, position: 0 },
    ],
    items: [
      { id: 'pastor', categoryId: 'c-tacos', name: 'Tacos al pastor', description: 'Con pina', unitPriceCents: 2500,
        promoActive: true, promoPriceCents: 2000, availableOnline: true, isAvailable: true, position: 1,
        modifierGroups: [{ id: 'g1', name: 'Extras', required: false, min: 0, max: 2, options: [
          { id: 'o1', name: 'Queso', priceDeltaCents: 1500, available: true },
          { id: 'o2', name: 'Agotado', priceDeltaCents: 0, available: false }] }] },
      { id: 'refresco', categoryId: 'c-bebidas', name: 'Refresco', unitPriceCents: 3000, promoActive: false,
        promoPriceCents: 2000, availableOnline: true, isAvailable: true, position: 1 },
      { id: 'promo-no-baja', categoryId: 'c-tacos', name: 'Quesadilla', unitPriceCents: 1000, promoActive: true,
        promoPriceCents: 1200, availableOnline: true, isAvailable: true, position: 2 },
      { id: 'oculto-online', categoryId: 'c-tacos', name: 'Interno', unitPriceCents: 900, availableOnline: false,
        isAvailable: true, position: 3 },
      { id: 'agotado', categoryId: 'c-tacos', name: 'Agotado', unitPriceCents: 900, availableOnline: true,
        isAvailable: false, position: 4 },
      { id: 'precio-invalido', categoryId: 'c-tacos', name: 'Roto', unitPriceCents: null, availableOnline: true,
        isAvailable: true, position: 5 },
      { id: 'en-inactiva', categoryId: 'c-inactiva', name: 'Fantasma', unitPriceCents: 500, availableOnline: true,
        isAvailable: true, position: 0 },
      { id: 'ajeno', categoryId: 'c-otra-tienda', name: 'Ajeno', unitPriceCents: 500, availableOnline: true,
        isAvailable: true, position: 0 },
    ],
  },
};

// Fake repo. Every method is offline and returns clones, so the service cannot mutate fixtures.
function makeRepo({ merchants = MERCHANTS, catalogs = CATALOGS } = {}) {
  const calls = { catalog: 0 };
  return {
    calls,
    async findPublishedMerchants() { return structuredClone(merchants); },
    async findPublishedMerchantBySlug(slug) { return structuredClone(merchants.find(merchant => merchant.slug === slug) ?? null); },
    async findMerchantCatalog(id) {
      calls.catalog++;
      return structuredClone(catalogs[id] ?? { categories: [], items: [] });
    },
  };
}

const service = (repo = makeRepo()) => createMerchantsV1Service({ repo });
function rejects(promise, code, statusCode) {
  return assert.rejects(promise, error => error instanceof MerchantsV1Error && error.code === code && error.statusCode === statusCode);
}
const slugs = result => result.items.map(item => item.slug);

test('default discovery returns only published and active merchants, sorted by slug', async () => {
  const result = await service().listMerchants({});
  assert.deepEqual(slugs(result), ['ferreteria-norte', 'sin-ubicacion', 'taqueria-centro']);
  assert.equal(result.total, 3);
  assert.equal(result.limit, DEFAULT_LIMIT);
});

test('discovery items expose exactly the public whitelist and no contact or internal data', async () => {
  const result = await service().listMerchants({});
  const item = result.items.find(row => row.slug === 'taqueria-centro');
  assert.deepEqual(Object.keys(item).sort(), ['banner', 'categories', 'deliveryZones', 'distanceKm', 'estimatedReadyMinutes',
    'logo', 'minOrder', 'name', 'open', 'rating', 'slug']);
  assert.deepEqual(item.deliveryZones, [{ id: 'z1', name: 'Centro', fee: '30.00' }]);
  assert.equal(item.minOrder, '50.00');
  assert.equal(item.rating, null);
  const serialized = JSON.stringify(result);
  for (const secret of ['+5255', 'owner@example.com', 'user-1', 'XAXX', 'ownerId', 'taxId', 'contact']) {
    assert.equal(serialized.includes(secret), false, `leaked ${secret}`);
  }
});

test('coordinates compute distance and sort nearest first; no pickup point sorts last', async () => {
  const result = await service().listMerchants({ lat: String(HERE.lat), lng: String(HERE.lng) });
  assert.deepEqual(slugs(result), ['taqueria-centro', 'ferreteria-norte', 'sin-ubicacion']);
  assert.equal(result.items[0].distanceKm, 0);
  assert.ok(result.items[1].distanceKm > 15 && result.items[1].distanceKm < 25, `distance ${result.items[1].distanceKm}`);
  assert.equal(result.items[2].distanceKm, null);
});

test('open filter keeps only open or only closed merchants', async () => {
  assert.deepEqual(slugs(await service().listMerchants({ open: 'true' })), ['sin-ubicacion', 'taqueria-centro']);
  assert.deepEqual(slugs(await service().listMerchants({ open: 'false' })), ['ferreteria-norte']);
});

test('category filter matches exactly; unknown category returns an empty page', async () => {
  assert.deepEqual(slugs(await service().listMerchants({ category: 'HARDWARE' })), ['ferreteria-norte']);
  const none = await service().listMerchants({ category: 'NOPE' });
  assert.deepEqual(none, { items: [], total: 0, limit: DEFAULT_LIMIT });
});

test('limit caps the page and total still counts every match', async () => {
  const page = await service().listMerchants({ limit: '2' });
  assert.equal(page.items.length, 2);
  assert.equal(page.total, 3);
  const bulk = Array.from({ length: 25 }, (_, i) => ({ id: `b${i}`, slug: `bulk-${String(i).padStart(2, '0')}`, name: `B${i}`,
    published: true, status: 'ACTIVE', open: true, categories: ['RESTAURANT'], pickup: null, deliveryZones: [] }));
  const many = service(makeRepo({ merchants: [...MERCHANTS, ...bulk] }));
  assert.equal((await many.listMerchants({})).items.length, DEFAULT_LIMIT);
  assert.equal((await many.listMerchants({ limit: String(MAX_LIMIT) })).items.length, 28);
});

test('invalid query parameters are rejected with 400', () => {
  const cases = [
    { sort: 'asc' }, { lat: '19.4' }, { lng: '-99.1' }, { lat: '91', lng: '0' }, { lat: '0', lng: '-181' },
    { lat: 'abc', lng: '0' }, { open: 'yes' }, { category: 'Tacos Al Pastor' }, { limit: '0' }, { limit: '51' },
    { limit: 'abc' }, { limit: '1.5' }, { lat: ['1', '2'], lng: '1' },
  ];
  for (const query of cases) {
    assert.throws(() => parseQuery(query), error => error instanceof MerchantsV1Error && error.code === 'INVALID_QUERY'
      && error.statusCode === 400, JSON.stringify(query));
  }
  assert.throws(() => parseQuery(null), error => error.code === 'INVALID_QUERY');
  assert.throws(() => parseQuery(['x']), error => error.code === 'INVALID_QUERY');
});

test('detail returns zones with polygons, pickup, hours and enabled payment methods, without contact data', async () => {
  const detail = await service().getMerchant('taqueria-centro');
  assert.equal(detail.slug, 'taqueria-centro');
  assert.deepEqual(detail.deliveryZones, [{ id: 'z1', name: 'Centro', fee: '30.00', polygon: square(19.40, -99.17, 19.44, -99.13) }]);
  assert.deepEqual(detail.businessHours, HOURS);
  assert.deepEqual(detail.pickup, { address: 'Av. Juarez 10', lat: HERE.lat, lng: HERE.lng });
  assert.deepEqual(detail.paymentMethods, ['CASH', 'ONLINE']);
  assert.equal(JSON.stringify(detail).includes('owner@example.com'), false);
});

test('detail is not found for unknown, unpublished, suspended and malformed slugs', async () => {
  const s = service();
  for (const slug of ['no-existe', 'oculto', 'suspendido', 'Bad_Slug', '../x']) {
    await rejects(s.getMerchant(slug), 'MERCHANT_NOT_FOUND', 404);
  }
});

test('detail rejects a repo answer whose slug does not match the request', async () => {
  const repo = makeRepo();
  repo.findPublishedMerchantBySlug = async () => structuredClone(MERCHANTS[0]);
  await rejects(service(repo).getMerchant('ferreteria-norte'), 'MERCHANT_NOT_FOUND', 404);
});

test('catalog groups online-available items by public category, ordered by position', async () => {
  const catalog = await service().getMerchantCatalog('taqueria-centro');
  assert.deepEqual(catalog.merchant, { slug: 'taqueria-centro', name: 'Taqueria Centro', open: true });
  assert.deepEqual(catalog.categories.map(category => category.name), ['Bebidas', 'Tacos']);
  const [drinks, tacos] = catalog.categories;
  assert.deepEqual(drinks.items.map(item => item.id), ['refresco']);
  assert.deepEqual(tacos.items.map(item => item.id), ['pastor', 'promo-no-baja']);
});

test('catalog prices are exact strings, promos only apply when real, and modifiers are allowed options only', async () => {
  const catalog = await service().getMerchantCatalog('taqueria-centro');
  const tacos = catalog.categories.find(category => category.name === 'Tacos').items;
  assert.deepEqual(tacos[0], { id: 'pastor', name: 'Tacos al pastor', description: 'Con pina', unitPrice: '25.00',
    promoPrice: '20.00', modifiers: [{ id: 'g1', name: 'Extras', required: false, min: 0, max: 2,
      options: [{ id: 'o1', name: 'Queso', priceDelta: '15.00' }] }] });
  assert.equal(tacos[1].unitPrice, '10.00');
  assert.equal(tacos[1].promoPrice, null, 'promo above the regular price is not a discount');
  const drink = catalog.categories.find(category => category.name === 'Bebidas').items[0];
  assert.equal(drink.promoPrice, null, 'inactive promo is ignored');
  assert.equal(drink.unitPrice, '30.00');
});

test('catalog excludes inactive categories, unavailable, offline-hidden, invalid-price and foreign items', async () => {
  const names = JSON.stringify(await service().getMerchantCatalog('taqueria-centro'));
  for (const hidden of ['Interno', 'Agotado', 'Roto', 'Fantasma', 'Ajeno', 'Vieja']) {
    assert.equal(names.includes(hidden), false, `${hidden} must not be public`);
  }
});

test('a merchant without catalog data gets an empty catalog, not an error', async () => {
  const catalog = await service().getMerchantCatalog('ferreteria-norte');
  assert.deepEqual(catalog.categories, []);
});

test('catalog of an unpublished merchant is not found and the catalog is never loaded', async () => {
  const repo = makeRepo();
  await rejects(service(repo).getMerchantCatalog('oculto'), 'MERCHANT_NOT_FOUND', 404);
  await rejects(service(repo).getMerchantCatalog('suspendido'), 'MERCHANT_NOT_FOUND', 404);
  assert.equal(repo.calls.catalog, 0);
});

test('without ports every endpoint fails closed with 503', async () => {
  const none = createMerchantsV1Service({});
  await rejects(none.listMerchants({}), 'MARKETPLACE_UNAVAILABLE', 503);
  await rejects(none.getMerchant('taqueria-centro'), 'MARKETPLACE_UNAVAILABLE', 503);
  await rejects(none.getMerchantCatalog('taqueria-centro'), 'MARKETPLACE_UNAVAILABLE', 503);
});

function routes(options = {}) {
  const handlers = new Map();
  createRouter({ Router: () => ({ get: (p, fn) => handlers.set(`GET ${p}`, fn) }), ...options });
  return handlers;
}
async function call(handler, { params = {}, query = {} } = {}) {
  const res = { statusCode: 200, headers: {}, body: undefined,
    set(key, value) { this.headers[key] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; } };
  await handler({ params, query }, res);
  return res;
}

test('route: list, detail and catalog return 200 with no-store', async () => {
  const handlers = routes({ service: service() });
  const list = await call(handlers.get('GET /merchants'), { query: {} });
  assert.equal(list.statusCode, 200);
  assert.equal(list.headers['Cache-Control'], 'no-store');
  assert.equal(list.body.total, 3);
  const detail = await call(handlers.get('GET /merchants/:slug'), { params: { slug: 'taqueria-centro' } });
  assert.equal(detail.statusCode, 200);
  assert.equal(detail.headers['Cache-Control'], 'no-store');
  const catalog = await call(handlers.get('GET /merchants/:slug/catalog'), { params: { slug: 'taqueria-centro' } });
  assert.equal(catalog.statusCode, 200);
  assert.equal(catalog.body.categories.length, 2);
});

test('route: errors keep their status codes and still send no-store', async () => {
  const handlers = routes({ service: service() });
  const bad = await call(handlers.get('GET /merchants'), { query: { limit: '99' } });
  assert.equal(bad.statusCode, 400);
  assert.equal(bad.body.errorCode, 'INVALID_QUERY');
  assert.equal(bad.headers['Cache-Control'], 'no-store');
  const missing = await call(handlers.get('GET /merchants/:slug'), { params: { slug: 'no-existe' } });
  assert.equal(missing.statusCode, 404);
  assert.equal(missing.body.errorCode, 'MERCHANT_NOT_FOUND');
  assert.equal(missing.headers['Cache-Control'], 'no-store');
});

test('route: default router without ports is 503 and unexpected failures do not leak details', async () => {
  const unconfigured = await call(routes().get('GET /merchants'), { query: {} });
  assert.equal(unconfigured.statusCode, 503);
  assert.equal(unconfigured.body.errorCode, 'MARKETPLACE_UNAVAILABLE');

  const repo = makeRepo();
  repo.findPublishedMerchants = async () => { throw new Error('connection to db-internal failed'); };
  const failing = await call(routes({ service: service(repo) }).get('GET /merchants'), { query: {} });
  assert.equal(failing.statusCode, 503);
  assert.equal(failing.headers['Cache-Control'], 'no-store');
  assert.equal(JSON.stringify(failing.body).includes('db-internal'), false);
});

test('the v1 merchants router is mounted under /api/marketplace/v1', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
  assert.match(source, /app\.use\('\/api\/marketplace\/v1',\s*require\('\.\/routes\/marketplace-merchants-v1\.routes'\)\(\)\)/);
});
