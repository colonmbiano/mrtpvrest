const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  InvalidQuery,
  parseQuery,
  parseStoreSlugs,
  createCatalog,
  createPrismaCatalogAdapter,
} = require('../src/lib/marketplace-catalog');
const createMarketplaceRouter = require('../src/routes/marketplace.routes');

// ── 1. parseStoreSlugs ────────────────────────────────────────────────────────

test('parseStoreSlugs: returns empty array for empty or whitespace string', () => {
  assert.deepEqual(parseStoreSlugs(''), []);
  assert.deepEqual(parseStoreSlugs('   '), []);
});

test('parseStoreSlugs: trims and deduplicates valid slugs', () => {
  assert.deepEqual(
    parseStoreSlugs(' store-uno , store-dos,store-uno '),
    ['store-uno', 'store-dos']
  );
});

test('parseStoreSlugs: throws on non-string or invalid slug format', () => {
  assert.throws(() => parseStoreSlugs(null), /Invalid marketplace allowlist/);
  assert.throws(() => parseStoreSlugs(123), /Invalid marketplace allowlist/);
  assert.throws(() => parseStoreSlugs('STORE_UPPERCASE'), /Invalid marketplace allowlist/);
  assert.throws(() => parseStoreSlugs('store with spaces'), /Invalid marketplace allowlist/);
  assert.throws(() => parseStoreSlugs('store/slash'), /Invalid marketplace allowlist/);
});

test('parseStoreSlugs: throws if more than 100 slugs provided', () => {
  const tooMany = Array.from({ length: 101 }, (_, i) => `store-${i}`).join(',');
  assert.throws(() => parseStoreSlugs(tooMany), /Invalid marketplace allowlist/);
});

// ── 2. parseQuery ─────────────────────────────────────────────────────────────

test('parseQuery: defaults to page 1, pageSize 12, empty query', () => {
  const qStores = parseQuery({}, 'stores');
  assert.equal(qStores.page, 1);
  assert.equal(qStores.pageSize, 12);
  assert.equal(qStores.q, '');
  assert.equal(qStores.businessType, undefined);

  const qProducts = parseQuery({}, 'products');
  assert.equal(qProducts.page, 1);
  assert.equal(qProducts.pageSize, 12);
  assert.equal(qProducts.q, '');
  assert.equal(qProducts.store, undefined);
});

test('parseQuery: trims q and rejects q > 80 characters without truncating', () => {
  assert.equal(parseQuery({ q: '  tacos al pastor  ' }, 'stores').q, 'tacos al pastor');
  const valid80 = 'a'.repeat(80);
  assert.equal(parseQuery({ q: valid80 }, 'stores').q, valid80);

  const invalid81 = 'a'.repeat(81);
  assert.throws(() => parseQuery({ q: invalid81 }, 'stores'), InvalidQuery);
});

test('parseQuery: validates page (1..10000) and rejects non-positive or out-of-range', () => {
  assert.equal(parseQuery({ page: '10' }, 'stores').page, 10);
  assert.equal(parseQuery({ page: '10000' }, 'stores').page, 10000);

  assert.throws(() => parseQuery({ page: '0' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ page: '-1' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ page: '10001' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ page: '1.5' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ page: 'abc' }, 'stores'), InvalidQuery);
});

test('parseQuery: validates pageSize (1..24) and rejects invalid numbers', () => {
  assert.equal(parseQuery({ pageSize: '24' }, 'stores').pageSize, 24);
  assert.equal(parseQuery({ pageSize: '1' }, 'stores').pageSize, 1);

  assert.throws(() => parseQuery({ pageSize: '0' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ pageSize: '25' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ pageSize: '-5' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ pageSize: '12.4' }, 'stores'), InvalidQuery);
});

test('parseQuery: stores kind validates businessType', () => {
  assert.equal(parseQuery({ businessType: 'RESTAURANT' }, 'stores').businessType, 'RESTAURANT');
  assert.equal(parseQuery({ businessType: 'RETAIL' }, 'stores').businessType, 'RETAIL');
  assert.equal(parseQuery({ businessType: 'GROCERY' }, 'stores').businessType, 'GROCERY');
  assert.equal(parseQuery({ businessType: '' }, 'stores').businessType, undefined);

  assert.throws(() => parseQuery({ businessType: 'PHARMACY' }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ businessType: 'restaurant' }, 'stores'), InvalidQuery);
});

