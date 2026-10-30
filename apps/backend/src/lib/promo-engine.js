'use strict';

// Domain-only engine. Never import Prisma, the app, jobs, timers or environment here.
const DAYS = Object.freeze(['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY']);
const MAX_CENTS = BigInt(Number.MAX_SAFE_INTEGER);

class PromoEngineError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PromoEngineError';
    this.code = code;
  }
}

function requireValue(condition, code, message) {
  if (!condition) throw new PromoEngineError(message, code);
}

function identifier(value, name) {
  requireValue(typeof value === 'string' && value.length > 0 && value.trim() === value,
    'INVALID_ID', `${name} must be a nonempty identifier without surrounding spaces`);
  return value;
}

function daysCopy(days = []) {
  requireValue(Array.isArray(days) && days.every(day => DAYS.includes(day)), 'INVALID_ACTIVE_DAYS', 'Use uppercase weekday names');
  return Object.freeze(DAYS.filter(day => days.includes(day)));
}

function units(value, name) {
  requireValue(Number.isSafeInteger(value) && value >= 0, 'INVALID_UNITS', `${name} must be a nonnegative safe integer`);
  return value;
}

// Exact decimal interpretation of finite JS numbers, including exponent notation.
function decimalRatio(value) {
  const [mantissa, exponent = '0'] = String(value).toLowerCase().split('e');
  const decimals = (mantissa.split('.')[1] || '').length - Number(exponent);
  const digits = BigInt(mantissa.replace('.', ''));
  return decimals >= 0 ? [digits, 10n ** BigInt(decimals)] : [digits * 10n ** BigInt(-decimals), 1n];
}

function promoCents(price, discountPercent) {
  requireValue(typeof price === 'number' && Number.isFinite(price) && price > 0, 'INVALID_PRICE', 'Price must be a positive finite number');
  requireValue(typeof discountPercent === 'number' && Number.isFinite(discountPercent)
    && discountPercent > 0 && discountPercent < 100, 'INVALID_DISCOUNT', 'Discount must be greater than 0 and less than 100');
  const [priceNum, priceDen] = decimalRatio(price);
  const [discountNum, discountDen] = decimalRatio(discountPercent);
  requireValue(priceNum * 100n <= MAX_CENTS * priceDen, 'INVALID_PRICE', 'Price exceeds the safe cent range');
  const numerator = priceNum * (100n * discountDen - discountNum) * 100n;
  const denominator = priceDen * 100n * discountDen;
  // Round half up once, in cents. No binary floating-point multiplication or toFixed.
  const cents = (2n * numerator + denominator) / (2n * denominator);
  return cents > 0n && cents * priceDen < priceNum * 100n ? cents : null;
}

/**
 * Input rows: { locationId, menuItemId, quantity, price }.
 * price is the current regular-price snapshot, not the discounted historic price.
 * Include quantity: 0 rows for known catalog items with no sales in the selected period.
 */
function analyzeLocationSales({ locationId, salesHistory, thresholdUnits, discountPercent, activeDays = [] } = {}) {
  identifier(locationId, 'locationId');
  units(thresholdUnits, 'thresholdUnits');
  // Validate owner settings even for empty history or a zero threshold.
  promoCents(1, discountPercent);
  const days = daysCopy(activeDays);
  requireValue(Array.isArray(salesHistory), 'INVALID_SALES_HISTORY', 'salesHistory must be an array');
  const grouped = new Map();
  for (const row of salesHistory) {
    requireValue(row && typeof row === 'object' && !Array.isArray(row), 'INVALID_SALES_HISTORY', 'Each sale must have an explicit location');
    identifier(row.locationId, 'sale.locationId');
    if (row.locationId !== locationId) continue;
    const menuItemId = identifier(row.menuItemId, 'sale.menuItemId');
    const quantity = units(row.quantity, 'quantity');
    promoCents(row.price, discountPercent);
    const previous = grouped.get(menuItemId);
    requireValue(!previous || previous.price === row.price, 'INCONSISTENT_PRICE', 'Each location/item needs one current regular price');
    const unitsSold = units((previous?.unitsSold || 0) + quantity, 'unitsSold');
    grouped.set(menuItemId, { price: row.price, unitsSold });
  }
  const recommendations = [];
  for (const [menuItemId, { price, unitsSold }] of grouped) {
    if (unitsSold >= thresholdUnits) continue;
    const cents = promoCents(price, discountPercent);
    // Keep the existing pricing invariant: 0 < promoPrice < regular price.
    if (cents === null) continue;
    recommendations.push(Object.freeze({ locationId, menuItemId, unitsSold, thresholdUnits,
      price, discountPercent, promoPrice: Number(cents) / 100, activeDays: days }));
  }
  recommendations.sort((a, b) => a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0);
  return Object.freeze(recommendations);
}

