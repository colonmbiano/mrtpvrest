'use strict';

const { analyzeLocationSales, applyAutoPromos, PromoEngineError } = require('./promo-engine');
const MAX_ITEMS = 5000;
const MAX_INT = 2147483647;
const TX_OPTIONS = Object.freeze({ isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30000 });
const SETTINGS_SELECT = Object.freeze({ id: true, restaurantId: true, isActive: true,
  locationPromoEnabled: true, autoPromoThreshold: true, autoPromoDiscount: true,
  autoPromoMaxItems: true, autoPromoActiveDays: true, autoPromoVersion: true });
const ITEM_SELECT = Object.freeze({ id: true, restaurantId: true, price: true, isPromo: true,
  promoPrice: true, activeDays: true, isAvailable: true });

class PromoAdapterError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PromoAdapterError';
    this.code = code;
    this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 400) {
  if (!ok) throw new PromoAdapterError(code, message, status);
}
function id(value) {
  check(typeof value === 'string' && value.length > 0 && value.length <= 200 && value.trim() === value,
    'INVALID_ID', 'Identificador invalido');
  return value;
}
function integer(value) { return Number.isInteger(value) && value >= 0 && value <= MAX_INT; }
function transaction(client, work) {
  return typeof client.$transaction === 'function' ? client.$transaction(work, TX_OPTIONS) : work(client);
}
function eligibleMenu(restaurantId) {
  return { restaurantId, isAvailable: true, price: { gt: 0, lte: Number.MAX_SAFE_INTEGER / 100 },
    category: { is: { restaurantId, isActive: true } } };
}
async function location(client, locationId, restaurantId) {
  const row = await client.location.findFirst({
    where: { id: id(locationId), ...(restaurantId ? { restaurantId: id(restaurantId) } : {}), isActive: true },
    select: SETTINGS_SELECT,
  });
  check(row && row.id === locationId && (!restaurantId || row.restaurantId === restaurantId) && row.isActive,
    'LOCATION_NOT_FOUND', 'Sucursal no encontrada', 404);
  return row;
}
async function lockLocation(client, locationId, restaurantId) {
  // Parameterized tags, never interpolated SQL. Shared locks serialize settings/identity
  // changes without modifying Location or the global MenuItem promo fields.
  return client.$queryRaw`SELECT "id" FROM "locations" WHERE "id" = ${locationId}
    AND "restaurantId" = ${restaurantId} AND "isActive" = true FOR SHARE`;
}

/** Paid, non-cancelled, wholly unrefunded orders in [now-days, now).
 * Include every currently sellable item, including zero sellers, using its CURRENT base price.
 */
async function collectLocationSalesHistory({ locationId, days = 7, prismaClient, restaurantId, now = new Date() } = {}) {
  id(locationId);
  check(Number.isInteger(days) && days >= 1 && days <= 365, 'INVALID_DAYS', 'days debe estar entre 1 y 365');
  check(now instanceof Date && Number.isFinite(now.getTime()), 'INVALID_DATE', 'Fecha de corte invalida');
  check(prismaClient, 'INVALID_ADAPTER', 'Cliente Prisma requerido');
  const end = new Date(now.getTime());
  const start = new Date(end.getTime() - days * 86400000);
  return transaction(prismaClient, async tx => {
    const loc = await location(tx, locationId, restaurantId);
    const rid = loc.restaurantId;
    const items = await tx.menuItem.findMany({ where: eligibleMenu(rid), select: ITEM_SELECT,
      orderBy: { id: 'asc' }, take: MAX_ITEMS + 1 });
    check(items.length <= MAX_ITEMS, 'CATALOG_TOO_LARGE', 'Catalogo excede el limite de analisis', 413);
    if (!items.length) return Object.freeze([]);
    check(items.every(item => item.restaurantId === rid), 'SCOPE_VIOLATION', 'Respuesta fuera de alcance', 503);
    const totals = await tx.orderItem.groupBy({ by: ['menuItemId'],
      where: { menuItemId: { in: items.map(item => item.id) }, quantity: { gt: 0 },
        menuItem: { is: { restaurantId: rid } },
        order: { is: { restaurantId: rid, locationId, status: { notIn: ['CANCELLED'] },
          paymentStatus: 'PAID', refundedAmount: 0, createdAt: { gte: start, lt: end } } } },
      _sum: { quantity: true } });
    const byId = new Map(totals.map(row => [row.menuItemId, row._sum.quantity ?? 0]));
    check(totals.every(row => items.some(item => item.id === row.menuItemId)), 'SCOPE_VIOLATION', 'Ventas fuera de alcance', 503);
    return Object.freeze(items.map(item => Object.freeze({ locationId, menuItemId: item.id,
      quantity: byId.get(item.id) ?? 0, price: item.price })));
  });
}