test('parseQuery: products kind validates store slug', () => {
  assert.equal(parseQuery({ store: 'master-burgers' }, 'products').store, 'master-burgers');
  assert.equal(parseQuery({ store: '' }, 'products').store, undefined);

  assert.throws(() => parseQuery({ store: 'INVALID/SLUG' }, 'products'), InvalidQuery);
  assert.throws(() => parseQuery({ store: 'Store Upper' }, 'products'), InvalidQuery);
});

test('parseQuery: rejects structured non-string parameters (arrays, objects)', () => {
  assert.throws(() => parseQuery({ q: ['tacos', 'tortas'] }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery({ page: { value: 1 } }, 'stores'), InvalidQuery);
  assert.throws(() => parseQuery(['invalid-array'], 'stores'), InvalidQuery);
  assert.throws(() => parseQuery(null, 'stores'), InvalidQuery);
});

// ── 3. createCatalog (Lazy & Projection isolation) ────────────────────────────

test('createCatalog: with empty allowlist, never loads adapter and returns empty envelope', async () => {
  let adapterCalled = false;
  const catalog = createCatalog({
    storeSlugs: '',
    getAdapter: () => {
      adapterCalled = true;
      throw new Error('Adapter must not be loaded');
    },
  });

  const stores = await catalog.listStores({});
  assert.deepEqual(stores, { items: [], page: 1, pageSize: 12, total: 0 });

  const products = await catalog.listProducts({});
  assert.deepEqual(products, { items: [], page: 1, pageSize: 12, total: 0 });

  assert.equal(adapterCalled, false);
});

test('createCatalog: filters store to allowed slug and returns empty if store is not in allowlist', async () => {
  let adapterCalled = false;
  const catalog = createCatalog({
    storeSlugs: 'tienda-uno,tienda-dos',
    getAdapter: () => {
      adapterCalled = true;
      return {};
    },
  });

  // Querying a store that exists elsewhere but is not in allowlist
  const products = await catalog.listProducts({ store: 'tienda-tres' });
  assert.deepEqual(products, { items: [], page: 1, pageSize: 12, total: 0 });
  assert.equal(adapterCalled, false);
});

test('createCatalog: projects only permitted fields, stripping private metadata', async () => {
  const fakeStoreRows = [
    {
      id: 'internal-id-123',
      tenantId: 'secret-tenant-456',
      slug: 'la-guarida',
      name: 'La Guarida del Rock',
      businessType: 'RESTAURANT',
      aiApiKey: 'sk-secret-leak',
    },
  ];
  const fakeProductRows = [
    {
      id: 'prod-cuid-1',
      name: 'Hamburguesa Clasica',
      categoryName: 'Hamburguesas',
      price: 125.5,
      currency: 'MXN',
      cost: 45.0,
      recipeId: 'rec-123',
      store: {
        id: 'store-internal-id',
        slug: 'la-guarida',
        name: 'La Guarida del Rock',
      },
    },
  ];

  const catalog = createCatalog({
    storeSlugs: 'la-guarida',
    getAdapter: () => ({
      listStores: async () => ({ total: 1, rows: fakeStoreRows }),
      listProducts: async () => ({ total: 1, rows: fakeProductRows }),
    }),
  });

  const storesRes = await catalog.listStores({});
  assert.equal(storesRes.total, 1);
  assert.deepEqual(storesRes.items[0], {
    slug: 'la-guarida',
    name: 'La Guarida del Rock',
    businessType: 'RESTAURANT',
  });
  assert.equal(storesRes.items[0].tenantId, undefined);
  assert.equal(storesRes.items[0].aiApiKey, undefined);

  const prodRes = await catalog.listProducts({});
  assert.equal(prodRes.total, 1);
  assert.deepEqual(prodRes.items[0], {
    id: 'prod-cuid-1',
    name: 'Hamburguesa Clasica',
    categoryName: 'Hamburguesas',
    price: 125.5,
    currency: 'MXN',
    store: {
      slug: 'la-guarida',
      name: 'La Guarida del Rock',
    },
  });
  assert.equal(prodRes.items[0].cost, undefined);
  assert.equal(prodRes.items[0].recipeId, undefined);
  assert.equal(prodRes.items[0].store.id, undefined);
});

test('createCatalog: valid page beyond total returns 200 with items: [] and total count', async () => {
  const catalog = createCatalog({
    storeSlugs: 'la-guarida',
    getAdapter: () => ({
      listStores: async () => ({ total: 5, rows: [] }),
      listProducts: async () => ({ total: 5, rows: [] }),
    }),
  });

  const res = await catalog.listStores({ page: '3', pageSize: '12' });
  assert.deepEqual(res, { items: [], page: 3, pageSize: 12, total: 5 });
});

// ── 4. createPrismaCatalogAdapter (Query Structure & Tenant Isolation) ────────

test('createPrismaCatalogAdapter: listStores applies tenant criteria, active filter and escapes q', async () => {
  let countWhere;
  let findManyArgs;

  const mockPrisma = {
    restaurant: {
      count: async ({ where }) => {
        countWhere = where;
        return 1;
      },
      findMany: async (args) => {
        findManyArgs = args;
        return [{ slug: 'tacos-el-100', name: '100% Tacos', businessType: 'RESTAURANT' }];
      },
    },
  };

  const adapter = createPrismaCatalogAdapter(mockPrisma);
  const result = await adapter.listStores({
    slugs: ['tacos-el-100'],
    q: '100%_tacos',
    businessType: 'RESTAURANT',
    page: 2,
    pageSize: 10,
  });

  assert.equal(result.total, 1);
  // Verifies isActive, hasWebStore, isDemo=false
  assert.equal(countWhere.isActive, true);
  assert.deepEqual(countWhere.slug, { in: ['tacos-el-100'] });
  assert.deepEqual(countWhere.tenant, { is: { hasWebStore: true, isDemo: false } });
  assert.equal(countWhere.businessType, 'RESTAURANT');
  // Verifies escaping of % and _ for literal search
  assert.equal(countWhere.name.contains, '100\\%\\_tacos');
  assert.equal(countWhere.name.mode, 'insensitive');

  // Pagination args
  assert.equal(findManyArgs.skip, 10);
  assert.equal(findManyArgs.take, 10);
  assert.deepEqual(findManyArgs.select, { slug: true, name: true, businessType: true });
});

test('createPrismaCatalogAdapter: listProducts enforces availableOnline, valid price and matching category', async () => {
  let menuItemWhere;
  let menuItemSelect;

  const mockPrisma = {
    restaurant: {
      findMany: async () => [
        { id: 'rest-1', slug: 'burger-shop', name: 'Burger Shop' },
      ],
    },
    restaurantConfig: {
      findMany: async () => [
        { restaurantId: 'rest-1', currency: 'MXN' },
      ],
    },
    menuItem: {
      count: async ({ where }) => {
        menuItemWhere = where;
        return 1;
      },
      findMany: async ({ where, select, skip, take }) => {
        menuItemSelect = select;
        return [
          {
            id: 'item-1',
            name: 'Cheeseburger',
            price: 99.0,
            restaurantId: 'rest-1',
            category: { name: 'Burgers' },
          },
        ];
      },
    },
  };

  const adapter = createPrismaCatalogAdapter(mockPrisma);
  const result = await adapter.listProducts({
    slugs: ['burger-shop'],
    q: 'cheese',
    page: 1,
    pageSize: 12,
  });

  assert.equal(result.total, 1);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].currency, 'MXN');
  assert.equal(result.rows[0].price, 99.0);

  // Verifies availability filters
  assert.equal(menuItemWhere.isAvailable, true);
  assert.equal(menuItemWhere.availableOnline, true);
  // Verifies category belongs to the same restaurant and is active
  assert.deepEqual(menuItemWhere.OR, [
    { restaurantId: 'rest-1', category: { is: { restaurantId: 'rest-1', isActive: true } } },
  ]);
  // Verifies select does not retrieve sensitive fields
  assert.deepEqual(menuItemSelect, {
    id: true,
    name: true,
    price: true,
    restaurantId: true,
    category: { select: { name: true } },
  });
});

