'use strict';

// C5: estado de cuenta mensual de comisiones del Mercadito (pedidos en efectivo), con dobles en memoria.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createCommissionStatements, periodRange, periodOf, parsePeriod, hashLines } = require('../src/lib/marketplace-commissions');

const PLATFORM = { accountId: 'saas-1', roles: ['SUPER_ADMIN'], isActive: true };
const OWNER = { accountId: 'owner-1', roles: ['ADMIN'], tenantId: 't1', restaurantId: 'r1', isActive: true };

function fakeDb() {
  const state = { pipelines: [], statements: [], restaurants: [
    { id: 'r1', name: "Master Burger's", tenantId: 't1' }, { id: 'r2', name: 'Bobbas', tenantId: 't2' }] };
  const inRange = (date, range) => !range || ((!range.gte || date >= range.gte) && (!range.lt || date < range.lt));
  const pick = (row, select) => {
    if (!select) return structuredClone(row);
    return Object.fromEntries(Object.entries(select).filter(([, on]) => on).map(([key]) => [key, structuredClone(row[key])]));
  };
  const statementWhere = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  const db = {
    state,
    restaurant: {
      findFirst: async ({ where, select }) => { const row = state.restaurants.find(r => r.id === where.id); return row ? pick(row, select) : null; },
      findMany: async ({ where, select }) => state.restaurants.filter(r => where.id.in.includes(r.id)).map(r => pick(r, select)),
    },
    marketplaceOrderPipeline: {
      findMany: async ({ where, take, cursor, skip = 0 }) => {
        let rows = state.pipelines.filter(p => (!where.restaurantId || p.restaurantId === where.restaurantId)
          && p.paymentMethod === where.paymentMethod && inRange(p.createdAt, where.createdAt))
          .sort((a, b) => (a.orderId < b.orderId ? -1 : 1));
        if (cursor) rows = rows.slice(rows.findIndex(p => p.orderId === cursor.orderId) + skip);
        return rows.slice(0, take).map(p => ({ orderId: p.orderId, restaurantId: p.restaurantId, createdAt: new Date(p.createdAt),
          settlement: structuredClone(p.settlement), order: { status: p.status, orderNumber: p.orderNumber } }));
      },
    },
    marketplaceCommissionStatement: {
      findFirst: async ({ where, select }) => { const row = state.statements.find(s => statementWhere(s, where)); return row ? pick(row, select) : null; },
      findMany: async ({ where, select, take }) => state.statements.filter(s => statementWhere(s, where))
        .sort((a, b) => (a.period < b.period ? 1 : -1)).slice(0, take ?? Infinity).map(s => pick(s, select)),
      create: async ({ data, select }) => {
        if (state.statements.some(s => s.restaurantId === data.restaurantId && s.period === data.period)) {
          throw Object.assign(new Error('Unique'), { code: 'P2002' });
        }
        const row = { id: 'st' + (state.statements.length + 1), currency: 'MXN', paidAt: null, paidBy: null, paymentReference: null,
          paymentNote: null, ...structuredClone(data) };
        state.statements.push(row); return pick(row, select);
      },
      updateMany: async ({ where, data }) => {
        const rows = state.statements.filter(s => statementWhere(s, where));
        rows.forEach(row => Object.assign(row, structuredClone(data)));
        return { count: rows.length };
      },
    },
    $transaction: async work => work(db),
  };
  return db;
}
let n = 0;
function order(db, extra = {}) {
  n++;
  const row = { orderId: `o${String(n).padStart(3, '0')}`, orderNumber: `M-${n}`, restaurantId: 'r1', paymentMethod: 'CASH',
    status: 'DELIVERED', createdAt: new Date('2026-10-15T18:00:00Z'),
    settlement: { subtotalCents: 20000, deliveryFeeCents: 3000, totalCents: 23000, commissionBps: 1000, commissionCents: 2000,
      platformFeeCents: 2000 }, ...extra };
  db.state.pipelines.push(row); return row;
}
const service = (db, at = '2026-11-09T18:00:00Z') => createCommissionStatements({ prisma: db, now: () => new Date(at), bypass: fn => fn() });