function validateRecommendations(locationId, recommendations) {
  requireValue(Array.isArray(recommendations), 'INVALID_RECOMMENDATIONS', 'recommendations must be an array');
  const seen = new Set();
  return recommendations.map(rec => {
    requireValue(rec && typeof rec === 'object', 'INVALID_RECOMMENDATIONS', 'Invalid recommendation');
    requireValue(rec.locationId === locationId, 'LOCATION_MISMATCH', 'All recommendations must belong to the requested location');
    identifier(rec.menuItemId, 'recommendation.menuItemId');
    requireValue(!seen.has(rec.menuItemId), 'DUPLICATE_RECOMMENDATION', 'Duplicate item in a location batch');
    seen.add(rec.menuItemId);
    units(rec.unitsSold, 'unitsSold');
    units(rec.thresholdUnits, 'thresholdUnits');
    const cents = promoCents(rec.price, rec.discountPercent);
    requireValue(rec.unitsSold < rec.thresholdUnits && cents !== null && Number(cents) / 100 === rec.promoPrice,
      'INVALID_RECOMMENDATIONS', 'Recommendation no longer satisfies the owner rule');
    return Object.freeze({ locationId, menuItemId: rec.menuItemId, price: rec.price, promoPrice: rec.promoPrice,
      activeDays: daysCopy(rec.activeDays) });
  });
}

function result(locationId, applied, skipped) {
  return Object.freeze({ locationId, applied: Object.freeze(applied), skipped: Object.freeze(skipped) });
}

/**
 * Adapter contract:
 * getLocationItems({ locationId, menuItemIds }) -> immutable-readable snapshots
 * compareAndSetLocationPromo({ where, data }) -> { count: 0 | 1 }
 * Every writer must atomically compare and advance the location-specific version.
 */
async function applyAutoPromos({ locationId, recommendations, adapter } = {}) {
  identifier(locationId, 'locationId');
  // Validate the entire input before any effect; never silently filter a foreign recommendation.
  const plans = validateRecommendations(locationId, recommendations);
  if (!plans.length) return result(locationId, [], []);
  requireValue(adapter && typeof adapter.getLocationItems === 'function'
    && typeof adapter.compareAndSetLocationPromo === 'function', 'INVALID_ADAPTER', 'A location-scoped CAS adapter is required');
  const requestedIds = Object.freeze(plans.map(plan => plan.menuItemId));
  const snapshots = await adapter.getLocationItems(Object.freeze({ locationId, menuItemIds: requestedIds }));
  requireValue(Array.isArray(snapshots), 'INVALID_ADAPTER_RESULT', 'Expected location snapshots');
  const items = new Map();
  // Validate and copy all adapter records before the first write.
  for (const row of snapshots) {
    requireValue(row && row.locationId === locationId && requestedIds.includes(row.menuItemId),
      'LOCATION_MISMATCH', 'Adapter returned an unrequested location/item');
    requireValue(!items.has(row.menuItemId), 'INVALID_ADAPTER_RESULT', 'Adapter returned duplicate snapshots');
    requireValue(Number.isSafeInteger(row.version) && row.version >= 0 && row.version < Number.MAX_SAFE_INTEGER
      && typeof row.isPromo === 'boolean', 'INVALID_ADAPTER_RESULT', 'A versioned promo snapshot is required');
    items.set(row.menuItemId, { locationId, menuItemId: row.menuItemId, price: row.price,
      isPromo: row.isPromo, promoSource: row.promoSource ?? null, promoPrice: row.promoPrice,
      version: row.version, activeDays: Array.isArray(row.activeDays) ? [...row.activeDays] : [] });
  }
  const applied = [];
  const skipped = [];
  for (const plan of plans) {
    const current = items.get(plan.menuItemId);
    let reason;
    if (!current) reason = 'NOT_FOUND';
    // Unknown provenance is treated conservatively as a manual/owner promotion.
    else if (current.isPromo && current.promoSource !== 'AUTO') reason = 'MANUAL_PROMO';
    else if (current.price !== plan.price) reason = 'PRICE_CHANGED';
    else if (current.isPromo && current.promoPrice === plan.promoPrice
      && current.activeDays.length === plan.activeDays.length
      && current.activeDays.every((day, index) => day === plan.activeDays[index])) reason = 'UNCHANGED';
    if (!reason) {
      const where = Object.freeze({ locationId, menuItemId: plan.menuItemId, version: current.version,
        price: current.price, isPromo: current.isPromo, promoSource: current.promoSource });
      const data = Object.freeze({ isPromo: true, promoPrice: plan.promoPrice,
        activeDays: plan.activeDays, promoSource: 'AUTO', version: current.version + 1 });
      const updated = await adapter.compareAndSetLocationPromo(Object.freeze({ where, data }));
      requireValue(updated && (updated.count === 0 || updated.count === 1), 'INVALID_ADAPTER_RESULT', 'CAS must update zero or one location/item');
      if (updated.count === 0) reason = 'CONFLICT';
    }
    if (reason) skipped.push(Object.freeze({ locationId, menuItemId: plan.menuItemId, reason }));
    else applied.push(Object.freeze({ locationId, menuItemId: plan.menuItemId,
      isPromo: true, promoPrice: plan.promoPrice, activeDays: plan.activeDays }));
  }
  return result(locationId, applied, skipped);
}

module.exports = { PromoEngineError, analyzeLocationSales, applyAutoPromos };