function createPrismaPromoAdapter({ prismaClient, restaurantId } = {}) {
  id(restaurantId);
  check(prismaClient, 'INVALID_ADAPTER', 'Cliente Prisma requerido');
  return Object.freeze({
    async getLocationItems({ locationId, menuItemIds }) {
      id(locationId);
      check(Array.isArray(menuItemIds) && menuItemIds.length <= MAX_ITEMS, 'INVALID_ITEMS', 'Listado de articulos invalido');
      menuItemIds.forEach(id);
      if (!menuItemIds.length) return [];
      return transaction(prismaClient, async tx => {
        await location(tx, locationId, restaurantId);
        const [items, overrides] = await Promise.all([
          tx.menuItem.findMany({ where: { ...eligibleMenu(restaurantId), id: { in: menuItemIds } }, select: ITEM_SELECT }),
          tx.locationMenuItemPromo.findMany({ where: { restaurantId, locationId, menuItemId: { in: menuItemIds } },
            select: { restaurantId: true, locationId: true, menuItemId: true, isPromo: true,
              promoPrice: true, promoSource: true, activeDays: true, version: true } }),
        ]);
        check(items.every(item => item.restaurantId === restaurantId && menuItemIds.includes(item.id))
          && overrides.every(row => row.restaurantId === restaurantId && row.locationId === locationId && menuItemIds.includes(row.menuItemId)),
        'SCOPE_VIOLATION', 'Respuesta fuera de alcance', 503);
        const local = new Map(overrides.map(row => [row.menuItemId, row]));
        return items.map(item => {
          const row = local.get(item.id);
          // A global promotion has unknown provenance: preserve it as an owner promotion.
          const manualGlobal = item.isPromo === true;
          return { locationId, menuItemId: item.id, price: item.price,
            isPromo: manualGlobal || row?.isPromo === true,
            promoSource: manualGlobal ? 'MANUAL' : row?.promoSource ?? null,
            promoPrice: manualGlobal ? item.promoPrice : row?.promoPrice == null ? null : Number(row.promoPrice),
            activeDays: [...(manualGlobal ? item.activeDays : row?.activeDays) || []], version: row?.version ?? 0 };
        });
      });
    },
    async compareAndSetLocationPromo({ where, data }) {
      id(where?.locationId); id(where?.menuItemId);
      check(integer(where.version) && where.version < MAX_INT && typeof where.isPromo === 'boolean'
        && [null, 'AUTO', 'MANUAL'].includes(where.promoSource), 'INVALID_CAS', 'Condicion CAS invalida');
      check(data?.isPromo === true && data.promoSource === 'AUTO' && data.version === where.version + 1
        && Number.isFinite(where.price) && where.price > 0 && Number.isFinite(data.promoPrice)
        && data.promoPrice > 0 && data.promoPrice < where.price && Number.isSafeInteger(Math.round(data.promoPrice * 100))
        && Number(data.promoPrice.toFixed(2)) === data.promoPrice && Array.isArray(data.activeDays),
      'INVALID_CAS', 'Precio o version CAS invalido');
      // Reuse the domain validator for weekday names, without changing input arrays.
      analyzeLocationSales({ locationId: where.locationId, salesHistory: [], thresholdUnits: 0,
        discountPercent: 1, activeDays: data.activeDays });
      if (where.isPromo && where.promoSource !== 'AUTO') return { count: 0 };
      return transaction(prismaClient, async tx => {
        if (!(await lockLocation(tx, where.locationId, restaurantId)).length) return { count: 0 };
        const locked = await tx.$queryRaw`SELECT "id" FROM "menu_items" WHERE "id" = ${where.menuItemId}
          AND "restaurantId" = ${restaurantId} FOR SHARE`;
        if (!locked.length) return { count: 0 };
        const item = await tx.menuItem.findFirst({ where: { ...eligibleMenu(restaurantId), id: where.menuItemId }, select: ITEM_SELECT });
        if (!item || item.isPromo || item.price !== where.price) return { count: 0 };
        const write = { isPromo: true, promoPrice: data.promoPrice.toFixed(2), activeDays: [...data.activeDays],
          promoSource: 'AUTO', version: data.version };
        const updated = await tx.locationMenuItemPromo.updateMany({
          where: { restaurantId, locationId: where.locationId, menuItemId: where.menuItemId,
            version: where.version, isPromo: where.isPromo, promoSource: where.promoSource }, data: write });
        if (updated.count) return updated;
        // First activation must not create anything when the expected state was not empty.
        if (where.version !== 0 || where.isPromo || where.promoSource !== null) return { count: 0 };
        return tx.locationMenuItemPromo.createMany({ data: [{ restaurantId, locationId: where.locationId,
          menuItemId: where.menuItemId, ...write }], skipDuplicates: true });
      });
    },
  });
}

