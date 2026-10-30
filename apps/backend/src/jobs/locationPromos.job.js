'use strict';

const { analyzeLocationSales, applyAutoPromos, PromoEngineError } = require('../lib/promo-engine');
const { collectLocationSalesHistory, createPrismaPromoAdapter, PromoAdapterError } = require('../lib/promo-adapter-prisma');
const { resolveRuntimePolicy } = require('../lib/runtime-policy');

const SCHEDULE = '15 2 * * 0'; // Sunday 02:15, local business time.
const TIMEZONE = 'America/Mexico_City';
const PAGE_SIZE = 100;
const ENABLED = { isActive: true, OR: [{ locationPromoEnabled: true }, { autoPromoEnabled: true }] };
const SELECT = { id: true, restaurantId: true, isActive: true, locationPromoEnabled: true,
  autoPromoEnabled: true, autoPromoThreshold: true, autoPromoDiscount: true,
  autoPromoMaxItems: true, autoPromoActiveDays: true, autoPromoVersion: true };
const TX_OPTIONS = { isolationLevel: 'RepeatableRead', maxWait: 5000, timeout: 30000 };
const runningClients = new WeakSet();
let scheduledTask;

function emit(logger, level, event, fields) {
  // An unavailable log sink must not roll back a successful location transaction.
  try { logger[level](event, fields); } catch { /* Logging is best effort. */ }
}
function errorCode(error) {
  if (error instanceof PromoAdapterError || error instanceof PromoEngineError) return error.code;
  return /^P\d{4}$/.test(error?.code) ? error.code : 'PROMO_JOB_FAILED';
}
function validateClient(prismaClient) {
  if (!prismaClient || typeof prismaClient.$transaction !== 'function'
    || typeof prismaClient.location?.findMany !== 'function') {
    throw new TypeError('A root Prisma client with interactive transactions is required');
  }
}

async function processLocation({ prismaClient, row, dryRun, now }) {
  return prismaClient.$transaction(async tx => {
    // Recheck settings under a lock: discovery is only a candidate list.
    const locked = await tx.$queryRaw`SELECT "id" FROM "locations" WHERE "id" = ${row.id}
      AND "restaurantId" = ${row.restaurantId} AND "isActive" = true FOR SHARE`;
    if (!locked.length) return { status: 'skipped', reason: 'LOCATION_CHANGED' };
    const loc = await tx.location.findFirst({
      where: { ...ENABLED, id: row.id, restaurantId: row.restaurantId }, select: SELECT,
    });
    if (!loc) return { status: 'skipped', reason: 'LOCATION_CHANGED' };
    if (loc.id !== row.id || loc.restaurantId !== row.restaurantId || !loc.isActive
      || !(loc.locationPromoEnabled || loc.autoPromoEnabled)) {
      throw new PromoAdapterError('SCOPE_VIOLATION', 'Respuesta fuera de alcance', 503);
    }
    if (!Number.isInteger(loc.autoPromoMaxItems) || loc.autoPromoMaxItems < 0 || loc.autoPromoMaxItems > 2147483647) {
      throw new PromoAdapterError('INVALID_SETTINGS', 'Tope de promociones invalido');
    }
    const salesHistory = await collectLocationSalesHistory({ locationId: loc.id,
      restaurantId: loc.restaurantId, days: 7, prismaClient: tx, now });
    let recommendations = analyzeLocationSales({ locationId: loc.id, salesHistory,
      thresholdUnits: loc.autoPromoThreshold, discountPercent: loc.autoPromoDiscount,
      activeDays: loc.autoPromoActiveDays });
    const adapter = createPrismaPromoAdapter({ prismaClient: tx, restaurantId: loc.restaurantId });
    const snapshots = await adapter.getLocationItems({ locationId: loc.id,
      menuItemIds: recommendations.map(rec => rec.menuItemId) });
    const manual = new Set(snapshots.filter(item => item.isPromo && item.promoSource !== 'AUTO').map(item => item.menuItemId));
    // Match the on-demand endpoint: 0 means unlimited; manual promotions consume no slots.
    if (loc.autoPromoMaxItems > 0) {
      const selected = new Set([...recommendations].filter(rec => !manual.has(rec.menuItemId))
        .sort((a, b) => a.unitsSold - b.unitsSold || (a.menuItemId < b.menuItemId ? -1 : a.menuItemId > b.menuItemId ? 1 : 0))
        .slice(0, loc.autoPromoMaxItems).map(rec => rec.menuItemId));
      recommendations = recommendations.filter(rec => manual.has(rec.menuItemId) || selected.has(rec.menuItemId));
    }
    const ids = new Set(recommendations.map(rec => rec.menuItemId));
    const outcome = await applyAutoPromos({ locationId: loc.id, recommendations, adapter: {
      getLocationItems: async () => snapshots.filter(item => ids.has(item.menuItemId)),
      compareAndSetLocationPromo: dryRun ? async () => ({ count: 1 }) : adapter.compareAndSetLocationPromo,
    } });
    const skipped = outcome.skipped.reduce((counts, item) => {
      counts[item.reason] = (counts[item.reason] || 0) + 1;
      return counts;
    }, {});
    return { status: 'succeeded', version: loc.autoPromoVersion, recommendations: recommendations.length,
      applied: dryRun ? 0 : outcome.applied.length, planned: dryRun ? outcome.applied.length : 0, skipped };
  }, TX_OPTIONS);
}

