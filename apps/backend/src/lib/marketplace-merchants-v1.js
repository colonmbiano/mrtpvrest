'use strict';

// Public v1 discovery and catalog (plan §5.1, §6). Every response is built from a whitelist
// projection, so contact data, owner ids, tax ids and internal flags cannot leak through a new
// field. Ports are injected: repo.findPublishedMerchants(), repo.findPublishedMerchantBySlug(slug)
// and repo.findMerchantCatalog(merchantId). Without a repo the service fails closed with 503.
// Money leaves as two-decimal strings; ports speak integer cents.
const { haversineKm } = require('./delivery-fee');
const { decimal, MAX_CENTS } = require('./marketplace-order-money');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SLUG = /^[a-z0-9-]{1,100}$/;
const CATEGORY = /^[A-Za-z0-9_-]{1,40}$/;
const COORDINATE = /^-?\d{1,3}(?:\.\d{1,8})?$/;
const LIMIT = /^[1-9]\d*$/;
const QUERY_KEYS = ['lat', 'lng', 'category', 'open', 'limit'];
const PAYMENT_METHOD = /^[A-Z_]{2,20}$/;

class MerchantsV1Error extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'MerchantsV1Error';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function fail(code, message, statusCode) {
  throw new MerchantsV1Error(code, message, statusCode);
}

function parseQuery(query) {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) fail('INVALID_QUERY', 'Parametros invalidos');
  // Repeated keys arrive as arrays and are rejected, as are unknown keys.
  for (const [key, value] of Object.entries(query)) {
    if (!QUERY_KEYS.includes(key) || typeof value !== 'string') fail('INVALID_QUERY', 'Parametros invalidos');
  }
  const hasLat = query.lat !== undefined;
  const hasLng = query.lng !== undefined;
  if (hasLat !== hasLng) fail('INVALID_QUERY', 'lat y lng deben enviarse juntos');
  let location = null;
  if (hasLat) {
    if (!COORDINATE.test(query.lat) || !COORDINATE.test(query.lng)) fail('INVALID_QUERY', 'Coordenadas invalidas');
    const lat = Number(query.lat);
    const lng = Number(query.lng);
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) fail('INVALID_QUERY', 'Coordenadas fuera de rango');
    location = { lat, lng };
  }
  if (query.category !== undefined && !CATEGORY.test(query.category)) fail('INVALID_QUERY', 'Categoria invalida');
  if (query.open !== undefined && query.open !== 'true' && query.open !== 'false') fail('INVALID_QUERY', 'open debe ser true o false');
  if (query.limit !== undefined && (!LIMIT.test(query.limit) || Number(query.limit) > MAX_LIMIT)) {
    fail('INVALID_QUERY', `limit debe estar entre 1 y ${MAX_LIMIT}`);
  }
  return {
    location,
    category: query.category,
    open: query.open === undefined ? undefined : query.open === 'true',
    limit: query.limit === undefined ? DEFAULT_LIMIT : Number(query.limit),
  };
}

const isPublished = merchant => merchant && merchant.published === true && merchant.status === 'ACTIVE';
const text = value => (typeof value === 'string' ? value : null);
const strings = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string') : []);
const money = cents => (Number.isSafeInteger(cents) && cents >= 0 && cents <= MAX_CENTS ? decimal(cents) : null);
const hasPickupPoint = pickup => Boolean(pickup) && Number.isFinite(pickup.lat) && Number.isFinite(pickup.lng);
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

function zoneView(zone) {
  return { id: zone.id, name: text(zone.name), fee: money(zone.feeCents) };
}

function discoverView(merchant, distanceKm) {
  return {
    slug: merchant.slug,
    name: merchant.name,
    logo: text(merchant.logo),
    banner: text(merchant.banner),
    categories: strings(merchant.categories),
    estimatedReadyMinutes: Number.isInteger(merchant.estimatedReadyMinutes) && merchant.estimatedReadyMinutes > 0
      ? merchant.estimatedReadyMinutes : null,
    // Rating is not in the schema yet. It is null until a real source exists.
    rating: typeof merchant.rating === 'number' && Number.isFinite(merchant.rating) ? merchant.rating : null,
    minOrder: money(merchant.minOrderCents ?? 0),
    deliveryZones: (merchant.deliveryZones || []).filter(zone => zone.active !== false).map(zoneView),
    open: merchant.open === true,
    distanceKm,
  };
}

function detailView(merchant) {
  const pickup = hasPickupPoint(merchant.pickup)
    ? { address: text(merchant.pickup.address), lat: merchant.pickup.lat, lng: merchant.pickup.lng } : null;
  return {
    ...discoverView(merchant, null),
    deliveryZones: (merchant.deliveryZones || []).filter(zone => zone.active !== false).map(zone => ({
      ...zoneView(zone),
      polygon: (Array.isArray(zone.polygon) ? zone.polygon : [])
        .filter(point => point && Number.isFinite(point.lat) && Number.isFinite(point.lng))
        .map(point => ({ lat: point.lat, lng: point.lng })),
    })),
    businessHours: merchant.businessHours ?? null,
    pickup,
    paymentMethods: strings(merchant.paymentMethods).filter(method => PAYMENT_METHOD.test(method)),
  };
}