// ── calendario ───────────────────────────────────────────────────────────────
test('el mes es el de la Ciudad de México, no UTC', () => {
  const nov = periodRange('2026-11');
  assert.equal(nov.start.toISOString(), '2026-11-01T06:00:00.000Z');
  assert.equal(nov.end.toISOString(), '2026-12-01T06:00:00.000Z');
  assert.equal(periodRange('2026-12').end.toISOString(), '2027-01-01T06:00:00.000Z');
  assert.equal(periodOf(new Date('2026-12-01T05:59:00Z')), '2026-11');
  assert.equal(periodOf(new Date('2026-12-01T06:00:00Z')), '2026-12');
});

test('el mes se valida: formato, desde 2024 y no futuro; sin mes es el actual', () => {
  const today = new Date('2026-11-09T18:00:00Z');
  assert.equal(parsePeriod(undefined, today), '2026-11');
  assert.equal(parsePeriod('2026-10', today), '2026-10');
  for (const bad of ['2026-13', '2026-1', '2023-12', '2026-12', 202610, '2026-10; drop']) {
    assert.throws(() => parsePeriod(bad, today), error => error.code === 'INVALID_PERIOD' && error.statusCode === 400);
  }
});

// ── cálculo ──────────────────────────────────────────────────────────────────
test('solo cuenta efectivo entregado del mes y del comercio; cancelado no cobra; pendiente se avisa', async () => {
  const db = fakeDb();
  order(db);                                                     // entra: 200 / comisión 20
  order(db, { settlement: { subtotalCents: 10000, commissionCents: 500 } }); // snapshot viejo sin platformFeeCents
  order(db, { status: 'CANCELLED' });
  order(db, { paymentMethod: 'ONLINE' });
  order(db, { status: 'READY' });
  order(db, { createdAt: new Date('2026-11-01T05:59:00Z') });  // 31/oct 23:59 en CDMX: entra en octubre
  order(db, { createdAt: new Date('2026-11-01T06:00:00Z') });  // 1/nov: no
  order(db, { restaurantId: 'r2' });
  const result = await service(db).merchantDetail(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(result.status, 'TO_ISSUE');
  assert.deepEqual([result.ordersCount, result.salesCents, result.commissionCents], [3, 50000, 4500]);
  assert.deepEqual([result.cancelledCount, result.pendingCount, result.excludedCount], [1, 1, 0]);
  assert.equal(result.lines.length, 3);
  assert.deepEqual(result.lines[1], { orderId: 'o002', orderNumber: 'M-2', createdAt: '2026-10-15T18:00:00.000Z',
    subtotalCents: 10000, commissionBps: null, commissionCents: 500 });
});

test('una comisión ilegible no se cuenta en silencio: se reporta y bloquea la emisión', async () => {
  const db = fakeDb();
  order(db, { settlement: { subtotalCents: 10000, platformFeeCents: 20000 } });
  const svc = service(db);
  const detail = await svc.merchantDetail(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(detail.excludedCount, 1); assert.equal(detail.commissionCents, 0);
  await assert.rejects(svc.issue(PLATFORM, 'r1', { period: '2026-10' }), error => error.code === 'INVALID_SETTLEMENT');
});

test('el mes en curso se ve en vivo como abierto y no se puede emitir', async () => {
  const db = fakeDb();
  order(db, { createdAt: new Date('2026-11-05T18:00:00Z') });
  const svc = service(db);
  const live = await svc.merchantDetail(PLATFORM, 'r1', {});
  assert.equal(live.period, '2026-11'); assert.equal(live.status, 'OPEN'); assert.equal(live.commissionCents, 2000);
  await assert.rejects(svc.issue(PLATFORM, 'r1', { period: '2026-11' }), error => error.code === 'PERIOD_OPEN' && error.statusCode === 409);
});

// ── emisión ──────────────────────────────────────────────────────────────────
test('emitir congela líneas y totales; repetir devuelve la misma; un cambio posterior se avisa', async () => {
  const db = fakeDb();
  order(db); order(db);
  const svc = service(db);
  const first = await svc.issue(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(first.replayed, false);
  assert.equal(first.statement.status, 'ISSUED'); assert.equal(first.statement.commissionCents, 4000);
  assert.equal(first.statement.issuedBy, 'saas-1');
  const stored = db.state.statements[0];
  assert.equal(stored.linesHash, hashLines(stored.lines)); assert.equal(stored.lines.length, 2);
  assert.equal((await svc.issue(PLATFORM, 'r1', { period: '2026-10' })).replayed, true);
  assert.equal(db.state.statements.length, 1);
  assert.equal((await svc.merchantDetail(PLATFORM, 'r1', { period: '2026-10' })).changedSinceIssue, false);
  db.state.pipelines[0].status = 'CANCELLED';
  const after = await svc.merchantDetail(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(after.commissionCents, 4000, 'lo emitido no cambia'); assert.equal(after.changedSinceIssue, true);
});

test('con pedidos del mes sin cerrar o sin pedidos, no se emite', async () => {
  const db = fakeDb();
  const svc = service(db);
  await assert.rejects(svc.issue(PLATFORM, 'r1', { period: '2026-10' }), error => error.code === 'NOTHING_TO_ISSUE');
  order(db); order(db, { status: 'ON_THE_WAY' });
  await assert.rejects(svc.issue(PLATFORM, 'r1', { period: '2026-10' }),
    error => error.code === 'ORDERS_PENDING' && /1 pedido/.test(error.message));
  assert.equal(db.state.statements.length, 0);
});

test('con 0% (piloto) la emisión queda pagada en el mismo acto', async () => {
  const db = fakeDb();
  order(db, { settlement: { subtotalCents: 20000, commissionBps: 0, commissionCents: 0, platformFeeCents: 0 } });
  const { statement } = await service(db).issue(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(statement.status, 'PAID'); assert.equal(statement.commissionCents, 0);
  assert.equal(statement.paymentReference, 'Sin comisión (0%)'); assert.equal(statement.paidBy, 'saas-1');
});

test('si otra emisión gana la carrera, se devuelve la que quedó', async () => {
  const db = fakeDb();
  order(db);
  const create = db.marketplaceCommissionStatement.create;
  db.marketplaceCommissionStatement.create = async args => {
    await create({ ...args, data: { ...args.data, issuedBy: 'otra-instancia' } });
    throw Object.assign(new Error('Unique'), { code: 'P2002' });
  };
  const result = await service(db).issue(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(result.replayed, true); assert.equal(result.statement.issuedBy, 'otra-instancia');
});

test('la emisión rechaza campos extra y mes faltante', async () => {
  const svc = service(fakeDb());
  await assert.rejects(svc.issue(PLATFORM, 'r1', { period: '2026-10', commissionCents: 1 }), error => error.code === 'INVALID_REQUEST');
  await assert.rejects(svc.issue(PLATFORM, 'r1', {}), error => error.code === 'INVALID_PERIOD');
  await assert.rejects(svc.issue(PLATFORM, 'no existe!', { period: '2026-10' }), error => error.code === 'INVALID_MERCHANT');
  await assert.rejects(svc.issue(PLATFORM, 'r9', { period: '2026-10' }), error => error.code === 'MERCHANT_NOT_FOUND');
});

// ── pago ─────────────────────────────────────────────────────────────────────
test('marcar pagado exige referencia, solo pasa de emitido a pagado y el reintento es idempotente', async () => {
  const db = fakeDb();
  order(db);
  const svc = service(db);
  await assert.rejects(svc.markPaid(PLATFORM, 'r1', { period: '2026-10', reference: 'SPEI-1' }), error => error.code === 'STATEMENT_NOT_FOUND');
  await svc.issue(PLATFORM, 'r1', { period: '2026-10' });
  await assert.rejects(svc.markPaid(PLATFORM, 'r1', { period: '2026-10' }), error => error.code === 'INVALID_REQUEST');
  await assert.rejects(svc.markPaid(PLATFORM, 'r1', { period: '2026-10', reference: 'a\nb' }), error => error.code === 'INVALID_REQUEST');
  const paid = await svc.markPaid(PLATFORM, 'r1', { period: '2026-10', reference: '  SPEI 123456 ', note: 'Transferencia BBVA' });
  assert.equal(paid.replayed, false); assert.equal(paid.statement.status, 'PAID');
  assert.equal(paid.statement.paymentReference, 'SPEI 123456'); assert.equal(paid.statement.paymentNote, 'Transferencia BBVA');
  assert.equal(paid.statement.paidAt, '2026-11-09T18:00:00.000Z');
  assert.equal((await svc.markPaid(PLATFORM, 'r1', { period: '2026-10', reference: 'SPEI 123456' })).replayed, true);
  await assert.rejects(svc.markPaid(PLATFORM, 'r1', { period: '2026-10', reference: 'OTRO-PAGO' }), error => error.code === 'ALREADY_PAID' && error.statusCode === 409);
});

// ── permisos y vistas ────────────────────────────────────────────────────────
test('solo la plataforma lista, emite y paga; FINANCE de un comercio no es plataforma', async () => {
  const svc = service(fakeDb());
  const merchantFinance = { accountId: 'f1', roles: ['FINANCE'], tenantId: 't1', restaurantId: 'r1' };
  for (const actor of [OWNER, merchantFinance]) {
    await assert.rejects(svc.listPeriod(actor, {}), error => error.code === 'COMMISSIONS_FORBIDDEN' && error.statusCode === 403);
    await assert.rejects(svc.issue(actor, 'r1', { period: '2026-10' }), error => error.code === 'COMMISSIONS_FORBIDDEN');
    await assert.rejects(svc.markPaid(actor, 'r1', { period: '2026-10', reference: 'x12' }), error => error.code === 'COMMISSIONS_FORBIDDEN');
  }
  await assert.rejects(svc.listPeriod(null, {}), error => error.statusCode === 401);
  await svc.listPeriod({ accountId: 'fin', roles: ['FINANCE'] }, {});
});

test('el comercio ve solo lo suyo: su mes, su historial; otro tenant o comercio se rechaza', async () => {
  const db = fakeDb();
  order(db); order(db, { restaurantId: 'r2' });
  await service(db).issue(PLATFORM, 'r1', { period: '2026-10' });
  const svc = service(db);
  const mine = await svc.merchantStatements(OWNER, { period: '2026-10' });
  assert.equal(mine.statement.restaurantId, 'r1'); assert.equal(mine.statement.status, 'ISSUED');
  assert.equal(mine.history.length, 1); assert.equal(mine.history[0].lines, undefined);
  assert.equal(mine.currentPeriod, '2026-11');
  await assert.rejects(svc.merchantStatements(OWNER, { restaurantId: 'r2' }), error => error.code === 'MERCHANT_FORBIDDEN');
  await assert.rejects(svc.merchantStatements({ ...OWNER, tenantId: 't2' }, {}), error => error.code === 'MERCHANT_FORBIDDEN');
  await assert.rejects(svc.merchantStatements({ ...OWNER, roles: ['CASHIER'] }, {}), error => error.code === 'MERCHANT_FORBIDDEN');
});

test('la lista de la plataforma junta emitidos y en vivo con totales por estado', async () => {
  const db = fakeDb();
  order(db); order(db, { restaurantId: 'r2', settlement: { subtotalCents: 50000, platformFeeCents: 5000 } });
  const svc = service(db);
  await svc.issue(PLATFORM, 'r1', { period: '2026-10' });
  const list = await svc.listPeriod(PLATFORM, { period: '2026-10' });
  assert.deepEqual(list.items.map(item => [item.restaurantName, item.status, item.commissionCents]),
    [['Bobbas', 'TO_ISSUE', 5000], ["Master Burger's", 'ISSUED', 2000]]);
  assert.deepEqual(list.totals, { merchants: 2, commissionCents: 7000, paidCents: 0, issuedCents: 2000, unissuedCents: 5000 });
  assert.equal(list.items[1].lines, undefined, 'la lista no manda líneas');
});

test('recorre en páginas: más de 500 pedidos suman completos', async () => {
  const db = fakeDb();
  for (let i = 0; i < 1203; i++) order(db, { settlement: { subtotalCents: 1000, platformFeeCents: 100 } });
  const detail = await service(db).merchantDetail(PLATFORM, 'r1', { period: '2026-10' });
  assert.equal(detail.ordersCount, 1203); assert.equal(detail.commissionCents, 120300);
});

// ── rutas ────────────────────────────────────────────────────────────────────
test('las rutas pasan actor, parámetros y cuerpo, y traducen errores', async () => {
  const createRouter = require('../src/routes/marketplace-settlements-v1.routes');
  const { CommissionError } = require('../src/lib/marketplace-commissions');
  const routes = [];
  const Router = () => { const r = {}; for (const verb of ['get', 'post']) r[verb] = (path, handler) => routes.push([verb, path, handler]); return r; };
  const calls = [];
  const commissionService = {
    listPeriod: async (actor, query) => { calls.push(['list', actor.accountId, query]); return { items: [] }; },
    merchantDetail: async (actor, id, query) => { calls.push(['detail', id, query]); return { id }; },
    issue: async (actor, id, body) => { calls.push(['issue', id, body]); throw new CommissionError('ORDERS_PENDING', 'pendientes', 409); },
    markPaid: async (actor, id, body) => { calls.push(['pay', id, body]); return { statement: {} }; },
    merchantStatements: async () => { throw Object.assign(new Error('db'), { code: 'P1001' }); },
  };
  createRouter({ Router, commissionService, resolveActor: async () => PLATFORM });
  const call = async (verb, path, req) => {
    const handler = routes.find(([v, p]) => v === verb && p === path)[2];
    const res = { code: 200, headers: {}, set(k, v) { this.headers[k] = v; }, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } };
    await handler({ query: {}, params: {}, body: {}, headers: {}, ...req }, res); return res;
  };
  assert.equal((await call('get', '/ops/commissions', { query: { period: '2026-10' } })).code, 200);
  assert.equal((await call('get', '/ops/commissions/:restaurantId', { params: { restaurantId: 'r1' } })).body.id, 'r1');
  const issued = await call('post', '/ops/commissions/:restaurantId/issue', { params: { restaurantId: 'r1' }, body: { period: '2026-10' } });
  assert.equal(issued.code, 409); assert.equal(issued.body.errorCode, 'ORDERS_PENDING');
  assert.equal((await call('post', '/ops/commissions/:restaurantId/pay', { params: { restaurantId: 'r1' }, body: { period: '2026-10', reference: 'x' } })).code, 200);
  const failed = await call('get', '/merchant/commissions', {});
  assert.equal(failed.code, 503); assert.equal(failed.body.errorCode, 'SETTLEMENTS_UNAVAILABLE'); assert.equal(failed.headers['Cache-Control'], 'no-store');
  assert.deepEqual(calls.map(c => c[0]), ['list', 'detail', 'issue', 'pay']);
  assert.deepEqual(calls[0][2], { period: '2026-10' });
});
