'use strict';

// Aprobación de comercios para el directorio del marketplace. Un negocio con el
// módulo "marketplace" activo solicita aparecer y la plataforma (SUPER_ADMIN) lo
// aprueba, rechaza o suspende. El directorio solo publica filas APPROVED
// (lib/marketplace-catalog.js con MARKETPLACE_DIRECTORY_APPROVED=true).
// Sin imports de BD ni de entorno: el cliente Prisma y la verificación del
// módulo se inyectan.

const STATUS = Object.freeze({
  PENDING: 'PENDING', APPROVED: 'APPROVED', REJECTED: 'REJECTED', SUSPENDED: 'SUSPENDED',
});

// Decisión de la plataforma → estado nuevo y estados desde los que se permite.
// Un comercio rechazado vuelve a solicitar por su cuenta; uno suspendido solo
// regresa si la plataforma lo reactiva.
const DECISIONS = Object.freeze({
  APPROVE: { to: STATUS.APPROVED, from: [STATUS.PENDING] },
  REJECT: { to: STATUS.REJECTED, from: [STATUS.PENDING] },
  SUSPEND: { to: STATUS.SUSPENDED, from: [STATUS.APPROVED] },
  REINSTATE: { to: STATUS.APPROVED, from: [STATUS.SUSPENDED] },
});

const MAX_NOTE = 500;
const MEMBERSHIP_SELECT = { restaurantId: true, status: true, requestedAt: true, reviewedAt: true, reviewNote: true };

class MembershipError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message); this.name = 'MembershipError'; this.code = code; this.statusCode = statusCode;
  }
}
function check(ok, code, message, status = 400) {
  if (!ok) throw new MembershipError(code, message, status);
}
const id = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value.trim() === value;

// Mismo criterio que lib/modules.js#restaurantHasModule: override del tenant o plan.
function tenantHasMarketplace(tenant) {
  const has = list => (list ?? []).some(key => String(key).toLowerCase() === 'marketplace');
  return has(tenant?.enabledModules) || has(tenant?.subscription?.plan?.allowedModules);
}

function view(row) {
  if (!row) return { status: 'NONE', requestedAt: null, reviewedAt: null, reviewNote: null };
  return { status: row.status, requestedAt: row.requestedAt, reviewedAt: row.reviewedAt ?? null,
    reviewNote: row.reviewNote ?? null };
}

