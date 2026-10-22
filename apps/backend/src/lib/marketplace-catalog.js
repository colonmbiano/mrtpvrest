'use strict';

// No application, environment loader or database import: dependencies are injected.
const SLUG = /^[a-z0-9-]{1,100}$/;
const BUSINESS_TYPES = new Set(['RESTAURANT', 'RETAIL', 'GROCERY']);
const CURRENCIES = new Set(Intl.supportedValuesOf('currency'));
const ORDER = [{ name: 'asc' }, { id: 'asc' }];

class InvalidQuery extends Error {}

function parseQuery(query = {}, kind) {
  if (!query || typeof query !== 'object' || Array.isArray(query)) throw new InvalidQuery();
  // Unknown scalar query strings are inert. Structured parameters are never accepted.
  for (const value of Object.values(query)) {
    if (typeof value !== 'string') throw new InvalidQuery();
  }
  const own = key => Object.hasOwn(query, key) ? query[key] : undefined;
  const q = (own('q') || '').trim();
  if (q.length > 80) throw new InvalidQuery();
  function integer(key, fallback, max) {
    const value = own(key);
    if (value === undefined) return fallback;
    if (!/^[1-9][0-9]*$/.test(value) || Number(value) > max) throw new InvalidQuery();
    return Number(value);
  }
  const result = { q, page: integer('page', 1, 10000), pageSize: integer('pageSize', 12, 24) };
  if (kind === 'stores') {
    const businessType = own('businessType');
    if (businessType !== undefined && businessType !== '' && !BUSINESS_TYPES.has(businessType)) throw new InvalidQuery();
    result.businessType = businessType || undefined;
  } else {
    const store = own('store');
    if (store !== undefined && store !== '' && !SLUG.test(store)) throw new InvalidQuery();
    result.store = store || undefined;
  }
  return result;
}

function parseStoreSlugs(value = '') {
  if (typeof value !== 'string') throw new Error('Invalid marketplace allowlist');
  if (!value.trim()) return [];
  const slugs = value.split(',').map(slug => slug.trim());
  if (slugs.length > 100 || slugs.some(slug => !SLUG.test(slug))) {
    throw new Error('Invalid marketplace allowlist');
  }
  return [...new Set(slugs)];
}

// Prisma contains uses LIKE on PostgreSQL. Escape its wildcards for literal search.
function nameFilter(q) {
  return q ? { name: { contains: q.replace(/[\\%_]/g, '\\$&'), mode: 'insensitive' } } : {};
}

function eligibleStores(slugs) {
  return { slug: { in: slugs }, isActive: true, tenant: { is: { hasWebStore: true, isDemo: false } } };
}

function createPrismaCatalogAdapter(prisma) {
  return {
    async listStores({ slugs, q, businessType, page, pageSize }) {
      const where = { ...eligibleStores(slugs), ...nameFilter(q), ...(businessType ? { businessType } : {}) };
      const [total, rows] = await Promise.all([
        prisma.restaurant.count({ where }),
        prisma.restaurant.findMany({ where, select: { slug: true, name: true, businessType: true },
          orderBy: ORDER, skip: (page - 1) * pageSize, take: pageSize }),
      ]);
      return { total, rows };
    },
    async listProducts({ slugs, q, page, pageSize }) {
      // At most 100 explicit stores. Resolve IDs server-side; no tenant header or query is used.
      const stores = await prisma.restaurant.findMany({ where: eligibleStores(slugs),
        select: { id: true, slug: true, name: true }, orderBy: [{ id: 'asc' }], take: 100 });
      if (!stores.length) return { total: 0, rows: [] };
      const ids = stores.map(store => store.id);
      const where = {
        restaurantId: { in: ids },
        restaurant: { is: eligibleStores(slugs) },
        isAvailable: true, availableOnline: true,
        // Both ownership checks are needed even for inconsistent cross-store category links.
        OR: ids.map(restaurantId => ({ restaurantId, category: { is: { restaurantId, isActive: true } } })),
        price: { gte: 0, lte: Number.MAX_VALUE },
        ...nameFilter(q),
      };
      const [total, rows, configs] = await Promise.all([
        prisma.menuItem.count({ where }),
        prisma.menuItem.findMany({ where, select: { id: true, name: true, price: true,
          restaurantId: true, category: { select: { name: true } } },
        orderBy: ORDER, skip: (page - 1) * pageSize, take: pageSize }),
        prisma.restaurantConfig.findMany({ where: { restaurantId: { in: ids } },
          select: { restaurantId: true, currency: true }, take: 100 }),
      ]);
      const byId = new Map(stores.map(store => [store.id, store]));
      const currencies = new Map(configs.map(config => [config.restaurantId, config.currency]));
      return { total, rows: rows.map(row => {
        const store = byId.get(row.restaurantId);
        const currency = currencies.has(row.restaurantId) ? currencies.get(row.restaurantId) : 'MXN';
        if (!store || !row.category || !Number.isFinite(row.price) || row.price < 0 || !CURRENCIES.has(currency)) {
          throw new Error('Invalid public product data');
        }
        return { id: row.id, name: row.name, categoryName: row.category.name,
          price: row.price, currency, store: { slug: store.slug, name: store.name } };
      }) };
    },
  };
}

function createCatalog({ getAdapter, storeSlugs = '' }) {
  let adapter;
  async function list(kind, rawQuery) {
    const query = parseQuery(rawQuery, kind);
    let slugs = parseStoreSlugs(storeSlugs);
    if (query.store) slugs = slugs.filter(slug => slug === query.store);
    const envelope = { items: [], page: query.page, pageSize: query.pageSize, total: 0 };
    if (!slugs.length) return envelope;
    adapter ||= getAdapter();
    const { rows, total } = await (kind === 'stores' ? adapter.listStores : adapter.listProducts)({ ...query, slugs });
    // Project again at the public boundary, even if an injected adapter returns extra fields.
    const items = rows.map(row => kind === 'stores'
      ? { slug: row.slug, name: row.name, businessType: row.businessType }
      : { id: row.id, name: row.name, categoryName: row.categoryName, price: row.price,
        currency: row.currency, store: { slug: row.store.slug, name: row.store.name } });
    return { ...envelope, items, total };
  }
  return { listStores: query => list('stores', query), listProducts: query => list('products', query) };
}

module.exports = { InvalidQuery, parseQuery, parseStoreSlugs, createCatalog, createPrismaCatalogAdapter };