function principal(req) {
  check(req.user, 'UNAUTHENTICATED', 'Autenticacion requerida', 401);
  check(['ADMIN', 'SUPER_ADMIN'].includes(req.user.role), 'FORBIDDEN', 'Acceso restringido a administradores', 403);
  const rid = req.restaurantId || req.user.restaurantId;
  id(rid);
  if (req.user.role !== 'SUPER_ADMIN') {
    check(req.user.restaurantId === rid && typeof req.user.tenantId === 'string', 'FORBIDDEN', 'Contexto de restaurante no autorizado', 403);
    check(!req.user.locationId || req.user.locationId === req.params.id, 'FORBIDDEN', 'Sucursal no autorizada', 403);
  }
  return rid;
}
async function authorizedLocation(tx, req, rid) {
  const loc = await location(tx, req.params.id, rid);
  if (req.user.role !== 'SUPER_ADMIN') {
    const owner = await tx.restaurant.findFirst({ where: { id: rid, tenantId: req.user.tenantId }, select: { id: true } });
    check(owner, 'FORBIDDEN', 'Restaurante no autorizado', 403);
  }
  return loc;
}
function bodyObject(body, keys) {
  check(body && typeof body === 'object' && !Array.isArray(body) && Object.keys(body).every(key => keys.includes(key)),
    'INVALID_BODY', 'Parametros invalidos');
}
function respondError(res, error) {
  if (error instanceof PromoAdapterError || error instanceof PromoEngineError) {
    return res.status(error.statusCode || 400).json({ error: error.message, errorCode: error.code });
  }
  if (['P2034', 'P2028'].includes(error?.code)) return res.status(409).json({ error: 'Configuracion o promociones cambiaron; vuelve a intentar', errorCode: 'PROMO_CONFLICT' });
  return res.status(503).json({ error: 'Motor de promociones temporalmente no disponible', errorCode: 'PROMO_UNAVAILABLE' });
}
function createPromoLocationHandlers({ prismaClient, now = () => new Date() }) {
  return {
    async settings(req, res) {
      res.set('Cache-Control', 'no-store');
      try {
        const rid = principal(req);
        bodyObject(req.body, ['enabled', 'thresholdUnits', 'discountPercent', 'activeDays', 'maxItems']);
        const { enabled, thresholdUnits, discountPercent, activeDays, maxItems = 0 } = req.body;
        check(typeof enabled === 'boolean' && integer(thresholdUnits) && integer(maxItems) && Array.isArray(activeDays), 'INVALID_SETTINGS', 'Configuracion invalida');
        analyzeLocationSales({ locationId: req.params.id, salesHistory: [], thresholdUnits, discountPercent, activeDays });
        const result = await transaction(prismaClient, async tx => {
          await authorizedLocation(tx, req, rid);
          const updated = await tx.location.updateMany({ where: { id: req.params.id, restaurantId: rid, isActive: true },
            data: { locationPromoEnabled: enabled, autoPromoEnabled: false, autoPromoThreshold: thresholdUnits,
              autoPromoDiscount: discountPercent, autoPromoActiveDays: [...new Set(activeDays)], autoPromoMaxItems: maxItems,
              autoPromoVersion: { increment: 1 } } });
          check(updated.count === 1, 'PROMO_CONFLICT', 'La sucursal cambio', 409);
          return location(tx, req.params.id, rid);
        });
        return res.json({ locationId: result.id, enabled: result.locationPromoEnabled, thresholdUnits: result.autoPromoThreshold,
          discountPercent: result.autoPromoDiscount, activeDays: result.autoPromoActiveDays,
          maxItems: result.autoPromoMaxItems, version: result.autoPromoVersion });
      } catch (error) { return respondError(res, error); }
    },
    async run(req, res) {
      res.set('Cache-Control', 'no-store');
      try {
        const rid = principal(req);
        id(req.params.id);
        bodyObject(req.body ?? {}, ['dryRun']);
        const { dryRun = true } = req.body || {};
        check(typeof dryRun === 'boolean', 'INVALID_BODY', 'dryRun debe ser booleano');
        const result = await transaction(prismaClient, async tx => {
          await lockLocation(tx, req.params.id, rid);
          const loc = await authorizedLocation(tx, req, rid);
          check(dryRun || loc.locationPromoEnabled, 'PROMOS_DISABLED', 'Promociones automaticas desactivadas', 409);
          const salesHistory = await collectLocationSalesHistory({ locationId: loc.id, restaurantId: rid, prismaClient: tx, now: now() });
          let recommendations = analyzeLocationSales({ locationId: loc.id, salesHistory,
            thresholdUnits: loc.autoPromoThreshold, discountPercent: loc.autoPromoDiscount, activeDays: loc.autoPromoActiveDays });
          const adapter = createPrismaPromoAdapter({ prismaClient: tx, restaurantId: rid });
          const snapshots = await adapter.getLocationItems({ locationId: loc.id, menuItemIds: recommendations.map(rec => rec.menuItemId) });
          const manual = new Set(snapshots.filter(row => row.isPromo && row.promoSource !== 'AUTO').map(row => row.menuItemId));
          if (loc.autoPromoMaxItems > 0) {
            const selected = new Set([...recommendations].filter(rec => !manual.has(rec.menuItemId))
              .sort((a, b) => a.unitsSold - b.unitsSold || (a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0))
              .slice(0, loc.autoPromoMaxItems).map(rec => rec.menuItemId));
            recommendations = recommendations.filter(rec => manual.has(rec.menuItemId) || selected.has(rec.menuItemId));
          }
          const outcome = await applyAutoPromos({ locationId: loc.id, recommendations, adapter: {
            getLocationItems: async () => snapshots.filter(row => recommendations.some(rec => rec.menuItemId === row.menuItemId)),
            compareAndSetLocationPromo: dryRun ? async () => ({ count: 1 }) : adapter.compareAndSetLocationPromo,
          } });
          if (dryRun) return { locationId: loc.id, dryRun, version: loc.autoPromoVersion,
            recommendations, planned: outcome.applied, skipped: outcome.skipped };
          return { ...outcome, dryRun, version: loc.autoPromoVersion };
        });
        return res.json(result);
      } catch (error) { return respondError(res, error); }
    },
  };
}

module.exports = { createPrismaPromoAdapter, collectLocationSalesHistory, createPromoLocationHandlers, PromoAdapterError };