test('createPrismaCatalogAdapter: listProducts returns empty if no eligible stores match allowlist', async () => {
  let menuItemCalled = false;
  const mockPrisma = {
    restaurant: {
      findMany: async () => [],
    },
    menuItem: {
      count: async () => { menuItemCalled = true; return 0; },
      findMany: async () => { menuItemCalled = true; return []; },
    },
  };

  const adapter = createPrismaCatalogAdapter(mockPrisma);
  const result = await adapter.listProducts({
    slugs: ['inactive-or-demo-store'],
    q: '',
    page: 1,
    pageSize: 12,
  });

  assert.deepEqual(result, { total: 0, rows: [] });
  assert.equal(menuItemCalled, false);
});

// ── 5. createMarketplaceRouter (HTTP, Status Codes & Cache Headers) ───────────

function createMockRouter() {
  const routes = [];
  return {
    routes,
    get(path, handler) {
      routes.push({ path, handler });
    },
  };
}

function createMockReqRes(query = {}) {
  const headers = {};
  let statusCode = 200;
  let jsonBody = null;

  const req = { query };
  const res = {
    set(key, val) {
      headers[key.toLowerCase()] = val;
      return res;
    },
    status(code) {
      statusCode = code;
      return res;
    },
    json(body) {
      jsonBody = body;
      return res;
    },
  };

  return { req, res, getHeader: (k) => headers[k.toLowerCase()], getStatus: () => statusCode, getBody: () => jsonBody };
}