function modifierGroups(groups) {
  return (Array.isArray(groups) ? groups : [])
    .filter(group => group && typeof group.id === 'string' && typeof group.name === 'string')
    .map(group => ({
      id: group.id,
      name: group.name,
      required: group.required === true,
      min: Number.isInteger(group.min) && group.min >= 0 ? group.min : 0,
      max: Number.isInteger(group.max) && group.max >= 0 ? group.max : null,
      options: (Array.isArray(group.options) ? group.options : [])
        .filter(option => option && typeof option.id === 'string' && typeof option.name === 'string' && option.available !== false)
        .map(option => ({ id: option.id, name: option.name, priceDelta: money(option.priceDeltaCents ?? 0) }))
        .filter(option => option.priceDelta !== null),
    }));
}

// Promo only when the adapter reports it active and the promo price is a real discount.
function promoPrice(item) {
  if (item.promoActive !== true || !Number.isSafeInteger(item.promoPriceCents)
    || item.promoPriceCents < 0 || item.promoPriceCents >= item.unitPriceCents) return null;
  return money(item.promoPriceCents);
}

function catalogView(merchant, catalog) {
  const categories = (catalog.categories || [])
    .filter(category => category && category.isActive !== false && typeof category.id === 'string' && text(category.name))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || byText(a.id, b.id));
  const buckets = new Map(categories.map(category => [category.id, { id: category.id, name: category.name, items: [] }]));
  const items = [...(catalog.items || [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || byText(String(a.id), String(b.id)));
  for (const item of items) {
    const bucket = buckets.get(item.categoryId);
    // Only items sold online and currently available. Invalid prices drop the item, not the catalog.
    if (!bucket || item.availableOnline !== true || item.isAvailable !== true || typeof item.id !== 'string' || !text(item.name)) continue;
    const unitPrice = money(item.unitPriceCents);
    if (unitPrice === null) continue;
    bucket.items.push({ id: item.id, name: item.name, description: text(item.description), unitPrice,
      promoPrice: promoPrice(item), modifiers: modifierGroups(item.modifierGroups) });
  }
  return {
    merchant: { slug: merchant.slug, name: merchant.name, open: merchant.open === true },
    categories: [...buckets.values()].filter(bucket => bucket.items.length > 0),
  };
}

function createMerchantsV1Service({ repo } = {}) {
  function ready() {
    if (!repo || typeof repo.findPublishedMerchants !== 'function' || typeof repo.findPublishedMerchantBySlug !== 'function'
      || typeof repo.findMerchantCatalog !== 'function') {
      fail('MARKETPLACE_UNAVAILABLE', 'Marketplace no disponible', 503);
    }
  }
  async function publishedBySlug(slug) {
    ready();
    // An invalid slug is reported as not found, so the endpoint does not reveal its rules.
    if (typeof slug !== 'string' || !SLUG.test(slug)) fail('MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    const merchant = await repo.findPublishedMerchantBySlug(slug);
    if (!isPublished(merchant) || merchant.slug !== slug) fail('MERCHANT_NOT_FOUND', 'Comercio no encontrado', 404);
    return merchant;
  }
  async function listMerchants(rawQuery) {
    const query = parseQuery(rawQuery);
    ready();
    const matches = (await repo.findPublishedMerchants())
      .filter(merchant => isPublished(merchant))
      .filter(merchant => query.category === undefined || (merchant.categories || []).includes(query.category))
      .filter(merchant => query.open === undefined || (merchant.open === true) === query.open)
      .map(merchant => {
        const pickup = merchant.pickup;
        const distanceKm = query.location && hasPickupPoint(pickup)
          ? Math.round(haversineKm(query.location.lat, query.location.lng, pickup.lat, pickup.lng) * 100) / 100
          : null;
        return { merchant, distanceKm };
      });
    // With coordinates: nearest first, merchants without a pickup point last. Ties and no-location fall back to slug.
    matches.sort((a, b) => {
      if (query.location && a.distanceKm !== b.distanceKm) {
        if (a.distanceKm === null) return 1;
        if (b.distanceKm === null) return -1;
        return a.distanceKm - b.distanceKm;
      }
      return byText(a.merchant.slug, b.merchant.slug);
    });
    return {
      items: matches.slice(0, query.limit).map(({ merchant, distanceKm }) => discoverView(merchant, distanceKm)),
      total: matches.length,
      limit: query.limit,
    };
  }
  async function getMerchant(slug) {
    return detailView(await publishedBySlug(slug));
  }
  async function getMerchantCatalog(slug) {
    const merchant = await publishedBySlug(slug);
    const catalog = await repo.findMerchantCatalog(merchant.id);
    return catalogView(merchant, catalog || {});
  }
  return { listMerchants, getMerchant, getMerchantCatalog };
}

module.exports = { MerchantsV1Error, createMerchantsV1Service, parseQuery, DEFAULT_LIMIT, MAX_LIMIT };