/** Sequential, bounded discovery; each location commits or rolls back independently.
 * Importing this module does not instantiate Prisma or register any timers.
 * now/logger are optional seams for deterministic offline testing and structured observability.
 */
async function runLocationPromosJob({ prismaClient, dryRun = false, now = new Date(), logger } = {}) {
  validateClient(prismaClient);
  if (typeof dryRun !== 'boolean') throw new TypeError('dryRun must be boolean');
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Invalid analysis cutoff');
  if (runningClients.has(prismaClient)) throw new PromoAdapterError('PROMO_JOB_RUNNING', 'Job ya en curso', 409);
  const log = logger || require('../lib/logger')('location-promos');
  const cutoff = new Date(now.getTime());
  const started = Date.now();
  const summary = { dryRun, cutoff: cutoff.toISOString(), seen: 0, succeeded: 0, failed: 0,
    skipped: 0, applied: 0, planned: 0, results: [] };
  runningClients.add(prismaClient);
  emit(log, 'info', 'location_promos.started', { dryRun, cutoff: summary.cutoff });
  try {
    let after;
    const seenIds = new Set();
    for (;;) {
      const locations = await prismaClient.location.findMany({ where: { ...ENABLED, ...(after ? { id: { gt: after } } : {}) },
        select: { id: true, restaurantId: true }, orderBy: { id: 'asc' }, take: PAGE_SIZE });
      // Refuse a broken adapter/page instead of looping forever or processing a scope twice.
      const pageIds = new Set();
      if (locations.length > PAGE_SIZE || locations.some(row => {
        const invalid = typeof row.id !== 'string' || !row.id || typeof row.restaurantId !== 'string'
          || !row.restaurantId || seenIds.has(row.id) || pageIds.has(row.id);
        pageIds.add(row.id);
        return invalid;
      })) throw new PromoAdapterError('INVALID_LOCATION_PAGE', 'Pagina de sucursales invalida', 503);
      for (const row of locations) {
        seenIds.add(row.id);
        summary.seen++;
        let result;
        try {
          result = await processLocation({ prismaClient, row, dryRun, now: cutoff });
        } catch (error) {
          result = { status: 'failed', errorCode: errorCode(error) };
        }
        const record = { locationId: row.id, restaurantId: row.restaurantId, ...result };
        summary.results.push(record);
        summary[result.status]++;
        summary.applied += result.applied || 0;
        summary.planned += result.planned || 0;
        emit(log, result.status === 'failed' ? 'error' : 'info', 'location_promos.location_finished', { dryRun, ...record });
      }
      if (locations.length < PAGE_SIZE) break;
      after = locations[locations.length - 1].id;
    }
    emit(log, summary.failed ? 'warn' : 'info', 'location_promos.finished', { dryRun, seen: summary.seen,
      succeeded: summary.succeeded, failed: summary.failed, skipped: summary.skipped,
      applied: summary.applied, planned: summary.planned, durationMs: Date.now() - started });
    return summary;
  } catch (error) {
    // Discovery failures invalidate the run, but cannot undo already committed locations.
    emit(log, 'error', 'location_promos.failed', { dryRun, errorCode: errorCode(error),
      seen: summary.seen, succeeded: summary.succeeded, failed: summary.failed, durationMs: Date.now() - started });
    throw error;
  } finally {
    runningClients.delete(prismaClient);
  }
}

/** Explicit registration only. Existing global legacy job and startup registration stay unchanged.
 * Returns the scheduled task (stop/destroy supported by node-cron), or null when jobs are disabled.
 */
function startLocationPromosCronJob({ prismaClient, cron, logger, env = process.env } = {}) {
  const policy = resolveRuntimePolicy(env);
  if (!policy.jobsEnabled || policy.isolated) return null;
  if (scheduledTask && scheduledTask.getStatus() !== 'destroyed') return scheduledTask;
  const scheduler = cron || require('node-cron');
  const log = logger || require('../lib/logger')('location-promos');
  // Resolve the real client only when an explicitly registered tick fires.
  scheduledTask = scheduler.schedule(SCHEDULE, async () => {
    try {
      const client = prismaClient || require('@mrtpvrest/database').prisma;
      await runLocationPromosJob({ prismaClient: client, logger: log });
    } catch (error) {
      emit(log, 'error', 'location_promos.cron_failed', { errorCode: errorCode(error) });
    }
  }, { timezone: TIMEZONE, noOverlap: true, name: 'location-promos-weekly' });
  emit(log, 'info', 'location_promos.registered', { schedule: SCHEDULE, timezone: TIMEZONE });
  return scheduledTask;
}

module.exports = { runLocationPromosJob, startLocationPromosCronJob };
