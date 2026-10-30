'use strict';

// Aprobación de comercios para el directorio del marketplace y módulo
// "marketplace" por negocio. Sin BD: Prisma y la verificación del módulo son fakes.
//   node --test apps/backend/scripts/marketplace-merchant-membership.test.cjs

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createMerchantMembershipService, tenantHasMarketplace, STATUS } = require('../src/lib/marketplace-merchant-membership');
const { createCatalog, createPrismaCatalogAdapter } = require('../src/lib/marketplace-catalog');
const { MODULE_CATALOG, VALID_MODULE_KEYS, MODULE_DEFINITIONS } = require('../src/lib/tenantModules');

const T0 = new Date('2026-10-24T12:00:00.000Z');

function fakeDb({ restaurants = [{ id: 'r1', isActive: true, tenant: { isDemo: false } }] } = {}) {
  const rows = new Map();
  const pick = row => row && { restaurantId: row.restaurantId, status: row.status, requestedAt: row.requestedAt,
    reviewedAt: row.reviewedAt ?? null, reviewNote: row.reviewNote ?? null, requestedById: row.requestedById ?? null,
    reviewedById: row.reviewedById ?? null };
  const db = {
    rows,
    conflictNextUpdate: false,
    restaurant: {
      async findFirst({ where }) {
        const r = restaurants.find(x => x.id === where.id && (where.isActive === undefined || x.isActive === where.isActive));
        return r ? { id: r.id, tenant: r.tenant } : null;
      },
    },
    marketplaceMerchantMembership: {
      async findUnique({ where }) { return pick(rows.get(where.restaurantId)) ?? null; },
      async create({ data }) {
        if (rows.has(data.restaurantId)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        rows.set(data.restaurantId, { ...data });
        return pick(rows.get(data.restaurantId));
      },
      async updateMany({ where, data }) {
        const row = rows.get(where.restaurantId);
        if (db.conflictNextUpdate) { db.conflictNextUpdate = false; return { count: 0 }; }
        if (!row || row.status !== where.status) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      async findMany({ where }) {
        return [...rows.values()].filter(row => !where.status || row.status === where.status).map(row => ({
          ...pick(row),
          restaurant: { id: row.restaurantId, name: 'Master Burguer\'s', slug: 'master', isActive: true,
            tenant: { name: 'Master', isDemo: false, enabledModules: ['marketplace'], subscription: null } },
        }));
      },
    },
  };
  return db;
}

function service({ db = fakeDb(), module = true } = {}) {
  let clock = T0;
  const svc = createMerchantMembershipService({ prismaClient: db,
    hasMarketplaceModule: async () => (typeof module === 'function' ? module() : module), now: () => clock });
  return { svc, db, tick: ms => { clock = new Date(clock.getTime() + ms); } };
}

const rejects = (promise, code, status) => assert.rejects(promise, e => e.code === code && e.statusCode === status);

test('el módulo marketplace existe en el catálogo único y se puede activar por negocio', () => {
  const def = MODULE_CATALOG.find(m => m.key === 'marketplace');
  assert.deepEqual(def, { key: 'marketplace', kind: 'key', requiresPlan: true, legacyFlag: null, aliases: [], planFlag: null });
  assert.equal(VALID_MODULE_KEYS.has('marketplace'), true);
  assert.deepEqual(MODULE_DEFINITIONS.MARKETPLACE, { planKeys: ['marketplace'] });
  assert.equal(tenantHasMarketplace({ enabledModules: ['kds', 'marketplace'] }), true);
  assert.equal(tenantHasMarketplace({ enabledModules: [], subscription: { plan: { allowedModules: ['MARKETPLACE'] } } }), true);
  assert.equal(tenantHasMarketplace({ enabledModules: ['webstore'] }), false);
});

test('sin el módulo activo no se puede solicitar aparecer en el directorio', async () => {
  const { svc, db } = service({ module: false });
  await rejects(svc.requestMembership({ restaurantId: 'r1', actorId: 'u1' }), 'MODULE_REQUIRED', 403);
  assert.equal(db.rows.size, 0);
  assert.deepEqual(await svc.getMembership({ restaurantId: 'r1' }),
    { moduleEnabled: false, membership: { status: 'NONE', requestedAt: null, reviewedAt: null, reviewNote: null } });
});

test('una cuenta demo o un restaurante inactivo no entran al directorio', async () => {
  const demo = service({ db: fakeDb({ restaurants: [{ id: 'r1', isActive: true, tenant: { isDemo: true } }] }) });
  await rejects(demo.svc.requestMembership({ restaurantId: 'r1' }), 'DEMO_TENANT', 409);
  const inactive = service({ db: fakeDb({ restaurants: [{ id: 'r1', isActive: false, tenant: { isDemo: false } }] }) });
  await rejects(inactive.svc.requestMembership({ restaurantId: 'r1' }), 'RESTAURANT_NOT_FOUND', 404);
});

test('la solicitud queda pendiente y repetirla no cambia nada', async () => {
  const { svc, db } = service();
  const first = await svc.requestMembership({ restaurantId: 'r1', actorId: 'u1' });
  assert.equal(first.created, true);
  assert.equal(first.membership.status, STATUS.PENDING);
  assert.equal(db.rows.get('r1').requestedById, 'u1');
  const again = await svc.requestMembership({ restaurantId: 'r1', actorId: 'u2' });
  assert.equal(again.created, false);
  assert.equal(again.membership.status, STATUS.PENDING);
  assert.equal(db.rows.get('r1').requestedById, 'u1');
});

test('la plataforma aprueba, suspende y reactiva; nunca salta estados', async () => {
  const { svc, db } = service();
  await svc.requestMembership({ restaurantId: 'r1' });
  await rejects(svc.reviewMembership({ restaurantId: 'r1', decision: 'SUSPEND' }), 'INVALID_TRANSITION', 409);
  const approved = await svc.reviewMembership({ restaurantId: 'r1', decision: 'APPROVE', note: '  Menú completo  ', actorId: 'admin' });
  assert.equal(approved.membership.status, STATUS.APPROVED);
  assert.equal(approved.membership.reviewNote, 'Menú completo');
  assert.equal(db.rows.get('r1').reviewedById, 'admin');
  // Un comercio aprobado que vuelve a solicitar sigue aprobado.
  assert.equal((await svc.requestMembership({ restaurantId: 'r1' })).membership.status, STATUS.APPROVED);
  assert.equal((await svc.reviewMembership({ restaurantId: 'r1', decision: 'SUSPEND' })).membership.status, STATUS.SUSPENDED);
  await rejects(svc.requestMembership({ restaurantId: 'r1' }), 'MEMBERSHIP_SUSPENDED', 409);
  assert.equal((await svc.reviewMembership({ restaurantId: 'r1', decision: 'REINSTATE' })).membership.status, STATUS.APPROVED);
});

test('un comercio rechazado puede volver a solicitar y su revisión anterior se limpia', async () => {
  const { svc, tick } = service();
  await svc.requestMembership({ restaurantId: 'r1' });
  await svc.reviewMembership({ restaurantId: 'r1', decision: 'REJECT', note: 'Faltan fotos' });
  tick(60000);
  const back = await svc.requestMembership({ restaurantId: 'r1', actorId: 'u3' });
  assert.equal(back.membership.status, STATUS.PENDING);
  assert.equal(back.membership.reviewNote, null);
  assert.equal(back.membership.reviewedAt, null);
  assert.equal(back.membership.requestedAt.getTime(), T0.getTime() + 60000);
});

test('no se aprueba un comercio sin el módulo ni con datos inválidos', async () => {
  let enabled = true;
  const { svc, db } = service({ module: () => enabled });
  await svc.requestMembership({ restaurantId: 'r1' });
  enabled = false;
  await rejects(svc.reviewMembership({ restaurantId: 'r1', decision: 'APPROVE' }), 'MODULE_REQUIRED', 409);
  enabled = true;
  await rejects(svc.reviewMembership({ restaurantId: 'r1', decision: 'BORRAR' }), 'INVALID_DECISION', 400);
  await rejects(svc.reviewMembership({ restaurantId: 'r1', decision: 'APPROVE', note: 'x'.repeat(501) }), 'INVALID_NOTE', 400);
  await rejects(svc.reviewMembership({ restaurantId: 'otro', decision: 'APPROVE' }), 'MEMBERSHIP_NOT_FOUND', 404);
  // Dos revisores al mismo tiempo: el segundo ve que la solicitud ya cambió.
  db.conflictNextUpdate = true;
  await rejects(svc.reviewMembership({ restaurantId: 'r1', decision: 'APPROVE' }), 'MEMBERSHIP_CHANGED', 409);
  assert.equal(db.rows.get('r1').status, STATUS.PENDING);
});

test('la lista de la plataforma filtra por estado y dice si el negocio tiene el módulo', async () => {
  const { svc } = service();
  await svc.requestMembership({ restaurantId: 'r1' });
  const pending = await svc.listMemberships({ status: 'PENDING' });
  assert.equal(pending.length, 1);
  assert.equal(pending[0].restaurant.slug, 'master');
  assert.equal(pending[0].moduleEnabled, true);
  assert.equal((await svc.listMemberships({ status: 'APPROVED' })).length, 0);
  await rejects(svc.listMemberships({ status: 'TODOS' }), 'INVALID_STATUS', 400);
});

test('sin el directorio por aprobación el catálogo sigue igual: lista vacía no toca la BD', async () => {
  const catalog = createCatalog({ getAdapter: () => assert.fail('Database must not load') });
  assert.equal((await catalog.listStores({})).total, 0);
});

test('con el directorio por aprobación se publican los comercios aprobados con el módulo', async () => {
  const calls = [];
  const prisma = { restaurant: {
    async count(args) { calls.push(args); return 0; },
    async findMany(args) { calls.push(args); return []; },
  } };
  const catalog = createCatalog({ includeApproved: true, getAdapter: () => createPrismaCatalogAdapter(prisma) });
  await catalog.listStores({});
  const approvedBranch = {
    marketplaceMembership: { is: { status: 'APPROVED' } },
    tenant: { is: { isDemo: false, OR: [
      { enabledModules: { hasSome: ['marketplace', 'MARKETPLACE'] } },
      { subscription: { is: { plan: { is: { allowedModules: { hasSome: ['marketplace', 'MARKETPLACE'] } } } } } },
    ] } },
  };
  assert.deepEqual(calls[1].where, { isActive: true, OR: [
    { slug: { in: [] }, tenant: { is: { hasWebStore: true, isDemo: false } } }, approvedBranch] });
  calls.length = 0;
  await catalog.listProducts({ store: 'master' });
  assert.deepEqual(calls[0].where, { isActive: true, slug: 'master', OR: [
    { slug: { in: [] }, tenant: { is: { hasWebStore: true, isDemo: false } } }, approvedBranch] });
});