function createMerchantMembershipService({ prismaClient, hasMarketplaceModule, now = () => new Date() } = {}) {
  function ready() {
    check(prismaClient?.marketplaceMerchantMembership && prismaClient.restaurant && typeof hasMarketplaceModule === 'function',
      'MEMBERSHIP_UNAVAILABLE', 'Directorio del marketplace no disponible', 503);
    return prismaClient;
  }
  const find = restaurantId => ready().marketplaceMerchantMembership.findUnique({ where: { restaurantId }, select: MEMBERSHIP_SELECT });

  async function getMembership({ restaurantId } = {}) {
    check(id(restaurantId), 'RESTAURANT_REQUIRED', 'Selecciona un restaurante', 400);
    const [moduleEnabled, row] = await Promise.all([hasMarketplaceModule(restaurantId), find(restaurantId)]);
    return { moduleEnabled: moduleEnabled === true, membership: view(row) };
  }

  async function requestMembership({ restaurantId, actorId } = {}) {
    check(id(restaurantId), 'RESTAURANT_REQUIRED', 'Selecciona un restaurante', 400);
    const db = ready();
    check(await hasMarketplaceModule(restaurantId) === true, 'MODULE_REQUIRED',
      'Activa el módulo Marketplace para solicitar aparecer en el directorio', 403);
    const restaurant = await db.restaurant.findFirst({ where: { id: restaurantId, isActive: true },
      select: { id: true, tenant: { select: { isDemo: true } } } });
    check(restaurant?.id === restaurantId, 'RESTAURANT_NOT_FOUND', 'Restaurante no disponible', 404);
    check(restaurant.tenant?.isDemo !== true, 'DEMO_TENANT', 'Las cuentas demo no aparecen en el directorio', 409);
    const requester = id(actorId) ? actorId : null;
    const existing = await find(restaurantId);
    if (!existing) {
      try {
        const row = await db.marketplaceMerchantMembership.create({
          data: { restaurantId, status: STATUS.PENDING, requestedById: requester, requestedAt: now() },
          select: MEMBERSHIP_SELECT });
        return { membership: view(row), created: true };
      } catch (error) {
        // Doble clic o dos pestañas: la otra solicitud ya creó la fila.
        if (error?.code !== 'P2002') throw error;
        return { membership: view(await find(restaurantId)), created: false };
      }
    }
    check(existing.status !== STATUS.SUSPENDED, 'MEMBERSHIP_SUSPENDED',
      'La plataforma suspendió tu comercio en el directorio; contacta a soporte', 409);
    if (existing.status === STATUS.REJECTED) {
      await db.marketplaceMerchantMembership.updateMany({
        where: { restaurantId, status: STATUS.REJECTED },
        data: { status: STATUS.PENDING, requestedById: requester, requestedAt: now(),
          reviewedById: null, reviewedAt: null, reviewNote: null } });
      return { membership: view(await find(restaurantId)), created: false };
    }
    // PENDING o APPROVED: repetir la solicitud no cambia nada.
    return { membership: view(existing), created: false };
  }

  async function listMemberships({ status } = {}) {
    check(status === undefined || Object.hasOwn(STATUS, status), 'INVALID_STATUS', 'Estado inválido', 400);
    const rows = await ready().marketplaceMerchantMembership.findMany({
      where: status ? { status } : {},
      select: { ...MEMBERSHIP_SELECT, restaurant: { select: { id: true, name: true, slug: true, isActive: true,
        tenant: { select: { name: true, isDemo: true, enabledModules: true,
          subscription: { select: { plan: { select: { allowedModules: true } } } } } } } } },
      orderBy: [{ requestedAt: 'asc' }, { restaurantId: 'asc' }], take: 200 });
    return rows.map(row => ({ restaurantId: row.restaurantId, ...view(row),
      restaurant: { name: row.restaurant?.name ?? null, slug: row.restaurant?.slug ?? null,
        isActive: row.restaurant?.isActive === true, tenantName: row.restaurant?.tenant?.name ?? null,
        isDemo: row.restaurant?.tenant?.isDemo === true },
      moduleEnabled: tenantHasMarketplace(row.restaurant?.tenant) }));
  }

  async function reviewMembership({ restaurantId, decision, note, actorId } = {}) {
    check(id(restaurantId), 'RESTAURANT_REQUIRED', 'Restaurante inválido', 400);
    const rule = Object.hasOwn(DECISIONS, decision) ? DECISIONS[decision] : null;
    check(rule, 'INVALID_DECISION', 'Decisión inválida', 400);
    check(note === undefined || note === null || typeof note === 'string' && note.trim().length <= MAX_NOTE,
      'INVALID_NOTE', `La nota admite hasta ${MAX_NOTE} caracteres`, 400);
    const db = ready();
    const existing = await find(restaurantId);
    check(existing, 'MEMBERSHIP_NOT_FOUND', 'Solicitud no encontrada', 404);
    check(rule.from.includes(existing.status), 'INVALID_TRANSITION',
      `No se puede ${decision.toLowerCase()} una solicitud en estado ${existing.status}`, 409);
    if (rule.to === STATUS.APPROVED) {
      check(await hasMarketplaceModule(restaurantId) === true, 'MODULE_REQUIRED',
        'El negocio no tiene el módulo Marketplace activo', 409);
    }
    // CAS sobre el estado leído: dos revisores al mismo tiempo no se pisan.
    const { count } = await db.marketplaceMerchantMembership.updateMany({
      where: { restaurantId, status: existing.status },
      data: { status: rule.to, reviewedAt: now(), reviewedById: id(actorId) ? actorId : null,
        reviewNote: typeof note === 'string' && note.trim() ? note.trim() : null } });
    check(count === 1, 'MEMBERSHIP_CHANGED', 'La solicitud cambió; actualiza la vista', 409);
    return { membership: view(await find(restaurantId)) };
  }

  return { getMembership, requestMembership, listMemberships, reviewMembership };
}

module.exports = { STATUS, DECISIONS, MembershipError, createMerchantMembershipService, tenantHasMarketplace };