test('router GET /stores: sets Cache-Control: no-store and returns 200 for valid request', async () => {
  const router = createMarketplaceRouter({
    Router: createMockRouter,
    storeSlugs: 'la-guarida',
    getAdapter: () => ({
      listStores: async () => ({ total: 1, rows: [{ slug: 'la-guarida', name: 'La Guarida', businessType: 'RESTAURANT' }] }),
    }),
  });

  const { req, res, getHeader, getStatus, getBody } = createMockReqRes({ page: '1' });
  const route = router.routes.find((r) => r.path === '/stores');
  assert.ok(route);
  await route.handler(req, res);

  assert.equal(getStatus(), 200);
  assert.equal(getHeader('cache-control'), 'no-store');
  assert.equal(getBody().total, 1);
  assert.equal(getBody().items[0].slug, 'la-guarida');
});

test('router GET /stores: returns 400 INVALID_QUERY on malformed parameters', async () => {
  const router = createMarketplaceRouter({
    Router: createMockRouter,
    storeSlugs: 'la-guarida',
  });

  const { req, res, getStatus, getBody } = createMockReqRes({ page: '0' });
  const route = router.routes.find((r) => r.path === '/stores');
  assert.ok(route);
  await route.handler(req, res);

  assert.equal(getStatus(), 400);
  assert.deepEqual(getBody(), {
    error: 'Parametros de catalogo invalidos',
    errorCode: 'INVALID_QUERY',
  });
});

test('router GET /products: returns 503 CATALOG_UNAVAILABLE when database/adapter fails', async () => {
  const router = createMarketplaceRouter({
    Router: createMockRouter,
    storeSlugs: 'la-guarida',
    getAdapter: () => ({
      listProducts: async () => {
        throw new Error('Database connection timed out');
      },
    }),
  });

  const { req, res, getStatus, getBody } = createMockReqRes({});
  const route = router.routes.find((r) => r.path === '/products');
  assert.ok(route);
  await route.handler(req, res);

  assert.equal(getStatus(), 503);
  assert.deepEqual(getBody(), {
    error: 'Catalogo temporalmente no disponible',
    errorCode: 'CATALOG_UNAVAILABLE',
  });
});
